import os from 'node:os';
import workerpool from 'workerpool';

// Configuration du pool via variables d'environnement (optionnel)
const MAX_WORKERS = Number(process.env.WORKERPOOL_MAX || os.cpus().length || 4);
const MIN_WORKERS = Number(process.env.WORKERPOOL_MIN || Math.max(1, Math.floor(MAX_WORKERS / 2)));

// Crée un pool générique. On utilisera exec(..., { eval: true }) pour envoyer des fonctions.
const pool = workerpool.pool(undefined, {
  minWorkers: MIN_WORKERS,
  maxWorkers: MAX_WORKERS,
  workerType: 'thread'
});

export async function sleepTest(ms: number): Promise<{ ok: true; elapsedMs: number }>{
  const t0 = performance.now();
  // Tâche de test: simple sleep côté worker
  await pool.exec(
    (delay: number) => new Promise<void>((resolve) => setTimeout(resolve, delay)),
    [ms],
    { eval: true }
  );
  const elapsedMs = performance.now() - t0;
  return { ok: true, elapsedMs };
}

export async function encodePngInWorker(rgba: Uint8Array, width = 256, height = 256): Promise<Buffer> {
  // Transférer l'ArrayBuffer pour limiter la copie
  const rgbaBuffer = rgba.buffer.slice(0);
  const pngBuf = await pool.exec(
    async (ab: ArrayBuffer, w: number, h: number) => {
      const { PNG } = await import('pngjs');
      const u8 = new Uint8Array(ab);
      const png = new PNG({ width: w, height: h });
      for (let i = 0; i < u8.length; i++) png.data[i] = u8[i];
      // @ts-ignore - Buffer est global en Node worker
      return PNG.sync.write(png);
    },
    [rgbaBuffer, width, height],
    { eval: true }
  );
  return pngBuf as unknown as Buffer;
}

export function poolStats(): { totalWorkers: number; busyWorkers: number; pendingTasks: number } {
  const s = pool.stats();
  return {
    totalWorkers: s.totalWorkers,
    busyWorkers: s.busyWorkers,
    pendingTasks: s.pendingTasks
  };
}

export async function destroyWorkerPool(): Promise<void> {
  await pool.terminate(true);
}


