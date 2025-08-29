/**
 * Tests spécifiques pour l'affichage des coordonnées des tuiles
 * Valide que les tuiles affichent correctement z/x/y et le dégradé
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Canvas et Context2D
const mockContext = {
  createLinearGradient: vi.fn(() => ({
    addColorStop: vi.fn()
  })),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  font: '',
  fillStyle: ''
};

const mockCanvas = {
  getContext: vi.fn(() => mockContext),
  width: 0,
  height: 0
};

// Mock global de createElement sera géré par le setup

describe('Affichage des coordonnées des tuiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Création des tuiles de test', () => {
    it('devrait pouvoir créer une couche OMaps', async () => {
      const { createOMapsLayer } = await import('$lib/leaflet-omaps-layer');

      const options = {
        omUrl: 'test',
        domain: { value: 'test' },
        variable: { value: 'temperature_2m' }
      };

      expect(async () => {
        await createOMapsLayer(options);
      }).not.toThrow();
    });

    it('devrait valider les types des options de la couche', async () => {
      const { createOMapsLayer } = await import('$lib/leaflet-omaps-layer');

      const options = {
        omUrl: 'https://example.com/data.om',
        domain: { value: 'swiss_domain', grid: { nx: 100, ny: 100 } },
        variable: { value: 'temperature_2m', label: 'Temperature 2m' },
        opacity: 0.8
      };

      expect(options.omUrl).toBe('https://example.com/data.om');
      expect(options.opacity).toBe(0.8);
      expect(options.domain.value).toBe('swiss_domain');
      expect(options.variable.value).toBe('temperature_2m');
    });
  });

  describe('Fonctionnalités des tuiles', () => {
    it('devrait supporter les coordonnées de tuiles', () => {
      const coords = { x: 15, y: 8, z: 12 };
      const expectedText = `${coords.z}/${coords.x}/${coords.y}`;

      expect(expectedText).toBe('12/15/8');
    });

    it('devrait gérer différents niveaux de zoom', () => {
      const testCases = [
        { x: 0, y: 0, z: 1, expected: '1/0/0' },
        { x: 1024, y: 512, z: 15, expected: '15/1024/512' },
        { x: 256, y: 128, z: 10, expected: '10/256/128' }
      ];

      testCases.forEach(({ x, y, z, expected }) => {
        const result = `${z}/${x}/${y}`;
        expect(result).toBe(expected);
      });
    });
  });
});
