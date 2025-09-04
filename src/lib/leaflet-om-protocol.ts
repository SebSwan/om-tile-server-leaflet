/**
 * 🗺️ PROTOCOLE OM POUR LEAFLET - Version Canvas
 *
 * OBJECTIF : Adaptation du protocole OM original pour Leaflet
 * - Génère des Canvas HTML au lieu d'ImageBitmap WebGL
 * - Gère les coordonnées Leaflet (lat/lon) vers tuiles météo
 * - Pipeline optimisé Worker → RGBA → Canvas
 */

import { setupGlobalCache, type TypedArray } from '@openmeteo/file-reader';
import {
	getIndicesFromBounds,
	tile2lat,
	tile2lon
} from '$lib/utils/math';

import { domains } from '$lib/utils/domains';
import { variables } from '$lib/utils/variables';
import { OMapsFileReader } from '../omaps-reader';
import TileWorker from '../worker?worker';

import type { TileIndex, Domain, Variable, Range } from '$lib/types';

// 🔧 Configuration globale pour Leaflet
let partial = false;
let domain: Domain;
let variable: Variable;
let mapBounds: number[];
let omapsFileReader: OMapsFileReader;
let mapBoundsIndexes: number[];
let ranges: Range[];

// Variables projection supprimées (non utilisées)

// Cache des données pour éviter les rechargements
let cachedData: { values: TypedArray | undefined } | null = null;

// Single-flight et caches par (URL, variable)
interface InitContext {
  domain: Domain;
  ranges: Range[];
  partial: boolean;
  mapBounds: number[];
  reader: OMapsFileReader;
}

const initPromisesByKey: Map<string, Promise<InitContext>> = new Map();
const initContextsByKey: Map<string, InitContext> = new Map();
const variablePromisesByKey: Map<string, Promise<Float32Array>> = new Map();
const dataCacheByKey: Map<string, Float32Array> = new Map();

setupGlobalCache();

const TILE_SIZE = Number(import.meta.env.VITE_TILE_SIZE) || 256;

console.log('🚀 [LEAFLET-OM] Protocole OM Leaflet initialisé, TILE_SIZE:', TILE_SIZE);

// 👷 Limiteur de concurrence simple pour les workers (max 4)
let ACTIVE_WORKERS = 0;
const MAX_WORKERS = 4;
const workerQueue: Array<() => void> = [];

function runOrQueue<T>(task: () => Promise<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const startTask = () => {
			ACTIVE_WORKERS++;
			task()
				.then(resolve)
				.catch(reject)
				.finally(() => {
					ACTIVE_WORKERS--;
					const next = workerQueue.shift();
					if (next) next();
				});
		};

		if (ACTIVE_WORKERS < MAX_WORKERS) {
			startTask();
		} else {
			workerQueue.push(startTask);
		}
	});
}

/**
 * 🧮 Calcul intensité du vent à partir des composantes U/V
 */
function computeWindIntensity(u: Float32Array, v: Float32Array): Float32Array {
  const n = u.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const uu = u[i];
    const vv = v[i];
    out[i] = Number.isFinite(uu) && Number.isFinite(vv) ? Math.hypot(uu, vv) : NaN;
  }
  return out;
}

/**
 * 🔑 Construit des clés stables pour init (sans variable) et pour variable
 */
function buildKeys(fullUrl: string): { baseUrl: string; initKey: string; variableValue: string } {
  const [baseUrl, paramStr = ''] = fullUrl.split('?');
  const params = new URLSearchParams(paramStr);
  const variableValue = params.get('variable') || '';
  params.delete('variable');
  // Normaliser l'ordre des paramètres
  const sorted = new URLSearchParams();
  Array.from(params.keys()).sort().forEach((k) => {
    const v = params.getAll(k);
    v.forEach((val) => sorted.append(k, val as string));
  });
  const initKey = sorted.toString() ? `${baseUrl}?${sorted.toString()}` : baseUrl;
  return { baseUrl, initKey, variableValue };
}

