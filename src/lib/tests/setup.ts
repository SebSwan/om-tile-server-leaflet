/**
 * Configuration de l'environnement de test pour les tests Leaflet
 * Configure les mocks et polyfills nécessaires
 */

import { vi } from 'vitest';

// Mock de l'environnement browser pour SvelteKit
vi.mock('$app/environment', () => ({
  browser: true,
  dev: false,
  building: false,
  version: 'test'
}));

// Mock de $app/navigation
vi.mock('$app/navigation', () => ({
  pushState: vi.fn(),
  replaceState: vi.fn(),
  goto: vi.fn()
}));

// Mock global pour HTMLCanvasElement si nécessaire
if (typeof HTMLCanvasElement === 'undefined') {
  global.HTMLCanvasElement = class HTMLCanvasElement {
    width = 0;
    height = 0;
    getContext = vi.fn(() => ({
      createLinearGradient: vi.fn(() => ({
        addColorStop: vi.fn()
      })),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      font: '',
      fillStyle: ''
    }));
  } as any;
}

// Polyfill pour createImageBitmap si nécessaire
if (typeof createImageBitmap === 'undefined') {
  global.createImageBitmap = vi.fn(() => Promise.resolve({} as ImageBitmap));
}

// Mock basique de Leaflet pour les tests
const mockLeaflet = {
  map: vi.fn(() => ({
    setView: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    getBounds: vi.fn(() => ({
      getSouth: () => 45,
      getWest: () => 5,
      getNorth: () => 50,
      getEast: () => 10
    })),
    on: vi.fn(),
    removeLayer: vi.fn()
  })),
  tileLayer: vi.fn(() => ({
    addTo: vi.fn().mockReturnThis()
  })),
  Control: {
    extend: vi.fn((def) => function(options: any) {
      return {
        ...def,
        options,
        addTo: vi.fn().mockReturnThis()
      };
    })
  },
  GridLayer: {
    extend: vi.fn((def) => function(options: any) {
      return {
        ...def,
        options,
        addTo: vi.fn().mockReturnThis(),
        redraw: vi.fn(),
        getTileSize: vi.fn(() => ({ x: 256, y: 256 })),
        updateOptions: vi.fn()
      };
    })
  },
  DomUtil: {
    create: vi.fn(() => {
      const div = document.createElement('div');
      return div;
    })
  },
  DomEvent: {
    on: vi.fn()
  },
  setOptions: vi.fn()
};

// Mock de l'import dynamique de Leaflet avec toutes les propriétés nécessaires
vi.mock('leaflet', async () => {
  return {
    default: mockLeaflet,
    // Export direct des propriétés pour compatibilité
    ...mockLeaflet
  };
});

// Configuration globale pour les tests
beforeEach(() => {
  // Reset des mocks avant chaque test
  vi.clearAllMocks();

  // Créer un container DOM propre
  document.body.innerHTML = '<div id="map-container"></div>';
});
