import Fastify from 'fastify';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerTileRoutes } from '../../src/server/routes';
import { poolStats } from '../../src/server/worker-pool';

// Petit utilitaire de limitation de concurrence
async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let idx = 0;
  const workers: Promise<void>[] = [];
  const run = async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  };
  const c = Math.max(1, concurrency);
  for (let k = 0; k < c; k++) workers.push(run());
  await Promise.all(workers);
  return results;
}

describe('Bench pool: 1000 tuiles strict route', () => {
  it('scan 1024 tuiles (32x32 @ z=11) et mesure le temps', async () => {
    if (process.env.ENABLE_BENCH !== '1') return; // opt-in

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const localPath = path.resolve(__dirname, '../data/2025-09-04T0900.om');
    process.env.OM_FILE_PATH = localPath; // I/O local + cache main thread

    const server = Fastify({ logger: false });
    registerTileRoutes(server);

    const model = 'dwd_icon_d2';
    const variable = 'temperature_2m';
    const yyyy = '2025';
    const mm = '09';
    const dd = '04';
    const runZ = '0900Z';
    const timeOm = '2025-09-04T0900.om';
    const z = 11;
    const size = 32; // 0..31 → 1024 tuiles

    const urls: string[] = [];
    for (let x = 1026; x < 1026 + size; x++) {
      for (let y = 706; y < 706 + size; y++) {
        urls.push(`/tile/${model}/${variable}/${yyyy}/${mm}/${dd}/${runZ}/${timeOm}/${z}/${x}/${y}`);
      }
    }

    const t0 = performance.now();
    const before = poolStats();

    const concurrency = Number(process.env.BENCH_CONCURRENCY || '64');
    const responses = await mapWithConcurrency(urls, concurrency, async (url) => {
      const res = await server.inject({ method: 'GET', url });
      assert.equal(res.statusCode, 200);
      return res.rawPayload.length;
    });

    const after = poolStats();
    const totalMs = performance.now() - t0;
    const okTiles = responses.length;
    const avgMs = totalMs / okTiles;

    // Affichage synthétique
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ okTiles, totalMs: Math.round(totalMs), avgMs: Math.round(avgMs), before, after, concurrency }, null, 2));

    await server.close();
  });
});



