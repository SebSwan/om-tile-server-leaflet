import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerTileRoutes } from './routes';
import { setupGlobalCache } from '@openmeteo/file-reader';
import { destroyWorkerPool } from './worker-pool';
import { poolStats } from './worker-pool';
import { sleepTest } from './worker-pool';

// IIFE pour éviter le top-level await
(async () => {
  // Initialiser le cache global requis par @openmeteo/file-reader
  // Valeurs par défaut: blockSize/maxBlocks internes si non fournis
  setupGlobalCache();

  const server = Fastify({ logger: true });

  await server.register(cors, {
    origin: '*',
    methods: ['GET', 'OPTIONS'],
    credentials: false,
    allowedHeaders: ['*'],
    hook: 'onRequest'
  });

  registerTileRoutes(server);

  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';

  server.listen({ port, host }).catch((err) => {
      server.log.error(err);
      process.exit(1);
  });

  // Arrêt propre du pool lors de la fermeture Fastify
  server.addHook('onClose', async () => {
    try {
      await destroyWorkerPool();
    } catch (e) {
      server.log.warn({ e }, 'worker pool termination failed');
    }
  });

  // Optionnel: préchauffage des threads pour éviter le coût de démarrage à la première requête
  if ((process.env.WORKER_WARMUP ?? '1') === '1') {
    try {
      const before = poolStats();
      await Promise.all([
        sleepTest(0),
        sleepTest(0),
        sleepTest(0)
      ]);
      const after = poolStats();
      server.log.info({ before, after }, 'worker pool warmed up');
    } catch (e) {
      server.log.warn({ e }, 'worker warmup failed');
    }
  }
})();



