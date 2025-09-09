import os from 'node:os';
import Piscina from 'piscina';

// Configuration du pool via variables d'environnement
// Priorité aux variables dédiées Piscina, fallback sur anciennes WORKERPOOL_*
const CPU_COUNT = os.cpus().length || 4;
const MAX_THREADS = Number(process.env.PISCINA_MAX_THREADS || process.env.WORKERPOOL_MAX || CPU_COUNT);
const MIN_THREADS = Number(process.env.PISCINA_MIN_THREADS || process.env.WORKERPOOL_MIN || Math.max(1, Math.floor(MAX_THREADS / 2)));
const CONCURRENT_TASKS = Number(process.env.PISCINA_CONCURRENCY || '1');
const IDLE_TIMEOUT = Number(process.env.PISCINA_IDLE_TIMEOUT || '30000');

// Fichier worker ESM pour Piscina
// @ts-ignore - import.meta.url est valide en ESM à l'exécution
const workerFilename = new URL('./piscina-worker.mjs', import.meta.url).pathname;

const pool = new Piscina({
  filename: workerFilename,
  minThreads: MIN_THREADS,
  maxThreads: MAX_THREADS,
  concurrentTasksPerWorker: CONCURRENT_TASKS,
  idleTimeout: IDLE_TIMEOUT
});

export async function sleepTest(ms: number): Promise<{ ok: true; elapsedMs: number }>{
  const t0 = performance.now();
  await pool.run(ms, { name: 'sleep' });
  const elapsedMs = performance.now() - t0;
  return { ok: true, elapsedMs };
}

export async function encodePngInWorker(rgba: Uint8Array, width = 256, height = 256): Promise<Buffer> {
  // Transfert zéro-copie vers le worker (le buffer côté main est neutered)
  const ab = rgba.buffer;
  const pngBuf = await pool.run({ ab, width, height }, { name: 'encodePng', transferList: [ab] });
  return pngBuf as unknown as Buffer;
}

export function poolStats(): { totalWorkers: number; busyWorkers: number; pendingTasks: number; config: { minThreads: number; maxThreads: number; concurrentTasksPerWorker: number; idleTimeout: number } } {
  const totalWorkers = (pool as unknown as { threads: unknown[] }).threads?.length ?? MIN_THREADS;
  const pendingTasks = (pool as unknown as { queueSize: number }).queueSize ?? 0;
  const utilization = (pool as unknown as { utilization: number }).utilization ?? 0;
  const busyWorkers = Math.max(0, Math.min(totalWorkers, Math.round(utilization * totalWorkers)));
  return {
    totalWorkers,
    busyWorkers,
    pendingTasks,
    config: {
      cpu_count : CPU_COUNT,
      minThreads: MIN_THREADS,
      maxThreads: MAX_THREADS,
      concurrentTasksPerWorker: CONCURRENT_TASKS,
      idleTimeout: IDLE_TIMEOUT
    }
  };
}

export async function destroyWorkerPool(): Promise<void> {
  await pool.destroy();
}