async function ensureInit(fullUrl: string): Promise<InitContext> {
  const { baseUrl, initKey } = buildKeys(fullUrl);
  if (initContextsByKey.has(initKey)) {
    return initContextsByKey.get(initKey)!;
  }
  if (initPromisesByKey.has(initKey)) {
    return initPromisesByKey.get(initKey)!;
  }

  const p = new Promise<InitContext>((resolve, reject) => {
    const [omUrl, omParams] = fullUrl.replace('om://', '').split('?');
    const urlParams = new URLSearchParams(omParams);
    const localPartial = urlParams.get('partial') === 'true';

    const urlParts = omUrl.split('/');
    const domainValue = urlParts[4];
    const localDomain = domains.find((dm) => dm.value === domainValue) ?? domains[0];

    const localMapBounds = urlParams
      .get('bounds')
      ?.split(',')
      .map((b: string): number => Number(b)) as number[];

    const localMapBoundsIndexes = getIndicesFromBounds(
      localMapBounds[0],
      localMapBounds[1],
      localMapBounds[2],
      localMapBounds[3],
      localDomain
    );

    const localRanges: Range[] = localPartial
      ? [
          { start: localMapBoundsIndexes[1], end: localMapBoundsIndexes[3] },
          { start: localMapBoundsIndexes[0], end: localMapBoundsIndexes[2] }
        ]
      : [
          { start: 0, end: localDomain.grid.ny },
          { start: 0, end: localDomain.grid.nx }
        ];

    const reader = new OMapsFileReader(localDomain, localPartial);
    reader
      .init(baseUrl)
      .then(() => {
        const ctx: InitContext = {
          domain: localDomain,
          ranges: localRanges,
          partial: localPartial,
          mapBounds: localMapBounds,
          reader
        };
        initContextsByKey.set(initKey, ctx);
        resolve(ctx);
      })
      .catch((e) => {
        reject(e);
      });
  }).finally(() => {
    initPromisesByKey.delete(initKey);
  });

  initPromisesByKey.set(initKey, p);
  return p;
}

async function readRawVariable(initKey: string, variableName: string): Promise<Float32Array> {
  const varKey = `${initKey}::${variableName}`;
  if (dataCacheByKey.has(varKey)) return dataCacheByKey.get(varKey)!;
  if (variablePromisesByKey.has(varKey)) return variablePromisesByKey.get(varKey)!;

  const ctx = initContextsByKey.get(initKey)!;
  const p = ctx.reader
    .readVariable({ value: variableName, label: variableName } as Variable, ctx.ranges)
    .then((res) => {
      const values = (res?.values as Float32Array) || new Float32Array();
      dataCacheByKey.set(varKey, values);
      return values;
    })
    .finally(() => {
      variablePromisesByKey.delete(varKey);
    });

  variablePromisesByKey.set(varKey, p);
  return p;
}

async function ensureVariableData(fullUrl: string): Promise<{ ctx: InitContext; varObj: Variable; values: Float32Array; u?: Float32Array; v?: Float32Array }> {
  const { initKey, variableValue } = buildKeys(fullUrl);
  const ctx = await ensureInit(fullUrl);

  if (variableValue === 'wind_10m') {
    const uVar = 'wind_u_component_10m';
    const vVar = 'wind_v_component_10m';
    const [u, v] = await Promise.all([
      readRawVariable(initKey, uVar),
      readRawVariable(initKey, vVar)
    ]).catch(async () => {
      // Fallback: lecture brute si U/V indisponibles
      const fallback = await readRawVariable(initKey, 'wind_10m');
      return [undefined as unknown as Float32Array, fallback] as unknown as [Float32Array, Float32Array];
    });

    if (u && v) {
      const windKey = `${initKey}::wind_10m`;
      if (dataCacheByKey.has(windKey)) {
        const values = dataCacheByKey.get(windKey)!;
        return { ctx, varObj: { value: 'wind_10m', label: 'Average Wind 10m' }, values, u, v };
      }
      const intensity = computeWindIntensity(u, v);
      dataCacheByKey.set(windKey, intensity);
      return { ctx, varObj: { value: 'wind_10m', label: 'Average Wind 10m' }, values: intensity, u, v };
    } else {
      // u/v manquants: v contient le fallback
      return { ctx, varObj: { value: 'wind_10m', label: 'Average Wind 10m' }, values: v };
    }
  }

  // Autres variables
  const values = await readRawVariable(initKey, variableValue);
  return { ctx, varObj: { value: variableValue, label: variableValue }, values };
}

