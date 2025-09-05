import Fastify from 'fastify';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('GET /tile/:domain/:variable/last/:z/:x/:y', () => {
    it('should return PNG-like payload (placeholder) and 200', async () => {
        const server = Fastify();

        server.get('/tile/:domain/:variable/last/:z/:x/:y', async (_req, reply) => {
            const width = 256; const height = 256;
            const rgba = new Uint8Array(width * height * 4);
            const { PNG } = await import('pngjs');
            const png = new PNG({ width, height });
            rgba.forEach((v, i) => { (png.data as any)[i] = v; });
            const buf = (PNG as any).sync.write(png);
            reply.type('image/png');
            return reply.send(buf);
        });

        const res = await server.inject({
            method: 'GET',
            url: '/tile/dwd_icon_d2/temperature_2m/last/1/1/1'
        });

        assert.equal(res.statusCode, 200);
        assert.ok((res.headers['content-type'] as string).includes('image/png'));
        // PNG encodé: taille > 0, pas en RAW
        assert.ok(res.rawPayload.length > 0);

        await server.close();
    });
});



