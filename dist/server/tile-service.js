import { domains as knownDomains } from '$lib/utils/domains';
import { getInterpolator, getColorScale } from '$lib/utils/color-scales';
import { tile2lat, tile2lon, getIndexFromLatLong, getIndicesFromBounds } from '$lib/utils/math';
import { tileBoundsFromZXY } from './om-url';
import { DynamicProjection, ProjectionGrid } from '$lib/utils/projection';
import { encodeRgbaToPng } from './png';
import { OmHttpBackend, OmDataType, FileBackendNode, OmFileReader } from '@openmeteo/file-reader';
const TILE_SIZE = 256;
function pickDomain(domainValue) {
    const d = knownDomains.find((dm) => dm.value === domainValue);
    if (!d)
        throw new Error(`Domain unknown: ${domainValue}`);
    return d;
}
function getNxFromRanges(domain, ranges) {
    return ranges && ranges[1] ? ranges[1].end - ranges[1].start : domain.grid.nx;
}
function computeRangesFull(domain) {
    return [
        { start: 0, end: domain.grid.ny },
        { start: 0, end: domain.grid.nx }
    ];
}
function computeRangesForTile(coords, domain) {
    // bounds: [west, south, east, north]
    const [w, s, e, n] = tileBoundsFromZXY(coords);
    const [minX, minY, maxX, maxY] = getIndicesFromBounds(s, w, n, e, domain);
    return [
        { start: minY, end: maxY },
        { start: minX, end: maxX }
    ];
}
function mapValueToColor(variable, value, colorScale = getColorScale(variable)) {
    if (Number.isNaN(value) || value === Infinity || value === -Infinity) {
        return [0, 0, 0, 0];
    }
    const idx = Math.min(colorScale.colors.length - 1, Math.max(0, Math.floor((value - colorScale.min) / colorScale.scalefactor)));
    const color = colorScale.colors[idx] || [0, 0, 0];
    const a = 255; // POC: opacité pleine
    return [color[0], color[1], color[2], a];
}
export function renderRgbaTile(coords, domain, variable, values, ranges) {
    const colorScale = getColorScale(variable);
    const interpolator = getInterpolator(colorScale);
    const projection = domain.grid.projection
        ? new DynamicProjection(domain.grid.projection.name, domain.grid.projection)
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
                index = point.index;
                xFraction = point.xFraction;
                yFraction = point.yFraction;
            }
            else {
                const res = getIndexFromLatLong(lat, lon, domain, ranges);
                index = res.index;
                xFraction = res.xFraction;
                yFraction = res.yFraction;
            }
            if (Number.isNaN(index)) {
                rgba[idxPix + 0] = 0;
                rgba[idxPix + 1] = 0;
                rgba[idxPix + 2] = 0;
                rgba[idxPix + 3] = 0;
                continue;
            }
            const v = interpolator(values, nx, index, xFraction, yFraction);
            const [r, g, b, a] = mapValueToColor(variable, v, colorScale);
            rgba[idxPix + 0] = r;
            rgba[idxPix + 1] = g;
            rgba[idxPix + 2] = b;
            rgba[idxPix + 3] = a;
        }
    }
    return rgba;
}
export async function readVariableValues(omUrl, variable, ranges) {
    // Priorité aux tests locaux via un fichier .om fourni
    const localPath = process.env.OM_FILE_PATH;
    let reader;
    if (localPath) {
        const fb = new FileBackendNode(localPath);
        reader = await OmFileReader.create(fb);
    }
    else {
        const backend = new OmHttpBackend({ url: omUrl, eTagValidation: false });
        reader = await backend.asCachedReader();
    }
    const child = await reader.getChildByName(variable.value);
    const floatArray = await child.read(OmDataType.FloatArray, ranges);
    return floatArray;
}
export async function generateTilePngFromRoute(params, omUrl) {
    const domain = pickDomain(params.domain);
    const variable = { value: params.variable, label: params.variable };
    // Lecture partielle basée sur la tuile
    const ranges = computeRangesForTile({ z: params.z, x: params.x, y: params.y }, domain);
    const values = await readVariableValues(omUrl, variable, ranges);
    const rgba = renderRgbaTile({ z: params.z, x: params.x, y: params.y }, domain, variable, values, ranges);
    return encodeRgbaToPng(rgba, TILE_SIZE, TILE_SIZE);
}
