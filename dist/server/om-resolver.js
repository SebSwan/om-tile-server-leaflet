import { tileBoundsFromZXY } from './om-url';
import { pad } from '$lib/utils/pad';
const METEO_BASE = 'https://map-tiles.open-meteo.com/data_spatial';
const cacheLatest = new Map();
const cacheHeadOk = new Map();
async function fetchJson(url) {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok)
        throw new Error(`HTTP ${res.status}`);
    return res.json();
}
async function head(url, timeoutMs = 2000) {
    const key = `head:${url}`;
    const now = Date.now();
    const cached = cacheHeadOk.get(key);
    if (cached && now - cached < 60_000)
        return true;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
        if (res.ok) {
            cacheHeadOk.set(key, now);
            return true;
        }
        return false;
    }
    catch {
        return false;
    }
    finally {
        clearTimeout(t);
    }
}
function buildPath(modelRun, time) {
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
export async function resolveOmUrl(domain, variable, zxy, opts = {}) {
    // Overrides
    const override = process.env.OM_FILE_URL;
    if (override) {
        const u = new URL(override);
        const bounds = tileBoundsFromZXY(zxy);
        const [w, s, e, n] = bounds;
        u.searchParams.set('variable', variable);
        u.searchParams.set('bounds', `${s},${w},${n},${e}`);
        u.searchParams.set('partial', 'false');
        return { omUrl: u.toString(), modelRun: new Date(0), time: new Date(0), source: 'env' };
    }
    // latest/in-progress metadata (cache 60s)
    const key = `latest:${domain}`;
    const now = Date.now();
    let latestJson = null;
    const cached = cacheLatest.get(key);
    if (cached && now - cached.ts < 60_000)
        latestJson = cached.json;
    if (!latestJson) {
        try {
            latestJson = await fetchJson(`${METEO_BASE}/${domain}/latest.json`);
            cacheLatest.set(key, { json: latestJson, ts: now });
        }
        catch {
            latestJson = null;
        }
    }
    let baseModelRun = null;
    let baseTime = null;
    let source = 'latest';
    if (latestJson?.reference_time) {
        baseModelRun = new Date(latestJson.reference_time);
        baseTime = new Date(latestJson.reference_time);
    }
    else {
        try {
            const inprog = await fetchJson(`${METEO_BASE}/${domain}/in-progress.json`);
            if (inprog?.reference_time) {
                baseModelRun = new Date(inprog.reference_time);
                baseTime = new Date(inprog.reference_time);
                source = 'in-progress';
            }
        }
        catch {
            // ignore
        }
    }
    if (!baseModelRun || !baseTime)
        throw new Error('no_reference_time');
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
        if (await head(testUrl)) {
            const [w, s, e, n] = tileBoundsFromZXY(zxy);
            const u = new URL(testUrl);
            u.searchParams.set('variable', variable);
            u.searchParams.set('bounds', `${s},${w},${n},${e}`);
            u.searchParams.set('partial', 'false');
            return { omUrl: u.toString(), modelRun: testModelRun, time: testTime, source };
        }
    }
    throw new Error('no_data_available');
}