/**
 * 📊 INTERFACE POUR LEAFLET
 * Format de retour optimisé pour Canvas HTML
 */
export interface LeafletTileData {
	rgba: Uint8ClampedArray;
	width: number;
	height: number;
	coords: { x: number; y: number; z: number };
}

/**
 * 🎯 FONCTION PRINCIPALE : getTileForLeaflet()
 *
 * OBJECTIF : Générer une tuile Canvas pour des coordonnées Leaflet
 *
 * ENTRÉE :
 * - coords: { x, y, z } - Coordonnées tuile Leaflet
 * - omUrl: string - URL complète du fichier OM
 *
 * SORTIE :
 * - Promise<LeafletTileData> - Données RGBA pour Canvas
 */
export async function getTileForLeaflet(
	coords: TileIndex,
	omUrl: string
): Promise<LeafletTileData> {
	const totalTileStart = performance.now();
	console.log('🎯 [LEAFLET-OM] getTileForLeaflet() appelée:', {
		coords: coords,
		omUrl: omUrl.substring(0, 100) + '...',
		totalStart: totalTileStart
	});

	// 🔄 S'assurer que l'init est faite et obtenir la donnée variable
	const dataLoadStart = performance.now();
	const { ctx, varObj, values, u, v } = await ensureVariableData(omUrl);
	const dataLoadTime = performance.now() - dataLoadStart;
	console.log('✅ [LEAFLET-OM] Données prêtes:', {
		variable: varObj.value,
		length: values.length,
		dataLoadTime: `${dataLoadTime.toFixed(2)}ms`
	});

	// 🗺️ Calculer les coordonnées géographiques de la tuile
	const tileBounds = getTileBounds(coords);
	console.log('📍 [LEAFLET-OM] Coordonnées géographiques tuile:', {
		bounds: tileBounds,
		center: {
			lat: (tileBounds.north + tileBounds.south) / 2,
			lon: (tileBounds.east + tileBounds.west) / 2
		}
	});

	// 🔧 Créer worker pour générer la tuile
	const tileResult = await generateTileWithWorker(coords, tileBounds, ctx, varObj, values, u, v);

	const totalTileTime = performance.now() - totalTileStart;
	console.log('🏁 [LEAFLET-OM] Tuile complète générée:', {
		totalTileTime: `${totalTileTime.toFixed(2)}ms`,
		dataLoadTime: `${dataLoadTime.toFixed(2)}ms`,
		workerTime: 'voir logs précédents',
		coords: coords
	});

	return tileResult;
}

