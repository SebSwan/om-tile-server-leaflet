/**
 * Utilitaires pour l'intégration de Leaflet avec SvelteKit
 * Gère les problèmes de SSR et l'import dynamique
 */

import { browser } from '$app/environment';

// Type pour Leaflet (sera défini dynamiquement)
export type LeafletModule = typeof import('leaflet');

let leafletInstance: LeafletModule | null = null;

/**
 * Import Leaflet de manière sécurisée pour éviter les problèmes SSR
 */
export async function loadLeaflet(): Promise<LeafletModule> {
  if (!browser) {
    throw new Error('Leaflet can only be loaded in the browser');
  }

  if (leafletInstance) {
    return leafletInstance;
  }

  // Import dynamique de Leaflet
  leafletInstance = await import('leaflet');

  return leafletInstance;
}

/**
 * Vérifie si Leaflet est disponible
 */
export function isLeafletAvailable(): boolean {
  return browser && leafletInstance !== null;
}

/**
 * Types pour les contrôles personnalisés Leaflet
 */
export interface LeafletControl {
  onAdd(map: any): HTMLElement;
  onRemove?(map: any): void;
}

/**
 * Factory pour créer des contrôles Leaflet personnalisés
 */
export async function createLeafletControl(
  controlDef: LeafletControl,
  options: { position?: string } = {}
): Promise<any> {
  const L = await loadLeaflet();

  const Control = L.Control.extend({
    onAdd: controlDef.onAdd,
    onRemove: controlDef.onRemove || function() {}
  });

  return new Control(options);
}

/**
 * Initialise une carte Leaflet de base
 */
export async function createLeafletMap(
  container: HTMLElement,
  options: {
    center?: [number, number];
    zoom?: number;
    [key: string]: any;
  } = {}
): Promise<any> {
  const L = await loadLeaflet();

  const defaultOptions = {
    center: [47.3769, 8.5417] as [number, number], // Suisse par défaut
    zoom: 6,
    keyboard: true,
    zoomControl: true,
    ...options
  };

  const map = L.map(container, defaultOptions);

  // Ajouter une couche de base par défaut
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  return map;
}
