import Fastify from 'fastify';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerTileRoutes } from '../../src/server/routes';
import { PNG } from 'pngjs';

describe('Integration: GET /tile/:domain/:variable/last/:z/:x/:y', () => {
  it('retourne un PNG décodable 256x256 (réseau, OM_FILE_URL override)', async () => {
    // Skippé par défaut; activer avec ENABLE_INTEGRATION=1
    if (process.env.ENABLE_INTEGRATION !== '1') return;

    // OM_BASE_URL peut être fixé par l’environnement; sinon fallback interne est utilisé
    const server = Fastify();
    // Utiliser l’URL fournie par l’utilisateur en override
    process.env.OM_FILE_URL = 'https://map-tiles.open-meteo.com/data_spatial/dwd_icon_d2/2025/09/04/1800Z/2025-09-04T1800.om';
    registerTileRoutes(server);

    const res = await server.inject({
      method: 'GET',
      url: '/tile/dwd_icon_d2/temperature_2m/last/5/16/10'
    });

    assert.equal(res.statusCode, 200);
    assert.ok((res.headers['content-type'] as string).includes('image/png'));

    const buf = Buffer.from(res.rawPayload);
    const decoded = PNG.sync.read(buf);
    assert.equal(decoded.width, 256);
    assert.equal(decoded.height, 256);

    await server.close();
  });
});


