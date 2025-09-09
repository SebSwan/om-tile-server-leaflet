import { tile2lat, tile2lon, getIndexFromLatLong } from '../lib/utils/math';
import { getInterpolator } from '../lib/utils/color-scales';
import type { Domain, Range } from '../lib/types';
import { DynamicProjection, ProjectionGrid, type Projection } from '../lib/utils/projection';
import { interpolateLinear } from '../lib/utils/interpolations';

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
  const srcA = Math.max(0, Math.min(1, a));
  const dstA = rgba[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) {
    rgba[idx + 0] = 0; rgba[idx + 1] = 0; rgba[idx + 2] = 0; rgba[idx + 3] = 0;
    return;
  }
  const blend = (src: number, dst: number) => (src * srcA + dst * dstA * (1 - srcA)) / outA;
  const outR = blend(r, rgba[idx + 0]);
  const outG = blend(g, rgba[idx + 1]);
  const outB = blend(b, rgba[idx + 2]);
  rgba[idx + 0] = Math.round(outR);
  rgba[idx + 1] = Math.round(outG);
  rgba[idx + 2] = Math.round(outB);
  rgba[idx + 3] = Math.round(outA * 255);
}

// Xiaolin Wu anti-aliased line drawing
function drawLineAA(
  rgba: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: [number, number, number],
  alpha: number
) {
  const ipart = (x: number) => Math.floor(x);
  const roundN = (x: number) => Math.round(x);
  const fpart = (x: number) => x - Math.floor(x);
  const rfpart = (x: number) => 1 - fpart(x);

  const plot = (x: number, y: number, c: number) => {
    if (x >= 0 && x < TILE_SIZE && y >= 0 && y < TILE_SIZE) {
      const idx = (y * TILE_SIZE + x) * 4;
      blendPixel(rgba, idx, color[0], color[1], color[2], alpha * c);
    }
  };

  let steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
  if (steep) {
    [x0, y0] = [y0, x0];
    [x1, y1] = [y1, x1];
  }
  if (x0 > x1) {
    [x0, x1] = [x1, x0];
    [y0, y1] = [y1, y0];
  }

  const dx = x1 - x0;
  const dy = y1 - y0;
  const gradient = dx === 0 ? 1 : dy / dx;

  // first endpoint
  let xend = roundN(x0);
  let yend = y0 + gradient * (xend - x0);
  let xgap = rfpart(x0 + 0.5);
  let xpxl1 = xend;
  let ypxl1 = ipart(yend);
  if (steep) {
    plot(ypxl1, xpxl1, rfpart(yend) * xgap);
    plot(ypxl1 + 1, xpxl1, fpart(yend) * xgap);
  } else {
    plot(xpxl1, ypxl1, rfpart(yend) * xgap);
    plot(xpxl1, ypxl1 + 1, fpart(yend) * xgap);
  }
  let intery = yend + gradient;

  // second endpoint
  xend = roundN(x1);
  yend = y1 + gradient * (xend - x1);
  xgap = fpart(x1 + 0.5);
  const xpxl2 = xend;
  const ypxl2 = ipart(yend);
  if (steep) {
    plot(ypxl2, xpxl2, rfpart(yend) * xgap);
    plot(ypxl2 + 1, xpxl2, fpart(yend) * xgap);
  } else {
    plot(xpxl2, ypxl2, rfpart(yend) * xgap);
    plot(xpxl2, ypxl2 + 1, fpart(yend) * xgap);
  }

  // main loop
  if (steep) {
    for (let x = xpxl1 + 1; x <= xpxl2 - 1; x++) {
      const yI = ipart(intery);
      plot(yI, x, rfpart(intery));
      plot(yI + 1, x, fpart(intery));
      intery += gradient;
    }
  } else {
    for (let x = xpxl1 + 1; x <= xpxl2 - 1; x++) {
      const yI = ipart(intery);
      plot(x, yI, rfpart(intery));
      plot(x, yI + 1, fpart(intery));
      intery += gradient;
    }
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

      const cx = px + 0.5;
      const cy = py + 0.5;
      const x0 = cx - len * 0.3 * Math.cos(angle);
      const y0 = cy - len * 0.3 * Math.sin(angle);
      const x1 = cx + len * 0.7 * Math.cos(angle);
      const y1 = cy + len * 0.7 * Math.sin(angle);
      drawLineAA(rgba, x0 as number, y0 as number, x1 as number, y1 as number, color, alpha);
      // Pointe fidèle à l'ancien worker:
      // depuis (0.7*len, 0) vers (0.5*len, ±0.18*len) dans le repère tourné
      const x2 = cx + len * (0.5 * Math.cos(angle) + 0.18 * Math.sin(angle));
      const y2 = cy + len * (0.5 * Math.sin(angle) - 0.18 * Math.cos(angle));
      const x3 = cx + len * (0.5 * Math.cos(angle) - 0.18 * Math.sin(angle));
      const y3 = cy + len * (0.5 * Math.sin(angle) + 0.18 * Math.cos(angle));
      drawLineAA(rgba, x1 as number, y1 as number, x2 as number, y2 as number, color, alpha);
      drawLineAA(rgba, x1 as number, y1 as number, x3 as number, y3 as number, color, alpha);
    }
  }

  return rgba;
}


