export type TileCoords = { z: number; x: number; y: number };

export function tile2lon(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

export function tile2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function tileBoundsFromZXY({ z, x, y }: TileCoords): [west: number, south: number, east: number, north: number] {
  const west = tile2lon(x, z);
  const east = tile2lon(x + 1, z);
  const north = tile2lat(y, z);
  const south = tile2lat(y + 1, z);
  return [west, south, east, north];
}

function formatBounds(bounds: [number, number, number, number]): string {
  // south,west,north,east with reasonable precision
  const [west, south, east, north] = bounds;
  const f = (v: number) => v.toFixed(14);
  return `${f(south)},${f(west)},${f(north)},${f(east)}`;
}

export function buildOmUrlFromRoute(params: { domain: string; variable: string; z: number; x: number; y: number }): string {
  const { domain, variable, z, x, y } = params;
  const bounds = tileBoundsFromZXY({ z, x, y });
  const boundsParam = formatBounds(bounds);

  // Si OM_FILE_URL est défini, on remplace/force les search params (variable, bounds, partial)
  const override = process.env.OM_FILE_URL;
  if (override) {
    try {
      const u = new URL(override);
      u.searchParams.set('variable', variable);
      u.searchParams.set('bounds', boundsParam);
      u.searchParams.set('partial', 'false');
      return u.toString();
    } catch {
      // fallback vers base si override invalide
    }
  }

  const base = process.env.OM_BASE_URL || 'https://map-tiles.open-meteo.com/data_spatial';
  const lastPath = 'last/last.om';
  const url = `${base}/${domain}/${lastPath}?variable=${encodeURIComponent(variable)}&bounds=${boundsParam}&partial=false`;
  return url;
}


