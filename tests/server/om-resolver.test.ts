import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOmUrl } from '../../src/server/om-resolver';

describe('resolveOmUrl', () => {
  it('respecte OM_FILE_URL override', async () => {
    const prev = process.env.OM_FILE_URL;
    process.env.OM_FILE_URL = 'https://example.com/file.om';
    const res = await resolveOmUrl('dwd_icon_d2', 'temperature_2m', { z: 5, x: 16, y: 10 });
    assert.ok(res.omUrl.startsWith('https://example.com/file.om'));
    assert.ok(res.omUrl.includes('variable=temperature_2m'));
    assert.ok(res.omUrl.includes('bounds='));
    if (prev === undefined) delete process.env.OM_FILE_URL; else process.env.OM_FILE_URL = prev;
  });

  it('utilise latest.json et valide le premier HEAD OK', async () => {
    const origFetch = globalThis.fetch;
    const latestJson = { reference_time: '2025-09-04T18:00:00Z' };
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(input);
      if (url.endsWith('/latest.json')) {
        return new Response(JSON.stringify(latestJson), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 200 });
      }
      return new Response(null, { status: 404 });
    }) as any;

    const res = await resolveOmUrl('dwd_icon_d2', 'temperature_2m', { z: 5, x: 16, y: 10 }, { retryHours: [0], maxRetries: 1 });
    assert.ok(res.omUrl.includes('/dwd_icon_d2/'));
    assert.ok(res.omUrl.includes('variable=temperature_2m'));
    globalThis.fetch = origFetch;
  });

  it('fallback sur le 2e offset si le premier HEAD échoue', async () => {
    const origFetch = globalThis.fetch;
    const latestJson = { reference_time: '2025-09-04T18:00:00Z' };
    let headCount = 0;
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(input);
      if (url.endsWith('/latest.json')) {
        return new Response(JSON.stringify(latestJson), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (init?.method === 'HEAD') {
        headCount++;
        return new Response(null, { status: headCount === 1 ? 404 : 200 });
      }
      return new Response(null, { status: 404 });
    }) as any;

    const res = await resolveOmUrl('dwd_icon_d2', 'temperature_2m', { z: 5, x: 16, y: 10 }, { retryHours: [0, -3], maxRetries: 2 });
    assert.ok(res.omUrl.includes('/dwd_icon_d2/'));
    globalThis.fetch = origFetch;
  });

  it('renvoie une erreur si aucune donnée dispo', async () => {
    const origFetch = globalThis.fetch;
    const latestJson = { reference_time: '2025-09-04T18:00:00Z' };
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(input);
      if (url.endsWith('/latest.json')) {
        return new Response(JSON.stringify(latestJson), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 404 });
      }
      return new Response(null, { status: 404 });
    }) as any;

    await assert.rejects(() => resolveOmUrl('dwd_icon_d2', 'temperature_2m', { z: 5, x: 16, y: 10 }, { retryHours: [0, -3], maxRetries: 2 }));
    globalThis.fetch = origFetch;
  });
});