/**
 * 🗂️ INITIALISATION DONNÉES OM POUR LEAFLET
 * Adaptation de initOMFile() original
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function initOMFileForLeaflet(fullUrl: string): Promise<void> {
	return new Promise((resolve, reject) => {
		console.log('🔄 [LEAFLET-OM] Initialisation fichier OM:', fullUrl);

		// Parse de l'URL OM (format: om://https://map-tiles.open-meteo.com/...)
		const [omUrl, omParams] = fullUrl.replace('om://', '').split('?');

		console.log('🔍 [LEAFLET-OM] Parsing URL:', {
			omUrl: omUrl.substring(0, 100) + '...',
			params: omParams
		});

		const urlParams = new URLSearchParams(omParams);
		partial = urlParams.get('partial') === 'true';

		// Extraction du domaine depuis l'URL (ex: dwd_icon_d2)
		const urlParts = omUrl.split('/');
		const domainValue = urlParts[4]; // Position du domaine dans l'URL
		domain = domains.find((dm) => dm.value === domainValue) ?? domains[0];

		// Extraction de la variable (ex: temperature_2m)
		const variableValue = urlParams.get('variable');
		variable = variables.find((v) => v.value === variableValue) ?? variables[0];

		// Extraction des bounds de la carte
		mapBounds = urlParams
			.get('bounds')
			?.split(',')
			.map((b: string): number => Number(b)) as number[];

		console.log('📋 [LEAFLET-OM] Configuration extraite:', {
			domain: domain.value,
			variable: variable.value,
			partial: partial,
			mapBounds: mapBounds,
			domainGrid: {
				nx: domain.grid.nx,
				ny: domain.grid.ny,
				lonMin: domain.grid.lonMin,
				latMin: domain.grid.latMin
			}
		});

		// Calcul des indices des bounds
		mapBoundsIndexes = getIndicesFromBounds(
			mapBounds[0], // south
			mapBounds[1], // west
			mapBounds[2], // north
			mapBounds[3], // east
			domain
		);

		console.log('🧮 [LEAFLET-OM] Indices bounds calculés:', {
			mapBoundsIndexes: mapBoundsIndexes,
			partial: partial
		});

		// Configuration des ranges selon mode partial/full
		if (partial) {
			ranges = [
				{ start: mapBoundsIndexes[1], end: mapBoundsIndexes[3] }, // Y
				{ start: mapBoundsIndexes[0], end: mapBoundsIndexes[2] }  // X
			];
		} else {
			ranges = [
				{ start: 0, end: domain.grid.ny },
				{ start: 0, end: domain.grid.nx }
			];
		}

		console.log('📐 [LEAFLET-OM] Ranges configurés:', ranges);

		// Initialisation du reader OMaps
		if (!omapsFileReader) {
			omapsFileReader = new OMapsFileReader(domain, partial);
		}

		omapsFileReader.setReaderData(domain, partial);
		omapsFileReader
			.init(omUrl)
			.then(async () => {
				console.log('✅ [LEAFLET-OM] Reader OMaps initialisé');
				// Mode spécial: calculer wind_10m à partir de U/V si demandé
				if (variable.value === 'wind_10m') {
					console.log('🌬️ [LEAFLET-OM] Calcul wind_10m à partir de U/V (séquentiel)');
					try {
						const uVar = { value: 'wind_u_component_10m', label: 'Wind U Component 10m' } as Variable;
						const vVar = { value: 'wind_v_component_10m', label: 'Wind V Component 10m' } as Variable;
						const [uData, vData] = await Promise.all([
							omapsFileReader.readVariable(uVar, ranges),
							omapsFileReader.readVariable(vVar, ranges)
						]);

						if (uData?.values && vData?.values) {
							const uArr = uData.values as Float32Array;
							const vArr = vData.values as Float32Array;
							const intensity = computeWindIntensity(uArr, vArr);
							cachedData = { values: intensity };
							console.log('📊 [LEAFLET-OM] U/V chargés, intensité calculée:', {
								length: intensity.length,
								dataType: intensity.constructor.name
							});
							return; // terminé via U/V, on sort ici
						} else {
							console.warn('⚠️ [LEAFLET-OM] Composantes U/V manquantes, fallback vers wind_10m brut');
						}
					} catch (e) {
						console.warn('⚠️ [LEAFLET-OM] Erreur chargement U/V, fallback vers wind_10m brut:', e);
					}
				}

				// Chemin par défaut ou fallback: lire la variable telle quelle
				const variableData = await omapsFileReader.readVariable(variable, ranges);
				cachedData = variableData;
			})
			.then(() => {
				console.log('📊 [LEAFLET-OM] Données variables chargées:', {
					dataLength: cachedData?.values?.length || 0,
					dataType: cachedData?.values?.constructor?.name || 'undefined'
				});
				resolve();
			})
			.catch((e) => {
				console.error('❌ [LEAFLET-OM] Erreur chargement données:', e);
				reject(e);
			});
	});
}

/**
 * 🗺️ CALCUL DES BOUNDS GÉOGRAPHIQUES D'UNE TUILE
 * Conversion coordonnées tuile Leaflet → lat/lon
 */
