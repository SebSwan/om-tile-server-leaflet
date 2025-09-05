import { tileBoundsFromZXY } from './om-url';
import { dbg, timeStart, timeEnd } from './log';
import { pad } from '$lib/utils/pad';

type Zxy = { z: number; x: number; y: number };

const METEO_BASE = 'https://map-tiles.open-meteo.com/data_spatial';

const cacheLatest = new Map<string, { json: any; ts: number }>();
const cacheHeadOk = new Map<string, number>();

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function head(url: string, timeoutMs = 2000): Promise<boolean> {
  const key = `head:${url}`;
  const now = Date.now();
  const cached = cacheHeadOk.get(key);
  if (cached && now - cached < 60_000) return true;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    if (res.ok) {
      cacheHeadOk.set(key, now);
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function buildPath(modelRun: Date, time: Date): string {
  const Y = modelRun.getUTCFullYear();
  const M = pad(modelRun.getUTCMonth() + 1);
  const D = pad(modelRun.getUTCDate());
  const H = pad(modelRun.getUTCHours());
  const tY = time.getUTCFullYear();
  const tM = pad(time.getUTCMonth() + 1);
  const tD = pad(time.getUTCDate());
  const tH = pad(time.getUTCHours());
  return `${Y}/${M}/${D}/${H}00Z/${tY}-${tM}-${tD}T${tH}00.om`;
}

export async function resolveOmUrl(
  domain: string,
  variable: string,
  zxy: Zxy,
  opts: { maxRetries?: number; retryHours?: number[] } = {}
): Promise<{ omUrl: string; modelRun: Date; time: Date; source: 'env'|'latest'|'in-progress' }>{
  // Overrides
  const override = process.env.OM_FILE_URL;
  if (override) {
    dbg('resolveOmUrl:override', { override });
    const u = new URL(override);
    const bounds = tileBoundsFromZXY(zxy);
    const [w, s, e, n] = bounds;
    u.searchParams.set('variable', variable);
    u.searchParams.set('bounds', `${s},${w},${n},${e}`);
    u.searchParams.set('partial', 'false');
    dbg('resolveOmUrl:override:final', { url: u.toString() });
    return { omUrl: u.toString(), modelRun: new Date(0), time: new Date(0), source: 'env' };
  }

  // latest/in-progress metadata (cache 60s)
  const key = `latest:${domain}`;
  const now = Date.now();
  let latestJson: any | null = null;
  const cached = cacheLatest.get(key);
  if (cached && now - cached.ts < 60_000) latestJson = cached.json;
  if (!latestJson) {
    try {
      const t0 = timeStart('fetch latest.json');
      latestJson = await fetchJson(`${METEO_BASE}/${domain}/latest.json`);
      timeEnd('fetch latest.json', t0);
      cacheLatest.set(key, { json: latestJson, ts: now });
    } catch {
      latestJson = null;
    }
  }

  let baseModelRun: Date | null = null;
  let baseTime: Date | null = null;
  let source: 'latest' | 'in-progress' = 'latest';
  if (latestJson?.reference_time) {
    baseModelRun = new Date(latestJson.reference_time);
    baseTime = new Date(latestJson.reference_time);
  } else {
    try {
      const t1 = timeStart('fetch in-progress.json');
      const inprog = await fetchJson(`${METEO_BASE}/${domain}/in-progress.json`);
      timeEnd('fetch in-progress.json', t1);
      if (inprog?.reference_time) {
        baseModelRun = new Date(inprog.reference_time);
        baseTime = new Date(inprog.reference_time);
        source = 'in-progress';
      }
    } catch {
      // ignore
    }
  }
  if (!baseModelRun || !baseTime) throw new Error('no_reference_time');

  const retryHours = opts.retryHours ?? [0, -3, -6, -12, -24];
  const maxRetries = Math.min(opts.maxRetries ?? 5, retryHours.length);
  for (let i = 0; i < maxRetries; i++) {
    const offset = retryHours[i];
    const testModelRun = new Date(baseModelRun);
    testModelRun.setUTCHours(testModelRun.getUTCHours() + offset);
    const testTime = new Date(baseTime);
    testTime.setUTCHours(testTime.getUTCHours() + offset);
    const path = buildPath(testModelRun, testTime);
    const testUrl = `${METEO_BASE}/${domain}/${path}`;
    dbg('resolveOmUrl:HEAD', { i, offset, testUrl });
    const tH = timeStart('HEAD');
    const ok = await head(testUrl);
    timeEnd('HEAD', tH);
    if (ok) {
      const [w, s, e, n] = tileBoundsFromZXY(zxy);
      const u = new URL(testUrl);
      u.searchParams.set('variable', variable);
      u.searchParams.set('bounds', `${s},${w},${n},${e}`);
      u.searchParams.set('partial', 'false');
      dbg('resolveOmUrl:FOUND', { url: u.toString(), source });
      return { omUrl: u.toString(), modelRun: testModelRun, time: testTime, source };
    }
  }
  throw new Error('no_data_available');
}


