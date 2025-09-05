import Fastify from 'fastify';
import { registerTileRoutes } from './routes';
import { setupGlobalCache } from '@openmeteo/file-reader';
// Initialiser le cache global requis par @openmeteo/file-reader
// Valeurs par défaut: blockSize/maxBlocks internes si non fournis
setupGlobalCache();
const server = Fastify({ logger: true });
registerTileRoutes(server);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
server.listen({ port, host }).catch((err) => {
    server.log.error(err);
    process.exit(1);
});
