/**
 * Layer Leaflet personnalisée pour afficher les tuiles OMaps
 * Utilise le pipeline worker existant pour générer les tuiles
 */

import { browser } from '$app/environment';
// TileWorker import géré par leaflet-om-protocol

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
  if (!L.GridLayer) {
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

  return new (OMapsLayer as any)(options);
}

/**
 * 🚀 VERSION AVANCÉE AVEC INTÉGRATION WORKER
 * Utilise le nouveau protocole OM pour Leaflet avec données météo réelles
 */
export async function createOMapsLayerWithWorker(options: OMapsLayerOptions): Promise<any> {
  if (!browser) {
    throw new Error('OMapsLayer can only be created in the browser');
  }

  console.log('🚀 [OMAPS-LAYER] Création couche avec worker:', {
    omUrl: options.omUrl?.substring(0, 100) + '...',
    domain: options.domain?.value,
    variable: options.variable?.value,
    opacity: options.opacity
  });

  const L = await import('leaflet');
  const { getTileForLeaflet, getTileForLeafletArrows, rgbaToCanvas } = await import('./leaflet-om-protocol');

  // Vérification pour les tests
  if (!L.GridLayer) {
    return {
      options,
      addTo: () => {},
      redraw: () => {},
      updateOptions: (newOptions: Partial<OMapsLayerOptions>) => {
        Object.assign(options, newOptions);
      }
    };
  }

  const OMapsWorkerLayer = L.GridLayer.extend({
    options: {
      ...options,
      opacity: options.opacity || 1
    },

    initialize: function(opts: OMapsLayerOptions) {
      L.setOptions(this, opts);
      console.log('📋 [OMAPS-LAYER] Layer initialisé avec options:', {
        omUrl: opts.omUrl?.substring(0, 50) + '...',
        opacity: opts.opacity
      });
    },

    /**
     * 🎯 FONCTION CENTRALE : createTile() AVEC VRAIES DONNÉES MÉTÉO
     *
     * Pipeline : Leaflet coords → Protocole OM → Worker → RGBA → Canvas
     */
    createTile: function(coords: any, done: Function) {
      const tileCreationStart = performance.now();
      console.log('🎯 [OMAPS-LAYER] createTile() appelée avec vraies données météo:', {
        coords: coords,
        zoom: coords.z,
        omUrl: this.options.omUrl?.substring(0, 50) + '...',
        startTime: tileCreationStart
      });

      const canvas = document.createElement('canvas');
      const tileSize = this.getTileSize();
      canvas.width = tileSize.x;
      canvas.height = tileSize.y;

      console.log('📐 [OMAPS-LAYER] Canvas créé:', {
        width: tileSize.x,
        height: tileSize.y
      });

      // Vérification URL OM
      if (!this.options.omUrl) {
        console.warn('⚠️ [OMAPS-LAYER] Pas d\'URL OM → tuile de test');
        this._createTestTile(canvas, coords, tileSize);
        setTimeout(() => done(null, canvas), 100);
        return canvas;
      }

      // 🚀 NOUVEAU : Utilisation du protocole OM pour Leaflet
      console.log('🔄 [OMAPS-LAYER] Appel getTileForLeaflet...');

      getTileForLeaflet(coords, this.options.omUrl)
        .then((tileData) => {
          const tileCreationEnd = performance.now();
          const totalTileTime = tileCreationEnd - tileCreationStart;

          console.log('✅ [OMAPS-LAYER] Données tuile reçues:', {
            rgbaLength: tileData.rgba.length,
            dimensions: `${tileData.width}x${tileData.height}`,
            coords: tileData.coords,
            totalTileCreationTime: `${totalTileTime.toFixed(2)}ms`
          });

          // Conversion RGBA → Canvas
          const weatherCanvas = rgbaToCanvas(tileData);

          // Copier le contenu vers notre canvas Leaflet
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(weatherCanvas, 0, 0);
            console.log('🎨 [OMAPS-LAYER] Canvas météo copié vers canvas Leaflet - Temps total:', `${totalTileTime.toFixed(2)}ms`);
          }

          done(null, canvas);
        })
        .catch((error) => {
          const tileCreationEnd = performance.now();
          const totalTileTime = tileCreationEnd - tileCreationStart;

          console.error('❌ [OMAPS-LAYER] Erreur génération tuile météo:', {
            error: error,
            totalTileCreationTime: `${totalTileTime.toFixed(2)}ms (ERREUR)`
          });

          // Amélioration du message d'erreur
          if (error.message && error.message.includes('File not found')) {
            console.warn('⚠️ [OMAPS-LAYER] Données non disponibles - utilisation de données antérieures recommandée');
          }

          console.log('🔄 [OMAPS-LAYER] Fallback vers tuile de test');

          // Fallback vers tuile de test en cas d'erreur
          this._createTestTile(canvas, coords, tileSize);
          done(null, canvas);
        });

      return canvas;
    },

    /**
     * 🎨 TUILE DE TEST AVEC DEBUG
     * Utilisée en cas de problème ou pour les tests
     */
    _createTestTile: function(canvas: HTMLCanvasElement, coords: any, tileSize: any) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Dégradé bleu → orange
        const gradient = ctx.createLinearGradient(0, 0, tileSize.x, tileSize.y);
        gradient.addColorStop(0, 'rgba(0, 100, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 100, 0, 0.3)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, tileSize.x, tileSize.y);

        // Coordonnées z/x/y
        ctx.fillStyle = 'black';
        ctx.font = '12px Arial';
        ctx.fillText(`${coords.z}/${coords.x}/${coords.y}`, 10, 20);

        // Indicateur de test
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(10, 30, 80, 20);
        ctx.fillStyle = 'red';
        ctx.font = '10px Arial';
        ctx.fillText('TEST TILE', 15, 42);

        console.log('🎨 [OMAPS-LAYER] Tuile de test créée pour coords:', coords);
      }
    },

    updateOptions: function(newOptions: Partial<OMapsLayerOptions>) {
      console.log('🔄 [OMAPS-LAYER] Mise à jour options:', newOptions);
      L.setOptions(this, { ...this.options, ...newOptions });
      this.redraw();
    }
  });

  return new (OMapsWorkerLayer as any)(options);
}

