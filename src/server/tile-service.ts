import type { Variable, Domain, Range } from '$lib/types';
import { domains as knownDomains } from '$lib/utils/domains';
import { getInterpolator, getColorScale } from '$lib/utils/color-scales';
import { tile2lat, tile2lon, getIndexFromLatLong, getIndicesFromBounds } from '$lib/utils/math';
import { tileBoundsFromZXY } from './om-url';
import { DynamicProjection, ProjectionGrid, type Projection } from '$lib/utils/projection';
import { encodeRgbaToPng } from './png';
import { OmHttpBackend, OmDataType, FileBackendNode, OmFileReader, type TypedArray } from '@openmeteo/file-reader';
import { dbg, timeStart, timeEnd } from './log';
import { overlayWindArrowsOnRgba } from './wind-overlay';

export type Zxy = { z: number; x: number; y: number };

const TILE_SIZE = 256;

// --- Wind helpers & cache ---
const WIND_CACHE_TTL_MS = Number(process.env.WIND_CACHE_TTL_MS ?? 120_000);
type CacheEntry = { ts: number; data: Float32Array };
const variableCacheByKey = new Map<string, CacheEntry>();

// Pool de readers (partagé U/V et entre tuiles pour un même fichier .om)
const readerPromiseByKey = new Map<string, Promise<OmFileReader>>();

// --- Metrics batch (agrégation courte) ---
const METRICS_IDLE_MS = Number(process.env.METRICS_IDLE_MS ?? 400);
const ENABLE_METRICS = (process.env.METRICS ?? '1') !== '0';
let metrics = { tiles: 0, totalMs: 0, cacheHits: 0, cacheMisses: 0 };
let metricsTimer: NodeJS.Timeout | null = null;

function bumpCacheHit() { metrics.cacheHits++; }
function bumpCacheMiss() { metrics.cacheMisses++; }
function bumpTile(durationMs: number) { metrics.tiles++; metrics.totalMs += durationMs; }
function scheduleEmitMetrics() {
  if (!ENABLE_METRICS) return;
  if (metricsTimer) clearTimeout(metricsTimer);
  metricsTimer = setTimeout(() => {
    const reads = metrics.cacheHits + metrics.cacheMisses;
    const ratio = reads > 0 ? metrics.cacheHits / reads : 0;
    const avg = metrics.tiles > 0 ? metrics.totalMs / metrics.tiles : 0;
    dbg('metrics:batch', { tiles: metrics.tiles, avgMs: Math.round(avg), cacheHits: metrics.cacheHits, cacheMisses: metrics.cacheMisses, cacheRatio: Number(ratio.toFixed(3)) });
    metrics = { tiles: 0, totalMs: 0, cacheHits: 0, cacheMisses: 0 };
    metricsTimer = null;
  }, METRICS_IDLE_MS);
}

function computeWindIntensity(u: Float32Array, v: Float32Array): Float32Array {
  const n = Math.min(u.length, v.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const uu = u[i];
    const vv = v[i];
    out[i] = Number.isFinite(uu) && Number.isFinite(vv) ? Math.hypot(uu, vv) : NaN;
  }
  return out;
}

function rangesKey(ranges: Range[]): string {
  const r0 = ranges[0];
  const r1 = ranges[1];
  return `${r0.start}-${r0.end}|${r1.start}-${r1.end}`;
}

function normalizeUrlWithoutVariable(omUrl: string): string {
  const u = new URL(omUrl);
  // Remove variable param
  u.searchParams.delete('variable');
  // Sort remaining params for stable key
  const sorted = new URLSearchParams();
  Array.from(u.searchParams.keys())
    .sort()
    .forEach((k) => {
      const vals = u.searchParams.getAll(k);
      vals.forEach((val) => sorted.append(k, val));
    });
  const qs = sorted.toString();
  return `${u.origin}${u.pathname}${qs ? `?${qs}` : ''}`;
}

function getBaseFileUrl(omUrl: string): string {
  const u = new URL(omUrl);
  // Ignore all query parameters to pool per actual file
  return `${u.origin}${u.pathname}`;
}

function cloneOmUrlWithVariable(omUrl: string, variableName: string): string {
  const u = new URL(omUrl);
  u.searchParams.set('variable', variableName);
  return u.toString();
}

async function readVariableValuesCached(
  omUrl: string,
  variableName: string,
  ranges: Range[]
): Promise<Float32Array> {
  const base = normalizeUrlWithoutVariable(omUrl);
  const key = `${base}|${variableName}|${rangesKey(ranges)}`;
  const now = Date.now();
  const cached = variableCacheByKey.get(key);
  if (cached && now - cached.ts < WIND_CACHE_TTL_MS) {
    dbg('cache:hit', { key }); bumpCacheHit(); scheduleEmitMetrics();
    return cached.data;
  }
  dbg('cache:miss_fetch_s3', { key }); bumpCacheMiss(); scheduleEmitMetrics();
  const data = await readVariableValues(cloneOmUrlWithVariable(omUrl, variableName), { value: variableName, label: variableName }, ranges);
  variableCacheByKey.set(key, { ts: now, data });
  return data;
}

