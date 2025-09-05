import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOmUrlFromRoute, tileBoundsFromZXY } from '../../src/server/om-url';

describe('buildOmUrlFromRoute', () => {
  it('construit une URL OM avec bounds dérivés de z/x/y', () => {
    const url = buildOmUrlFromRoute({ domain: 'dwd_icon_d2', variable: 'temperature_2m', z: 5, x: 16, y: 10 });
    assert.ok(url.includes('dwd_icon_d2'));
    assert.ok(url.includes('variable=temperature_2m'));
    assert.ok(url.includes('bounds='));
    assert.ok(url.includes('partial=false'));
  });
});

describe('tileBoundsFromZXY', () => {
  it('retourne des bounds cohérents (west<south<east<north with degrees range)', () => {
    const [w, s, e, n] = tileBoundsFromZXY({ z: 2, x: 1, y: 1 });
    assert.ok(w < e);
    assert.ok(s < n);
    assert.ok(w >= -180);
    assert.ok(e <= 180);
    assert.ok(s >= -85);
    assert.ok(n <= 85);
  });
});


