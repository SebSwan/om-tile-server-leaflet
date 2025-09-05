import { PNG } from 'pngjs';

export function encodeRgbaToPng(rgba: Uint8Array, width = 256, height = 256): Buffer {
  const png = new PNG({ width, height });
  // png.data is a Buffer of length width*height*4
  rgba.forEach((v, i) => { png.data[i] = v; });
  return PNG.sync.write(png);
}


