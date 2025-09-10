import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test d'intégration réseau: vérifie l'existence et le contenu de latest.json
// Activé quand ENABLE_INTEGRATION=1

describe('latest.json (intégration réseau)', () => {
  it('existe et pèse > 2KB; contient les 5 clés attendues', async () => {
    if (process.env.ENABLE_INTEGRATION !== '1') return; // skip par défaut

    const url = process.env.LATEST_URL || 'https://openmeteo.s3.amazonaws.com/data_spatial/dwd_icon_d2/latest.json';
    const res = await fetch(url);
    assert.equal(res.ok, true);

    // Taille > 2KB
    const cl = res.headers.get('content-length');
    if (cl) {
      assert.ok(parseInt(cl, 10) > 2000);
    }
    const text = await res.text();
    if (!cl) {
      assert.ok(Buffer.byteLength(text, 'utf8') > 2000);
    }

    // JSON avec 5 clés: completed, last_modified_time, reference_time, valid_times, variables
    const json = JSON.parse(text);
    const keys = ['completed', 'last_modified_time', 'reference_time', 'valid_times', 'variables'];
    for (const k of keys) assert.ok(Object.prototype.hasOwnProperty.call(json, k), `clé manquante: ${k}`);

    // Quelques validations basiques de types
    assert.equal(typeof json.completed, 'boolean');
    assert.equal(typeof json.last_modified_time, 'string');
    assert.equal(typeof json.reference_time, 'string');
    assert.ok(Array.isArray(json.valid_times));
    assert.ok(Array.isArray(json.variables));
  });
});



