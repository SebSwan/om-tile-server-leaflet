import { DynamicProjection, ProjectionGrid } from './projection';
const r2d = 180 / Math.PI;
export const tile2lon = (x, z) => {
    return (x / Math.pow(2, z)) * 360 - 180;
};
export const tile2lat = (y, z) => {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return r2d * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};
export const tileToBBOX = (tile) => {
    const e = tile2lon(tile[0] + 1, tile[2]);
    const w = tile2lon(tile[0], tile[2]);
    const s = tile2lat(tile[1] + 1, tile[2]);
    const n = tile2lat(tile[1], tile[2]);
    return [w, s, e, n];
};
export const hermite = (t, p0, p1, m0, m1) => {
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
};
// Estimate first derivative (symmetric central)
export const derivative = (fm1, fp1) => {
    return (fp1 - fm1) / 2;
};
// Estimate second derivative (Laplacian-like)
export const secondDerivative = (fm1, f0, fp1) => {
    return fm1 - 2 * f0 + fp1;
};
export const getIndexFromLatLong = (lat, lon, domain, ranges = [
    { start: 0, end: domain.grid.ny },
    { start: 0, end: domain.grid.nx }
]) => {
    const dx = domain.grid.dx;
    const dy = domain.grid.dy;
    const lonMin = domain.grid.lonMin + dx * ranges[1]['start'];
    const latMin = domain.grid.latMin + dy * ranges[0]['start'];
    const lonMax = domain.grid.lonMin + dx * ranges[1]['end'];
    const latMax = domain.grid.latMin + dy * ranges[0]['end'];
    if (lat < latMin || lat > latMax || lon < lonMin || lon > lonMax) {
        return { index: NaN, xFraction: 0, yFraction: 0 };
    }
    else {
        const x = Math.floor((lon - lonMin) / dx);
        const y = Math.floor((lat - latMin) / dy);
        const xFraction = ((lon - lonMin) % dx) / dx;
        const yFraction = ((lat - latMin) % dy) / dy;
        const index = y * (ranges[1]['end'] - ranges[1]['start']) + x;
        return { index, xFraction, yFraction };
    }
};
export const getIndicesFromBounds = (south, west, north, east, domain) => {
    const dx = domain.grid.dx;
    const dy = domain.grid.dy;
    const nx = domain.grid.nx;
    const ny = domain.grid.ny;
    const minLat = domain.grid.latMin;
    const minLon = domain.grid.lonMin;
    // local sw, ne
    let s, w, n, e;
    let minX, minY, maxX, maxY;
    if (domain.grid.projection) {
        // ------ WIP ------
        const projectionName = domain.grid.projection.name;
        const projection = new DynamicProjection(projectionName, domain.grid.projection);
        const projectionGrid = new ProjectionGrid(projection, domain.grid);
        // const [westProjected, southProjected, eastProjected, northProjected] = getLatLonMinMaxProjected(
        // 	projectionGrid,
        // 	[s, w, n, e]
        // );
        const [x1, y1] = projectionGrid.findPointInterpolated2D(south, west);
        const [x2, y2] = projectionGrid.findPointInterpolated2D(north, east);
        minX = Math.floor(x1);
        minY = Math.floor(y1);
        maxX = Math.ceil(x2);
        maxY = Math.ceil(y2);
        return [minX, minY, maxX, maxY];
        // ------ END WIP ------
    }
    else {
        const xPrecision = String(dx).split('.')[1].length;
        const yPrecision = String(dy).split('.')[1].length;
        s = Number((south - (south % dy)).toFixed(yPrecision));
        w = Number((west - (west % dx)).toFixed(xPrecision));
        n = Number((north - (north % dy) + dy).toFixed(yPrecision));
        e = Number((east - (east % dx) + dx).toFixed(xPrecision));
        if (s - minLat < 0) {
            minY = 0;
        }
        else {
            minY = Math.floor(Math.max((s - minLat) / dy - 1, 0));
        }
        if (w - minLon < 0) {
            minX = 0;
        }
        else {
            minX = Math.floor(Math.max((w - minLon) / dx - 1, 0));
        }
        if (n - minLat < 0) {
            maxY = ny;
        }
        else {
            maxY = Math.ceil(Math.min((n - minLat) / dy + 1, ny));
        }
        if (e - minLon < 0) {
            maxX = nx;
        }
        else {
            maxX = Math.ceil(Math.min((e - minLon) / dx + 1, nx));
        }
        return [minX, minY, maxX, maxY];
    }
};
export const getBorderPoints = (projectionGrid) => {
    const points = [];
    for (let i = 0; i < projectionGrid.ny; i++) {
        points.push([projectionGrid.origin[0], projectionGrid.origin[1] + i * projectionGrid.dy]);
    }
    for (let i = 0; i < projectionGrid.nx; i++) {
        points.push([
            projectionGrid.origin[0] + i * projectionGrid.dx,
            projectionGrid.origin[1] + projectionGrid.ny * projectionGrid.dy
        ]);
    }
    for (let i = projectionGrid.ny; i >= 0; i--) {
        points.push([
            projectionGrid.origin[0] + projectionGrid.nx * projectionGrid.dx,
            projectionGrid.origin[1] + i * projectionGrid.dy
        ]);
    }
    for (let i = projectionGrid.nx; i >= 0; i--) {
        points.push([projectionGrid.origin[0] + i * projectionGrid.dx, projectionGrid.origin[1]]);
    }
    return points;
};
export const getBoundsFromGrid = (lonMin, latMin, dx, dy, nx, ny) => {
    const minLon = lonMin;
    const minLat = latMin;
    const maxLon = minLon + dx * nx;
    const maxLat = minLat + dy * ny;
    return [minLon, minLat, maxLon, maxLat];
};
export const getBoundsFromBorderPoints = (borderPoints, projection) => {
    let minLon = 180;
    let minLat = 90;
    let maxLon = -180;
    let maxLat = -90;
    for (const borderPoint of borderPoints) {
        const borderPointLatLon = projection.reverse(borderPoint[0], borderPoint[1]);
        if (borderPointLatLon[0] < minLat) {
            minLat = borderPointLatLon[0];
        }
        if (borderPointLatLon[0] > maxLat) {
            maxLat = borderPointLatLon[0];
        }
        if (borderPointLatLon[1] < minLon) {
            minLon = borderPointLatLon[1];
        }
        if (borderPointLatLon[1] > maxLon) {
            maxLon = borderPointLatLon[1];
        }
    }
    return [minLon, minLat, maxLon, maxLat];
};
export const getCenterFromBounds = (bounds) => {
    return {
        lng: (bounds[2] - bounds[0]) / 2 + bounds[0],
        lat: (bounds[3] - bounds[1]) / 2 + bounds[1]
    };
};
export const getCenterFromGrid = (grid) => {
    return {
        lng: grid.lonMin + grid.dx * (grid.nx * 0.5),
        lat: grid.latMin + grid.dy * (grid.ny * 0.5)
    };
};
export const degreesToRadians = (degree) => {
    return degree * (Math.PI / 180);
};
export const radiansToDegrees = (rad) => {
    return rad * (180 / Math.PI);
};