function getTileBounds(coords: TileIndex): { north: number; south: number; east: number; west: number } {
	const north = tile2lat(coords.y, coords.z);
	const south = tile2lat(coords.y + 1, coords.z);
	const west = tile2lon(coords.x, coords.z);
	const east = tile2lon(coords.x + 1, coords.z);

	console.log('🧭 [LEAFLET-OM] Bounds tuile calculés:', {
		coords: coords,
		bounds: { north, south, east, west },
		size: {
			latSpan: Math.abs(north - south),
			lonSpan: Math.abs(east - west)
		}
	});

	return { north, south, east, west };
}

/**
 * 🔧 GÉNÉRATION TUILE AVEC WORKER
 * Adaptation du pipeline worker original pour Leaflet
 */
async function generateTileWithWorker(
	coords: TileIndex,
	tileBounds: { north: number; south: number; east: number; west: number },
	ctx: InitContext,
	varObj: Variable,
	values: Float32Array,
	u?: Float32Array,
	v?: Float32Array
): Promise<LeafletTileData> {
	return runOrQueue<LeafletTileData>(() => new Promise((resolve, reject) => {
		const workerCreationStart = performance.now();
		console.log('🔧 [LEAFLET-OM] Création worker pour tuile - Début:', workerCreationStart);

		const worker = new TileWorker();
		const key = `leaflet_${coords.z}_${coords.x}_${coords.y}`;

		// ⚠️ CORRECTION: Nettoyer tous les objets pour éviter les Proxy Svelte
		const cleanData = { values };

		const workerMessage = {
			type: 'GT',
			x: coords.x,
			y: coords.y,
			z: coords.z,
			key: key,
			data: cleanData,
			domain: JSON.parse(JSON.stringify(ctx.domain)),
			variable: JSON.parse(JSON.stringify(varObj)),
			ranges: ctx.ranges ? JSON.parse(JSON.stringify(ctx.ranges)) : null,
			mapBounds: ctx.mapBounds ? [...ctx.mapBounds] : [],
			outputFormat: 'leaflet', // 🆕 Nouveau flag pour le format Leaflet
			tileBounds: tileBounds,  // 🆕 Bounds géographiques de la tuile
			wind: u && v ? { u, v } : undefined,
			arrowOptions: {
				stepPx: 16,
				minZoom: 4,
				minSpeed: 2,
				scale: 0.6,
				alphaMin: 0.4,
				alphaMax: 0.9,
				lineWidth: 1.2,
				colorDark: [255, 255, 255],
				colorLight: [0, 0, 0]
			}
		};

		console.log('📤 [LEAFLET-OM] Envoi message au worker:', {
			key: key,
			coords: coords,
			dataSize: cleanData?.values?.length || 0,
			outputFormat: workerMessage.outputFormat,
			tileBounds: tileBounds
		});

		// Timeout après 10 secondes
		const workerTimeout = setTimeout(() => {
			console.warn('⏰ [LEAFLET-OM] TIMEOUT worker après 10s');
			worker.terminate();
			reject(new Error('Worker timeout after 10 seconds'));
		}, 10000);

		worker.onmessage = (message) => {
			clearTimeout(workerTimeout);

			console.log('📥 [LEAFLET-OM] Réponse worker reçue:', {
				type: message.data.type,
				key: message.data.key,
				expectedKey: key,
				hasRgba: !!message.data.rgba,
				rgbaLength: message.data.rgba?.length || 0,
				rgbaBytes: message.data.rgba?.byteLength || 0,
				workerInternalTime: message.data.processingTime ? `${message.data.processingTime.toFixed(2)}ms` : 'N/A'
			});

			if (message.data.type === 'RT' && message.data.key === key) {
				const workerResponseReceived = performance.now();
				const totalWorkerLifetime = workerResponseReceived - workerCreationStart;
				const workerSetupTime = workerMessageSent - workerCreationStart;
				const workerCommunicationTime = workerResponseReceived - workerMessageSent;
				const workerInternalTime = message.data.processingTime || 0;
				const realOverheadTime = totalWorkerLifetime - workerInternalTime;

				// Format Leaflet : données RGBA directes
				const tileData: LeafletTileData = {
					rgba: message.data.rgba,
					width: TILE_SIZE,
					height: TILE_SIZE,
					coords: coords
				};

				console.log('✅ [LEAFLET-OM] Tuile Leaflet générée avec succès:', {
					rgbaLength: tileData.rgba.length,
					rgbaBytes: tileData.rgba.byteLength,
					expectedLength: TILE_SIZE * TILE_SIZE * 4,
					dimensions: `${tileData.width}x${tileData.height}`,
					totalWorkerLifetime: `${totalWorkerLifetime.toFixed(2)}ms`,
					workerInternalTime: `${workerInternalTime.toFixed(2)}ms`,
					realOverheadTime: `${realOverheadTime.toFixed(2)}ms`,
					breakdown: {
						setup: `${workerSetupTime.toFixed(2)}ms`,
						communication: `${workerCommunicationTime.toFixed(2)}ms`,
						processing: `${workerInternalTime.toFixed(2)}ms`
					}
				});

				worker.terminate();
				resolve(tileData);
			} else {
				console.warn('⚠️ [LEAFLET-OM] Message worker ignoré - type ou key incorrect');
			}
		};

		worker.onerror = (error) => {
			clearTimeout(workerTimeout);
			const workerErrorTime = performance.now();
			const totalWorkerLifetime = workerErrorTime - workerCreationStart;

			console.error('❌ [LEAFLET-OM] Erreur worker:', {
				error: error,
				totalWorkerLifetime: `${totalWorkerLifetime.toFixed(2)}ms (ERREUR)`,
				timeToError: `${(workerErrorTime - workerCreationStart).toFixed(2)}ms`
			});
			worker.terminate();
			reject(error);
		};

		let workerMessageSent = 0;
		try {
			worker.postMessage(workerMessage);
			workerMessageSent = performance.now();
			console.log('✅ [LEAFLET-OM] Message worker envoyé avec succès - Temps setup:', `${(workerMessageSent - workerCreationStart).toFixed(2)}ms`);
		} catch (error) {
			clearTimeout(workerTimeout);
			console.error('❌ [LEAFLET-OM] Erreur envoi message worker:', error);
			worker.terminate();
			reject(error);
		}
	}));
}

