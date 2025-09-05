import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encodeRgbaToPng } from '../../src/server/png';
import { PNG } from 'pngjs';

describe('encodeRgbaToPng', () => {
  it('encode un RGBA 256x256 en PNG décodable', () => {
    const width = 256, height = 256;
    const rgba = new Uint8Array(width * height * 4);
    // Colorier un coin en rouge opaque
    rgba[0] = 255; rgba[1] = 0; rgba[2] = 0; rgba[3] = 255;
    const buf = encodeRgbaToPng(rgba, width, height);
    assert.ok(Buffer.isBuffer(buf));
    const decoded = PNG.sync.read(buf);
    assert.equal(decoded.width, width);
    assert.equal(decoded.height, height);
    assert.equal(decoded.data[0], 255);
    assert.equal(decoded.data[1], 0);
    assert.equal(decoded.data[2], 0);
    assert.equal(decoded.data[3], 255);
  });
});