/**
 * 🚀 Couche de flèches (overlay) avec Worker
 */
export async function createWindArrowsLayerWithWorker(options: OMapsLayerOptions & { gridSize?: number }): Promise<any> {
  if (!browser) {
    throw new Error('OMapsLayer can only be created in the browser');
  }

  console.log('🚀 [OMAPS-LAYER] Création couche flèches avec worker:', {
    omUrl: options.omUrl?.substring(0, 100) + '...',
    domain: options.domain?.value,
    variable: options.variable?.value,
    opacity: options.opacity,
    gridSize: options.gridSize
  });

  const L = await import('leaflet');
  const { rgbaToCanvas } = await import('./leaflet-om-protocol');
  const { getTileForLeafletArrows } = await import('./leaflet-om-protocol');

  if (!L.GridLayer) {
    return {
      options,
      addTo: () => {},
      redraw: () => {},
      updateOptions: (newOptions: Partial<OMapsLayerOptions>) => {
        Object.assign(options, newOptions);
      }
    };
  }

  const WindArrowsWorkerLayer = L.GridLayer.extend({
    options: {
      ...options,
      opacity: options.opacity || 1
    },

    initialize: function(opts: OMapsLayerOptions & { gridSize?: number }) {
      L.setOptions(this, opts);
    },

    createTile: function(coords: any, done: Function) {
      const canvas = document.createElement('canvas');
      const tileSize = this.getTileSize();
      canvas.width = tileSize.x;
      canvas.height = tileSize.y;

      if (!this.options.omUrl) {
        // Tuile vide transparente
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, tileSize.x, tileSize.y);
        }
        setTimeout(() => done(null, canvas), 0);
        return canvas;
      }

      getTileForLeafletArrows(coords, this.options.omUrl, this.options.gridSize)
        .then((tileData) => {
          const arrowsCanvas = rgbaToCanvas(tileData);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(arrowsCanvas, 0, 0);
          }
          done(null, canvas);
        })
        .catch((error) => {
          console.error('❌ [OMAPS-LAYER] Erreur génération tuile flèches:', error);
          // Tuile transparente en fallback
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, tileSize.x, tileSize.y);
          }
          done(null, canvas);
        });

      return canvas;
    },

    updateOptions: function(newOptions: Partial<OMapsLayerOptions>) {
      L.setOptions(this, { ...this.options, ...newOptions });
      this.redraw();
    }
  });

  return new (WindArrowsWorkerLayer as any)(options);
}
