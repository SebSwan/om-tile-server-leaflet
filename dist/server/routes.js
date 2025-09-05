import { generateTilePngFromRoute } from './tile-service';
import { resolveOmUrl } from './om-resolver';
export function registerTileRoutes(server) {
    server.get('/tile/:domain/:variable/last/:z/:x/:y', async (request, reply) => {
        const { domain, variable, z, x, y } = request.params;
        const zNum = Number(z), xNum = Number(x), yNum = Number(y);
        try {
            const { omUrl, source } = await resolveOmUrl(domain, variable, { z: zNum, x: xNum, y: yNum });
            server.log.info({ domain, variable, z: zNum, x: xNum, y: yNum, omUrl, source }, 'tile request received');
            const png = await generateTilePngFromRoute({ domain, variable, z: zNum, x: xNum, y: yNum }, omUrl);
            reply.type('image/png');
            return reply.send(png);
        }
        catch (err) {
            server.log.error({ err }, 'tile generation failed');
            const code = err?.message === 'no_data_available' || err?.message === 'no_reference_time' ? 502 : 500;
            reply.code(code).type('application/json');
            return reply.send({ error: code === 502 ? 'no_data_available' : 'tile_generation_failed' });
        }
    });
}
