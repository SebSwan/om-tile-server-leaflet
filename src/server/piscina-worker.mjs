// @ts-nocheck
import { PNG } from 'pngjs';

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function encodePng({ ab, width, height }) {
  const u8 = new Uint8Array(ab);
  // Utiliser l'API statique: évite toute dépendance à l'allocation interne de data
  // et fonctionne avec un Buffer direct
  const data = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
  return PNG.sync.write({ width, height, data });
}


