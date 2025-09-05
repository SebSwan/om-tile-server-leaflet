import type { FastifyInstance } from 'fastify';
import { buildOmUrlFromRoute } from './om-url';
import { generateTilePngFromRoute } from './tile-service';

export function registerTileRoutes(server: FastifyInstance) {
  server.get('/tile/:domain/:variable/last/:z/:x/:y', async (request, reply) => {
    const { domain, variable, z, x, y } = request.params as Record<string, string>;
    const zNum = Number(z), xNum = Number(x), yNum = Number(y);
    const omUrl = buildOmUrlFromRoute({ domain, variable, z: zNum, x: xNum, y: yNum });
    server.log.info({ domain, variable, z: zNum, x: xNum, y: yNum, omUrl }, 'tile request received');
    try {
      const png = await generateTilePngFromRoute({ domain, variable, z: zNum, x: xNum, y: yNum }, omUrl);
      reply.type('image/png');
      return reply.send(png);
    } catch (err: any) {
      server.log.error({ err }, 'tile generation failed');
      reply.code(500).type('application/json');
      return reply.send({ error: 'tile_generation_failed' });
    }
  });
}


