import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderRgbaTile } from '../../src/server/tile-service';
import type { Domain, Range, Variable } from '../../src/lib/types';

describe('renderRgbaTile', () => {
  it('génère un RGBA 256x256 avec des données constantes', () => {
    const domain: Domain = {
      value: 'test', label: 'test',
      grid: { nx: 2, ny: 2, lonMin: 0, latMin: 0, dx: 1, dy: 1 },
      time_interval: 1, model_interval: 1, variables: [], windUVComponents: false
    } as any;
    const ranges: Range[] = [ { start: 0, end: 2 }, { start: 0, end: 2 } ];
    const variable: Variable = { value: 'temperature_2m', label: 'Temperature 2m' };
    const values = new Float32Array([10, 10, 10, 10]);
    const rgba = renderRgbaTile({ z: 0, x: 0, y: 0 }, domain, variable, values, ranges);
    assert.equal(rgba.length, 256 * 256 * 4);
    // Tous les pixels devraient être non transparents
    let alphaNonZero = 0;
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 0) alphaNonZero++;
    assert.ok(alphaNonZero > 0);
  });
});


