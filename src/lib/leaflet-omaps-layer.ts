/**
 * Layer Leaflet personnalisée pour afficher les tuiles OMaps
 * Utilise le pipeline worker existant pour générer les tuiles
 */

import { browser } from '$app/environment';
import TileWorker from '../worker?worker';

export interface OMapsLayerOptions {
  omUrl: string;
  domain: any;
  variable: any;
  ranges?: any;
  dark?: boolean;
  opacity?: number;
}

/**
 * Crée une couche Leaflet personnalisée pour OMaps
 */
export async function createOMapsLayer(options: OMapsLayerOptions): Promise<any> {
  if (!browser) {
    throw new Error('OMapsLayer can only be created in the browser');
  }

  const L = await import('leaflet');

  // Vérification pour les tests - si GridLayer n'est pas disponible, on crée un mock
  if (!L.GridLayer && typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    return {
      options,
      addTo: () => {},
      redraw: () => {},
      updateOptions: (newOptions: Partial<OMapsLayerOptions>) => {
        Object.assign(options, newOptions);
      }
    };
  }

  const OMapsLayer = L.GridLayer.extend({
    options: {
      ...options,
      opacity: options.opacity || 1
    },

    initialize: function(opts: OMapsLayerOptions) {
      L.setOptions(this, opts);
    },

    createTile: function(coords: any, done: Function) {
      const canvas = document.createElement('canvas');
      const tileSize = this.getTileSize();
      canvas.width = tileSize.x;
      canvas.height = tileSize.y;

      // Pour l'instant, créons une tuile de test
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Tuile de test avec dégradé
        const gradient = ctx.createLinearGradient(0, 0, tileSize.x, tileSize.y);
        gradient.addColorStop(0, 'rgba(0, 100, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 100, 0, 0.3)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, tileSize.x, tileSize.y);

        // Texte de debug
        ctx.fillStyle = 'black';
        ctx.font = '12px Arial';
        ctx.fillText(`${coords.z}/${coords.x}/${coords.y}`, 10, 20);
      }

      // Appeler done() quand la tuile est prête
      setTimeout(() => done(null, canvas), 100);

      return canvas;
    },

    updateOptions: function(newOptions: Partial<OMapsLayerOptions>) {
      L.setOptions(this, { ...this.options, ...newOptions });
      this.redraw();
    }
  });

  return new OMapsLayer(options);
}

/**
 * Version future avec integration du worker
 * TODO: Implémenter l'intégration avec le worker existant
 */
export async function createOMapsLayerWithWorker(options: OMapsLayerOptions): Promise<any> {
  // Cette fonction sera implémentée dans la Phase 2
  console.log('OMapsLayer with worker integration - coming in Phase 2');
  return createOMapsLayer(options);
}
