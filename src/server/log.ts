export function dbg(tag: string, payload?: any) {
  if (process.env.DEBUG_TILES === '0') return;
  try {
    if (payload !== undefined) console.log(`[DBG] ${tag}`, payload);
    else console.log(`[DBG] ${tag}`);
  } catch {
    // ignore
  }
}

export function timeStart(label: string): number {
  const t = Date.now();
  dbg(`${label}::start`, { t });
  return t;
}

export function timeEnd(label: string, t0: number): number {
  const dt = Date.now() - t0;
  dbg(`${label}::end`, { ms: dt });
  return dt;
}



