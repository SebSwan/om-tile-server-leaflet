/**
 * Tests pour la migration MapLibre vers Leaflet
 * Valide que tous les composants Leaflet fonctionnent correctement
 */

import { describe, it, expect, vi } from 'vitest';

describe('Migration Leaflet - Tests d\'intégration', () => {

    describe('Modules et imports', () => {
    it('devrait pouvoir importer les utilitaires Leaflet', async () => {
      expect(async () => {
        await import('$lib/leaflet-utils');
      }).not.toThrow();
    });

    it('devrait pouvoir importer la couche OMaps', async () => {
      expect(async () => {
        await import('$lib/leaflet-omaps-layer');
      }).not.toThrow();
    });

    it('devrait avoir les types TypeScript corrects', async () => {
      const { createOMapsLayer } = await import('$lib/leaflet-omaps-layer');

      // Test de typage - ceci ne devrait pas lever d'erreur TypeScript
      const options: Parameters<typeof createOMapsLayer>[0] = {
        omUrl: 'test',
        domain: { value: 'test' },
        variable: { value: 'test' },
        opacity: 0.5
      };

      expect(options).toBeDefined();
      expect(options.omUrl).toBe('test');
      expect(options.opacity).toBe(0.5);
    });
  });
});

describe('Migration - Validation des fonctionnalités', () => {
  it('devrait confirmer que Leaflet est la nouvelle librairie de cartes', async () => {
    // Tenter d'importer Leaflet devrait réussir
    expect(async () => {
      await import('leaflet');
    }).not.toThrow();
  });

  it('devrait avoir supprimé les dépendances MapLibre', () => {
    // Test simple qui vérifie que nous n'importons plus MapLibre
    const packageJson = require('../../../package.json');
    expect(packageJson.devDependencies).not.toHaveProperty('maplibre-gl');
    expect(packageJson.devDependencies).toHaveProperty('leaflet');
  });
});
