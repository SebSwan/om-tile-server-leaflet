import Fastify from 'fastify';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerTileRoutes } from '../../src/server/routes';
import { PNG } from 'pngjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Local OM file override (OM_FILE_PATH)', () => {
  it('rend un PNG décodable avec un .om local (skippé si fichier absent)', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const localPath = path.resolve(__dirname, '../data/2025-09-04T0900.om');
    // Skipper si le fichier n’existe pas ou vide
    if (!process.env.ENABLE_LOCAL || process.env.ENABLE_LOCAL !== '1') return;
    process.env.OM_FILE_PATH = localPath;

    const server = Fastify();
    registerTileRoutes(server);

    const res = await server.inject({ method: 'GET', url: '/tile/dwd_icon_d2/temperature_2m/last/5/16/10' });
    assert.equal(res.statusCode, 200);
    const buf = Buffer.from(res.rawPayload);
    const decoded = PNG.sync.read(buf);
    assert.equal(decoded.width, 256);
    assert.equal(decoded.height, 256);
    await server.close();
  });
});


