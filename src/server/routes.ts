import type { FastifyInstance } from 'fastify';
import { generateTilePngFromRoute, getMetricsSnapshot, resetMetrics } from './tile-service';
import { resolveOmUrl } from './om-resolver';
import { dbg, timeStart, timeEnd } from './log';
import { tileBoundsFromZXY } from './om-url';
import { sleepTest, poolStats } from './worker-pool';

export function registerTileRoutes(server: FastifyInstance) {
  // Route de test du pool: exécute N tâches sleep(1000ms) en parallèle
  server.get('/pool/test', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const n = Math.max(1, Math.min(50, Number(q?.n ?? '4')));
    const delay = Math.max(0, Math.min(10_000, Number(q?.ms ?? '1000')));
    const t0 = timeStart('pool_test');
    const before = poolStats();
    await Promise.all(Array.from({ length: n }, () => sleepTest(delay)));
    const after = poolStats();
    timeEnd('pool_test', t0);
    reply
      .header('Access-Control-Allow-Origin', '*')
      .type('application/json');
    return reply.send({ ok: true, n, delay, before, after });
  });

  // Stats du pool
  server.get('/pool/stats', async (_request, reply) => {
    const stats = poolStats();
    reply
      .header('Access-Control-Allow-Origin', '*')
      .type('application/json');
    return reply.send(stats);
  });

  // Reset métriques agrégées
  server.get('/metrics/reset', async (_request, reply) => {
    resetMetrics();
    const snapshot = getMetricsSnapshot();
    reply
      .header('Access-Control-Allow-Origin', '*')
      .type('application/json');
    return reply.send({ ok: true, snapshot });
  });
  // Endpoint modèle: renvoie latest.json d'un modèle donné
  server.get('/:model/latest', async (request, reply) => {
    const { model } = request.params as Record<string, string>;
    try {
      const s3Base = process.env.LATEST_BASE_URL || 'https://openmeteo.s3.amazonaws.com/data_spatial';
      const url = `${s3Base}/${model}/latest.json`;
      dbg('endpoint:latest:fetch', { model, url });
      const t0 = timeStart('fetch latest endpoint');
      const res = await fetch(url);
      timeEnd('fetch latest endpoint', t0);
      if (!res.ok) {
        reply
          .header('Access-Control-Allow-Origin', '*')
          .code(res.status)
          .type('application/json');
        return reply.send({ error: 'latest_not_found', status: res.status });
      }
      const text = await res.text();
      reply
        .header('Access-Control-Allow-Origin', '*')
        .type('application/json');
      return reply.send(text);
    } catch (err: any) {
      server.log.error({ err }, 'latest endpoint failed');
      reply
        .header('Access-Control-Allow-Origin', '*')
        .code(502)
        .type('application/json');
      return reply.send({ error: 'latest_fetch_failed' });
    }
  });
  // Préflight CORS
  server.options('/tile/:domain/:variable/last/:z/:x/:y', async (request, reply) => {
    reply
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Methods', 'GET, OPTIONS')
      .header('Access-Control-Allow-Headers', '*')
      .status(204)
      .send();
  });


  // STRATEGIE A: chemin strict complet vers le run et l'heure
  // /tile/:model/:variable/:yyyy/:mm/:dd/:runZ/:timeOm/:z/:x/:y
  server.options('/tile/:model/:variable/:yyyy/:mm/:dd/:runZ/:timeOm/:z/:x/:y', async (request, reply) => {
    reply
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Methods', 'GET, OPTIONS')
      .header('Access-Control-Allow-Headers', '*')
      .status(204)
      .send();
  });

  server.get('/tile/:model/:variable/:yyyy/:mm/:dd/:runZ/:timeOm/:z/:x/:y', async (request, reply) => {
    const { model, variable, yyyy, mm, dd, runZ, timeOm, z, x, y } = request.params as Record<string,string>;
    const zNum = Number(z), xNum = Number(x), yNum = Number(y);
    try {
      // Validation minimale
      if (!/^\d{4}$/.test(yyyy) || !/^\d{2}$/.test(mm) || !/^\d{2}$/.test(dd) || !/^\d{4}Z$/.test(runZ) || !/\.om$/.test(timeOm)) {
        reply.header('Access-Control-Allow-Origin', '*').code(400).type('application/json');
        return reply.send({ error: 'invalid_path_segments' });
      }
      const strictBase = process.env.OM_STRICT_BASE || 'https://openmeteo.s3.amazonaws.com/data_spatial';
      const path = `${strictBase}/${model}/${yyyy}/${mm}/${dd}/${runZ}/${timeOm}`;
      dbg('route:strict:path', { path });
      // Ajouter variable & bounds & partial=false
      const [west, south, east, north] = tileBoundsFromZXY({ z: zNum, x: xNum, y: yNum });
      const u = new URL(path);
      u.searchParams.set('variable', variable);
      u.searchParams.set('bounds', `${south},${west},${north},${east}`);
      u.searchParams.set('partial', 'false');
      const finalUrl = u.toString();
      dbg('route:strict:url', { finalUrl });
      const t1 = timeStart('generateTilePngFromRoute');
      const png = await generateTilePngFromRoute({ domain: model, variable, z: zNum, x: xNum, y: yNum }, finalUrl);
      timeEnd('generateTilePngFromRoute', t1);
      reply
        .header('Access-Control-Allow-Origin', '*')
        .type('image/png');
      return reply.send(png);
    } catch (err: any) {
      request.server.log.error({ err }, 'strict tile generation failed');
      reply
        .header('Access-Control-Allow-Origin', '*')
        .code(502)
        .type('application/json');
      return reply.send({ error: 'tile_generation_failed' });
    }
  });
}


