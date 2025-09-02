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
let dark = false;
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
let cachedOmUrl = '';

setupGlobalCache();

const TILE_SIZE = Number(import.meta.env.VITE_TILE_SIZE) || 256;

console.log('🚀 [LEAFLET-OM] Protocole OM Leaflet initialisé, TILE_SIZE:', TILE_SIZE);

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
		cacheHit: cachedOmUrl === omUrl,
		totalStart: totalTileStart
	});

	// 🔄 Initialiser les données OM si nécessaire
	let dataLoadTime = 0;
	if (cachedOmUrl !== omUrl || !cachedData) {
		const dataLoadStart = performance.now();
		console.log('📂 [LEAFLET-OM] Chargement des données OM (cache miss)');
		await initOMFileForLeaflet(omUrl);
		dataLoadTime = performance.now() - dataLoadStart;
		console.log('✅ [LEAFLET-OM] Données OM chargées:', `${dataLoadTime.toFixed(2)}ms`);
		cachedOmUrl = omUrl;
	} else {
		console.log('⚡ [LEAFLET-OM] Utilisation cache des données OM');
	}

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
	const tileResult = await generateTileWithWorker(coords, tileBounds);

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
		dark = urlParams.get('dark') === 'true';
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
			dark: dark,
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
			.then(() => {
				console.log('✅ [LEAFLET-OM] Reader OMaps initialisé');
				return omapsFileReader.readVariable(variable, ranges);
			})
			.then((variableData) => {
				cachedData = variableData;
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
	tileBounds: { north: number; south: number; east: number; west: number }
): Promise<LeafletTileData> {
	return new Promise((resolve, reject) => {
		const workerCreationStart = performance.now();
		console.log('🔧 [LEAFLET-OM] Création worker pour tuile - Début:', workerCreationStart);

		const worker = new TileWorker();
		const key = `leaflet_${coords.z}_${coords.x}_${coords.y}`;

		// ⚠️ CORRECTION: Nettoyer tous les objets pour éviter les Proxy Svelte
		const cleanData = cachedData ? {
			values: cachedData.values // Extraire seulement les valeurs TypedArray
		} : null;

		const workerMessage = { 
			type: 'GT',
			x: coords.x,
			y: coords.y,
			z: coords.z,
			key: key,
			data: cleanData,
			domain: JSON.parse(JSON.stringify(domain)), // Sérialiser les proxy Svelte
			variable: JSON.parse(JSON.stringify(variable)),
			ranges: ranges ? JSON.parse(JSON.stringify(ranges)) : null,
			dark: dark,
			mapBounds: mapBounds ? [...mapBounds] : [],
			outputFormat: 'leaflet', // 🆕 Nouveau flag pour le format Leaflet
			tileBounds: tileBounds   // 🆕 Bounds géographiques de la tuile
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
	});
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
	cachedOmUrl = '';
	if (omapsFileReader) {
		omapsFileReader.dispose();
	}
}

