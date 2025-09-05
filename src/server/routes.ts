import type { FastifyInstance } from 'fastify';
import { generateTilePngFromRoute } from './tile-service';
import { resolveOmUrl } from './om-resolver';
import { dbg, timeStart, timeEnd } from './log';

export function registerTileRoutes(server: FastifyInstance) {
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
  server.get('/tile/:domain/:variable/last/:z/:x/:y', async (request, reply) => {
    const { domain, variable, z, x, y } = request.params as Record<string, string>;
    const zNum = Number(z), xNum = Number(x), yNum = Number(y);
    try {
      const t0 = timeStart('resolveOmUrl');
      const { omUrl, source } = await resolveOmUrl(domain, variable, { z: zNum, x: xNum, y: yNum });
      timeEnd('resolveOmUrl', t0);
      server.log.info({ domain, variable, z: zNum, x: xNum, y: yNum, omUrl, source }, 'tile request received');
      dbg('route:generate:start', { domain, variable, z: zNum, x: xNum, y: yNum });
      const t1 = timeStart('generateTilePngFromRoute');
      const png = await generateTilePngFromRoute({ domain, variable, z: zNum, x: xNum, y: yNum }, omUrl);
      timeEnd('generateTilePngFromRoute', t1);
      dbg('route:generate:done', { size: png.length });
      reply
        .header('Access-Control-Allow-Origin', '*')
        .type('image/png');
      return reply.send(png);
    } catch (err: any) {
      server.log.error({ err }, 'tile generation failed');
      const code = err?.message === 'no_data_available' || err?.message === 'no_reference_time' ? 502 : 500;
      reply
        .header('Access-Control-Allow-Origin', '*')
        .code(code)
        .type('application/json');
      return reply.send({ error: code === 502 ? 'no_data_available' : 'tile_generation_failed' });
    }
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