function pickDomain(domainValue: string): Domain {
  const d = knownDomains.find((dm) => dm.value === domainValue);
  if (!d) throw new Error(`Domain unknown: ${domainValue}`);
  return d;
}

function getNxFromRanges(domain: Domain, ranges: Range[]): number {
  return ranges && ranges[1] ? ranges[1].end - ranges[1].start : domain.grid.nx;
}

function computeRangesFull(domain: Domain): Range[] {
  return [
    { start: 0, end: domain.grid.ny },
    { start: 0, end: domain.grid.nx }
  ];
}

function computeRangesForTile(coords: Zxy, domain: Domain): Range[] {
  // bounds: [west, south, east, north]
  const [w, s, e, n] = tileBoundsFromZXY(coords);
  const [minX, minY, maxX, maxY] = getIndicesFromBounds(s, w, n, e, domain);
  return [
    { start: minY, end: maxY },
    { start: minX, end: maxX }
  ];
}

function mapValueToColor(variable: Variable, value: number, colorScale = getColorScale(variable)) {
  if (Number.isNaN(value) || value === Infinity || value === -Infinity) {
    return [0, 0, 0, 0];
  }
  const idx = Math.min(
    colorScale.colors.length - 1,
    Math.max(0, Math.floor((value - colorScale.min) / colorScale.scalefactor))
  );
  const color = colorScale.colors[idx] || [0, 0, 0];
  const opacityPct = Math.max(0, Math.min(100, Number(process.env.OPACITY ?? 100)));
  const opacityFactor = opacityPct / 100;

  let alphaFactor = 1; // par défaut, opacité pleine comme avant
  const v = variable.value || '';
  if (v === 'cloud_cover' || v.startsWith('cloud') || v === 'thunderstorm_probability' || v.startsWith('thunderstorm')) {
    // Ancienne règle: alpha ~ px^1.5 / 1000
    alphaFactor = Math.max(0, Math.min(1, Math.pow(value, 1.5) / 1000));
  } else if (v.startsWith('wind')) {
    // Ancienne règle: alpha croît de 2 à 14 (ici unités m/s comme demandé)
    alphaFactor = Math.max(0, Math.min(1, (value - 2) / 12));
  } else if (v.startsWith('precipitation') || v.startsWith('rain')) {
    // Ancienne règle: alpha croît jusqu'à 1.5
    alphaFactor = Math.max(0, Math.min(1, value / 1.5));
  }

  const a = Math.round(255 * opacityFactor * alphaFactor);
  return [color[0], color[1], color[2], a];
}

export function renderRgbaTile(
  coords: Zxy,
  domain: Domain,
  variable: Variable,
  values: Float32Array,
  ranges: Range[]
): Uint8Array {
  dbg('renderRgbaTile:start', { coords, domain: domain.value, variable: variable.value, nx: domain.grid.nx, ny: domain.grid.ny, ranges });
  const colorScale = getColorScale(variable);
  const interpolator = getInterpolator(colorScale);

  const projection: Projection | null = domain.grid.projection
    ? (new DynamicProjection(domain.grid.projection.name, domain.grid.projection) as Projection)
    : null;
  const projectionGrid = projection ? new ProjectionGrid(projection, domain.grid, ranges) : null;

  const nx = getNxFromRanges(domain, ranges);
  const rgba = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);

  for (let i = 0; i < TILE_SIZE; i++) {
    const lat = tile2lat(coords.y + i / TILE_SIZE, coords.z);
    for (let j = 0; j < TILE_SIZE; j++) {
      const idxPix = (i * TILE_SIZE + j) * 4;
      const lon = tile2lon(coords.x + j / TILE_SIZE, coords.z);

      let index = NaN, xFraction = 0, yFraction = 0;
      if (projectionGrid) {
        const point = projectionGrid.findPointInterpolated(lat, lon);
        index = point.index; xFraction = point.xFraction; yFraction = point.yFraction;
      } else {
        const res = getIndexFromLatLong(lat, lon, domain, ranges);
        index = res.index; xFraction = res.xFraction; yFraction = res.yFraction;
      }

      if (Number.isNaN(index)) {
        rgba[idxPix + 0] = 0; rgba[idxPix + 1] = 0; rgba[idxPix + 2] = 0; rgba[idxPix + 3] = 0;
        continue;
      }

      const v = interpolator(values as unknown as Float32Array, nx, index, xFraction, yFraction);
      const [r, g, b, a] = mapValueToColor(variable, v, colorScale);
      rgba[idxPix + 0] = r; rgba[idxPix + 1] = g; rgba[idxPix + 2] = b; rgba[idxPix + 3] = a;
    }
  }

  dbg('renderRgbaTile:end', { filled: rgba.length });
  return rgba;
}

