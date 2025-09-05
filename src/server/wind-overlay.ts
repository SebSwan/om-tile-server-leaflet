import { tile2lat, tile2lon, getIndexFromLatLong } from '$lib/utils/math';
import { getInterpolator } from '$lib/utils/color-scales';
import type { Domain, Range } from '$lib/types';
import { DynamicProjection, ProjectionGrid, type Projection } from '$lib/utils/projection';
import { interpolateLinear } from '$lib/utils/interpolations';

type Zxy = { z: number; x: number; y: number };

export type ArrowOptions = {
  stepPx?: number;
  minZoom?: number;
  minSpeed?: number;
  scale?: number;
  alphaMin?: number;
  alphaMax?: number;
  color?: [number, number, number];
};

const TILE_SIZE = 256;

function getNxFromRanges(domain: Domain, ranges: Range[]): number {
  return ranges && ranges[1] ? ranges[1].end - ranges[1].start : domain.grid.nx;
}

function blendPixel(rgba: Uint8Array, idx: number, r: number, g: number, b: number, a: number) {
  const srcA = a;
  const dstA = rgba[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  const blend = (src: number, dst: number) => (src * srcA + dst * dstA * (1 - srcA)) / (outA || 1);
  const outR = blend(r, rgba[idx + 0]);
  const outG = blend(g, rgba[idx + 1]);
  const outB = blend(b, rgba[idx + 2]);
  rgba[idx + 0] = Math.round(outR);
  rgba[idx + 1] = Math.round(outG);
  rgba[idx + 2] = Math.round(outB);
  rgba[idx + 3] = Math.round(outA * 255);
}

function drawLine(rgba: Uint8Array, x0: number, y0: number, x1: number, y1: number, color: [number, number, number], alpha: number) {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    if (x0 >= 0 && x0 < TILE_SIZE && y0 >= 0 && y0 < TILE_SIZE) {
      const idx = (y0 * TILE_SIZE + x0) * 4;
      blendPixel(rgba, idx, color[0], color[1], color[2], alpha);
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function overlayWindArrowsOnRgba({
  rgba,
  coords,
  domain,
  ranges,
  u,
  v,
  options
}: {
  rgba: Uint8Array;
  coords: Zxy;
  domain: Domain;
  ranges: Range[];
  u: Float32Array;
  v: Float32Array;
  options?: ArrowOptions;
}): Uint8Array {
  const stepPx = options?.stepPx ?? 16;
  const minZoom = options?.minZoom ?? 4;
  const minSpeed = options?.minSpeed ?? 2;
  const scale = options?.scale ?? 0.6;
  const alphaMin = options?.alphaMin ?? 0.4;
  const alphaMax = options?.alphaMax ?? 0.9;
  const color = options?.color ?? [0, 0, 0];

  const { z, x, y } = coords;
  if (z < minZoom) return rgba;

  const projection: Projection | null = domain.grid.projection
    ? (new DynamicProjection(domain.grid.projection.name, domain.grid.projection) as Projection)
    : null;
  const projectionGrid = projection ? new ProjectionGrid(projection, domain.grid, ranges) : null;
  const nx = getNxFromRanges(domain, ranges);

  for (let py = Math.floor(stepPx / 2); py < TILE_SIZE; py += stepPx) {
    const lat = tile2lat(y + py / TILE_SIZE, z);
    for (let px = Math.floor(stepPx / 2); px < TILE_SIZE; px += stepPx) {
      const lon = tile2lon(x + px / TILE_SIZE, z);
      let index = NaN, xFraction = 0, yFraction = 0;
      if (projectionGrid) {
        const point = projectionGrid.findPointInterpolated(lat, lon);
        index = point.index; xFraction = point.xFraction; yFraction = point.yFraction;
      } else {
        const res = getIndexFromLatLong(lat, lon, domain, ranges);
        index = res.index; xFraction = res.xFraction; yFraction = res.yFraction;
      }
      if (!Number.isFinite(index)) continue;
      const uVal = interpolateLinear(u as unknown as any, nx, index, xFraction, yFraction) as number;
      const vVal = interpolateLinear(v as unknown as any, nx, index, xFraction, yFraction) as number;
      if (!Number.isFinite(uVal) || !Number.isFinite(vVal)) continue;
      const speed = Math.hypot(uVal, vVal);
      if (speed < minSpeed) continue;

      const t = Math.max(0, Math.min(1, (speed - minSpeed) / (20 - minSpeed)));
      const alpha = alphaMin + (alphaMax - alphaMin) * t;
      const angle = Math.atan2(-vVal, uVal);
      const len = scale * stepPx * (0.6 + 0.4 * Math.min(1, speed / 10));

      const cx = Math.round(px + 0.5);
      const cy = Math.round(py + 0.5);
      const x0 = Math.round(cx - len * 0.3 * Math.cos(angle));
      const y0 = Math.round(cy - len * 0.3 * Math.sin(angle));
      const x1 = Math.round(cx + len * 0.7 * Math.cos(angle));
      const y1 = Math.round(cy + len * 0.7 * Math.sin(angle));
      drawLine(rgba, x0, y0, x1, y1, color, alpha);
      // Pointe
      const x2 = Math.round(cx + len * 0.5 * Math.cos(angle - Math.PI * 0.18));
      const y2 = Math.round(cy + len * 0.5 * Math.sin(angle - Math.PI * 0.18));
      const x3 = Math.round(cx + len * 0.5 * Math.cos(angle + Math.PI * 0.18));
      const y3 = Math.round(cy + len * 0.5 * Math.sin(angle + Math.PI * 0.18));
      drawLine(rgba, x1, y1, x2, y2, color, alpha);
      drawLine(rgba, x1, y1, x3, y3, color, alpha);
    }
  }

  return rgba;
}