/**
 * 🔄 CONVERSION DONNÉES RGBA → CANVAS
 * Utilitaire pour créer un Canvas à partir des données RGBA
 */
export function rgbaToCanvas(tileData: LeafletTileData): HTMLCanvasElement {
	console.log('🎨 [LEAFLET-OM] Conversion RGBA → Canvas:', {
		dimensions: `${tileData.width}x${tileData.height}`,
		rgbaLength: tileData.rgba.length,
		coords: tileData.coords
	});

	const canvas = document.createElement('canvas');
	canvas.width = tileData.width;
	canvas.height = tileData.height;

	const ctx = canvas.getContext('2d');
	if (!ctx) {
		throw new Error('Could not get 2D context for canvas');
	}

	const imageData = new ImageData(tileData.rgba, tileData.width, tileData.height);
	ctx.putImageData(imageData, 0, 0);

	console.log('✅ [LEAFLET-OM] Canvas créé avec succès');
	return canvas;
}

/**
 * 🧹 NETTOYAGE CACHE
 * Utilitaire pour vider le cache des données
 */
export function clearOMCache(): void {
	console.log('🧹 [LEAFLET-OM] Nettoyage cache');
	cachedData = null;
	if (omapsFileReader) {
		omapsFileReader.dispose();
	}
}