export async function readVariableValues(omUrl: string, variable: Variable, ranges: Range[]): Promise<Float32Array> {
  dbg('readVariableValues:start', { omUrl, variable: variable.value, ranges });
  // Priorité aux tests locaux via un fichier .om fourni
  const localPath = process.env.OM_FILE_PATH;
  const readerKey = localPath ? `file:${localPath}` : `http:${getBaseFileUrl(omUrl)}`;
  let readerPromise = readerPromiseByKey.get(readerKey);
  if (!readerPromise) {
    readerPromise = (async () => {
      if (localPath) {
        dbg('readVariableValues:FileBackendNode', { localPath });
        const fb = new FileBackendNode(localPath);
        const t0 = timeStart('OmFileReader.create');
        const r = await OmFileReader.create(fb);
        timeEnd('OmFileReader.create', t0);
        return r;
      } else {
        const backend = new OmHttpBackend({ url: getBaseFileUrl(omUrl), eTagValidation: false });
        const t1 = timeStart('OmHttpBackend.asCachedReader');
        const r = await backend.asCachedReader();
        timeEnd('OmHttpBackend.asCachedReader', t1);
        return r;
      }
    })();
    readerPromiseByKey.set(readerKey, readerPromise);
  }
  const reader = await readerPromise;
  const t2 = timeStart('getChildByName');
  const child = await reader.getChildByName(variable.value);
  if (!child) {
    throw new Error(`Variable not found: ${variable.value}`);
  }
  timeEnd('getChildByName', t2);
  const t3 = timeStart('read(FloatArray)');
  const floatArray = await child.read(OmDataType.FloatArray, ranges);
  timeEnd('read(FloatArray)', t3);
  dbg('readVariableValues:end', { length: (floatArray as Float32Array)?.length });
  return floatArray as Float32Array;
}

export async function generateTilePngFromRoute(
  params: { domain: string; variable: string } & Zxy,
  omUrl: string
): Promise<Buffer> {
  const t0 = timeStart('generateTilePngFromRoute');
  const domain = pickDomain(params.domain);
  const variable: Variable = { value: params.variable, label: params.variable };
  // Lecture partielle basée sur la tuile
  const ranges = computeRangesForTile({ z: params.z, x: params.x, y: params.y }, domain);
  dbg('generateTilePngFromRoute:ranges', { ranges });
  let rgba: Uint8Array;
  if (variable.value === 'wind_10m') {
    try {
      const [u, v] = await Promise.all([
        readVariableValuesCached(omUrl, 'wind_u_component_10m', ranges),
        readVariableValuesCached(omUrl, 'wind_v_component_10m', ranges)
      ]);
      const intensity = computeWindIntensity(u, v);
      rgba = renderRgbaTile({ z: params.z, x: params.x, y: params.y }, domain, { value: 'wind_10m', label: 'wind_10m' }, intensity, ranges);
      // Flèches par défaut activées
      rgba = overlayWindArrowsOnRgba({
        rgba,
        coords: { z: params.z, x: params.x, y: params.y },
        domain,
        ranges,
        u,
        v,
        options: {
          stepPx: Number(process.env.WIND_ARROW_STEP ?? 16),
          minZoom: Number(process.env.WIND_ARROW_MIN_ZOOM ?? 4),
          minSpeed: Number(process.env.WIND_ARROW_MIN_SPEED ?? 2),
          scale: Number(process.env.WIND_ARROW_SCALE ?? 0.6),
          alphaMin: Number(process.env.WIND_ARROW_ALPHA_MIN ?? 0.4),
          alphaMax: Number(process.env.WIND_ARROW_ALPHA_MAX ?? 0.9),
          color: [0, 0, 0]
        }
      });
    } catch (e) {
      // Fallback lecture brute
      dbg('wind_10m:fallback', { reason: 'U/V missing', err: String(e) });
      const values = await readVariableValues(omUrl, { value: 'wind_10m', label: 'wind_10m' }, ranges);
      rgba = renderRgbaTile({ z: params.z, x: params.x, y: params.y }, domain, { value: 'wind_10m', label: 'wind_10m' }, values, ranges);
    }
  } else {
    const values = await readVariableValues(omUrl, variable, ranges);
    rgba = renderRgbaTile({ z: params.z, x: params.x, y: params.y }, domain, variable, values, ranges);
  }
  const t1 = timeStart('encodeRgbaToPng');
  const png = encodeRgbaToPng(rgba, TILE_SIZE, TILE_SIZE);
  timeEnd('encodeRgbaToPng', t1);
  const ms = timeEnd('generateTilePngFromRoute', t0);
  bumpTile(ms); scheduleEmitMetrics();
  return png;
}


