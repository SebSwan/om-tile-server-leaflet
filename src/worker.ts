import { hideZero, drawOnTiles } from '$lib/utils/variables';

import { DynamicProjection, ProjectionGrid, type Projection } from '$lib/utils/projection';

import { tile2lat, tile2lon, getIndexFromLatLong } from '$lib/utils/math';

import { getColorScale, getInterpolator } from '$lib/utils/color-scales';
import type { TypedArray } from '@openmeteo/file-reader';
import { interpolateLinear } from '$lib/utils/interpolations';

import type { ColorScale, Domain, IndexAndFractions } from '$lib/types';

const TILE_SIZE = Number(import.meta.env.VITE_TILE_SIZE) || 256;
const OPACITY = Number(import.meta.env.VITE_TILE_OPACITY);

// const rotatePoint = (cx: number, cy: number, theta: number, x: number, y: number) => {
// 	let xt = Math.cos(theta) * (x - cx) - Math.sin(theta) * (y - cy) + cx;
// 	let yt = Math.sin(theta) * (x - cx) + Math.cos(theta) * (y - cy) + cy;

// 	return [xt, yt];
// };

// const drawArrow = (
// 	rgba: Uint8ClampedArray,
// 	iBase: number,
// 	jBase: number,
// 	x: number,
// 	y: number,
// 	z: number,
// 	nx: number,
// 	domain: Domain,
// 	projectionGrid: ProjectionGrid,
// 	values: TypedArray,
// 	directions: TypedArray,
// 	boxSize = TILE_SIZE / 8,
// 	iconPixelData: IconListPixels
// ): void => {
// 	const northArrow = iconPixelData['0'];

// 	let iCenter = iBase + Math.floor(boxSize / 2);
// 	let jCenter = jBase + Math.floor(boxSize / 2);

// 	const lat = tile2lat(y + iCenter / TILE_SIZE, z);
// 	const lon = tile2lon(x + jCenter / TILE_SIZE, z);

// 	const { index, xFraction, yFraction } = getIndexAndFractions(lat, lon, domain, projectionGrid);

// 	let px = interpolateLinear(values, nx, index, xFraction, yFraction);

// 	let direction = degreesToRadians(interpolateLinear(directions, nx, index, xFraction, yFraction));

// 	if (direction) {
// 		for (let i = 0; i < boxSize; i++) {
// 			for (let j = 0; j < boxSize; j++) {
// 				let ind = j + i * boxSize;
// 				let rotatedPoint = rotatePoint(
// 					Math.floor(boxSize / 2),
// 					Math.floor(boxSize / 2),
// 					-direction,
// 					i,
// 					j
// 				);
// 				let newI = Math.floor(rotatedPoint[0]);
// 				let newJ = Math.floor(rotatedPoint[1]);
// 				let indTile = jBase + newJ + (iBase + newI) * TILE_SIZE;

// 				if (northArrow[4 * ind + 3]) {
// 					rgba[4 * indTile] = 0;
// 					rgba[4 * indTile + 1] = 0;
// 					rgba[4 * indTile + 2] = 0;
// 					rgba[4 * indTile + 3] =
// 						northArrow[4 * ind + 3] * Math.min(((px - 2) / 200) * 50, 100) * (OPACITY / 50);
// 				}
// 			}
// 		}
// 	}
// };

const getColor = (colorScale: ColorScale, px: number): number[] => {
	return colorScale.colors[
		Math.min(
			colorScale.colors.length - 1,
			Math.max(0, Math.floor((px - colorScale.min) / colorScale.scalefactor))
		)
	];
};

const getOpacity = (v: string, px: number): number => {
	if (v == 'cloud_cover' || v == 'thunderstorm_probability') {
		// scale opacity with percentage
		return 255 * (px ** 1.5 / 1000) * (OPACITY / 100);
	} else if (v.startsWith('wind')) {
		// scale opacity with wind values below 14kn
		return Math.min((px - 2) / 12, 1) * 255 * (OPACITY / 100);
	} else if (v.startsWith('precipitation')) {
		// scale opacity with precip values below 1.5mm
		return Math.min(px / 1.5, 1) * 255 * (OPACITY / 100);
	} else {
		// else set the opacity with env variable and deduct 20% for darkmode
		return 255 * (OPACITY / 100);
	}
};

const getIndexAndFractions = (
	lat: number,
	lon: number,
	domain: Domain,
	projectionGrid: ProjectionGrid | null,
	ranges = [
		{ start: 0, end: domain.grid.ny },
		{ start: 0, end: domain.grid.nx }
	]
) => {
	let indexObject: IndexAndFractions;
	if (domain.grid.projection && projectionGrid) {
		indexObject = projectionGrid.findPointInterpolated(lat, lon);
	} else {
		indexObject = getIndexFromLatLong(lat, lon, domain, ranges);
	}

	return (
		indexObject ?? {
			index: NaN,
			xFraction: 0,
			yFraction: 0
		}
	);
};

self.onmessage = async (message) => {
	if (message.data.type == 'GT') {
		const workerProcessingStart = performance.now();
		console.log('🔧 [WORKER] Message GT reçu - Début traitement:', {
			key: message.data.key,
			coords: { x: message.data.x, y: message.data.y, z: message.data.z },
			outputFormat: message.data.outputFormat || 'maplibre',
			dataSize: message.data.data?.values?.length || 0,
			domain: message.data.domain?.value,
			variable: message.data.variable?.value,
			startTime: workerProcessingStart
		});

		const key = message.data.key;
		const x = message.data.x;
		const y = message.data.y;
		const z = message.data.z;
		const values = message.data.data.values;
		const ranges = message.data.ranges;
		const outputFormat = message.data.outputFormat || 'maplibre'; // 🆕 Format de sortie

		const domain = message.data.domain;
		const variable = message.data.variable;
		const colorScale = getColorScale(message.data.variable);

		const pixels = TILE_SIZE * TILE_SIZE;
		let rgba = new Uint8ClampedArray(pixels * 4);

		console.log('🎨 [WORKER] Configuration traitement:', {
			tileSize: TILE_SIZE,
			pixels: pixels,
			colorScale: {
				min: colorScale.min,
				max: colorScale.max,
				unit: colorScale.unit
			}
		});

		let projectionGrid = null;
		if (domain.grid.projection) {
			const projectionName = domain.grid.projection.name;
			const projection = new DynamicProjection(
				projectionName,
				domain.grid.projection
			) as Projection;
			projectionGrid = new ProjectionGrid(projection, domain.grid, ranges);
			console.log('🗺️ [WORKER] Projection configurée:', projectionName);
		}

		const interpolator = getInterpolator(colorScale);

		console.log('🔄 [WORKER] Début génération pixels...');
		let pixelsProcessed = 0;
		let validPixels = 0;

		for (let i = 0; i < TILE_SIZE; i++) {
			const lat = tile2lat(y + i / TILE_SIZE, z);
			for (let j = 0; j < TILE_SIZE; j++) {
				const ind = j + i * TILE_SIZE;
				const lon = tile2lon(x + j / TILE_SIZE, z);

				const { index, xFraction, yFraction } = getIndexAndFractions(
					lat,
					lon,
					domain,
					projectionGrid,
					ranges
				);

				let px = interpolator(
					values,
					ranges[1]['end'] - ranges[1]['start'],
					index,
					xFraction,
					yFraction
				);

				if (hideZero.includes(variable.value)) {
					if (px < 0.25) {
						px = NaN;
					}
				}

				if (isNaN(px) || px === Infinity || variable.value === 'weather_code') {
					rgba[4 * ind] = 0;
					rgba[4 * ind + 1] = 0;
					rgba[4 * ind + 2] = 0;
					rgba[4 * ind + 3] = 0;
				} else {
					const color = getColor(colorScale, px);

					if (color) {
						rgba[4 * ind] = color[0];
						rgba[4 * ind + 1] = color[1];
						rgba[4 * ind + 2] = color[2];
						rgba[4 * ind + 3] = getOpacity(variable.value, px);
						validPixels++;
					}
				}
				pixelsProcessed++;
			}
		}

		console.log('✅ [WORKER] Génération pixels terminée:', {
			pixelsProcessed: pixelsProcessed,
			validPixels: validPixels,
			percentValid: ((validPixels / pixelsProcessed) * 100).toFixed(1) + '%'
		});

		// 🏹 Dessin des flèches de vent via OffscreenCanvas (si U/V fournis)
		try {
			const wind = message.data.wind;
			const arrowOptions = message.data.arrowOptions || {};
			const hasWind = wind && wind.u && wind.v && Array.isArray(wind.u) === false && Array.isArray(wind.v) === false;
			const isWindVar = typeof variable?.value === 'string' && variable.value.startsWith('wind');
			if (hasWind && isWindVar) {
				const stepPx: number = arrowOptions.stepPx ?? 16;
				const minZoom: number = arrowOptions.minZoom ?? 4;
				const minSpeed: number = arrowOptions.minSpeed ?? 2;
				const scale: number = arrowOptions.scale ?? 0.6;
				const alphaMin: number = arrowOptions.alphaMin ?? 0.4;
				const alphaMax: number = arrowOptions.alphaMax ?? 0.9;
				const lineWidth: number = arrowOptions.lineWidth ?? 1.2;
				const colorLight: [number, number, number] = arrowOptions.colorLight ?? [0, 0, 0];

				if (z >= minZoom) {
					const oc = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
					const ctx2d = oc.getContext('2d');
					if (ctx2d) {
						// Peindre la tuile d'intensité existante
						const baseImage = new ImageData(rgba, TILE_SIZE, TILE_SIZE);
						ctx2d.putImageData(baseImage, 0, 0);

						// Choix couleur selon thème
						const [cr, cg, cb] = colorLight;
						ctx2d.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 1)`;
						ctx2d.lineWidth = lineWidth;
						ctx2d.lineCap = 'round';

						const uArr: Float32Array = wind.u as Float32Array;
						const vArr: Float32Array = wind.v as Float32Array;
						const nx = ranges[1]['end'] - ranges[1]['start'];

						// Parcours grille clairsemée
						for (let py = Math.floor(stepPx / 2); py < TILE_SIZE; py += stepPx) {
							const lat = tile2lat(y + py / TILE_SIZE, z);
							for (let pxp = Math.floor(stepPx / 2); pxp < TILE_SIZE; pxp += stepPx) {
								const lon = tile2lon(x + pxp / TILE_SIZE, z);
								const { index, xFraction, yFraction } = getIndexAndFractions(
									lat,
									lon,
									domain,
									projectionGrid,
									ranges
								);

								if (!Number.isFinite(index)) continue;

								const uVal = interpolateLinear(uArr as unknown as TypedArray, nx, index, xFraction, yFraction);
								const vVal = interpolateLinear(vArr as unknown as TypedArray, nx, index, xFraction, yFraction);
								if (!Number.isFinite(uVal) || !Number.isFinite(vVal)) continue;

								const speed = Math.hypot(uVal, vVal);
								if (speed < minSpeed) continue;

								const t = Math.max(0, Math.min(1, (speed - minSpeed) / (20 - minSpeed)));
								const alpha = alphaMin + (alphaMax - alphaMin) * t;
								ctx2d.globalAlpha = alpha;

								// Direction écran: y vers le bas → inverser v
								const angle = Math.atan2(-vVal, uVal);
								const len = scale * stepPx * (0.6 + 0.4 * Math.min(1, speed / 10));

								ctx2d.save();
								ctx2d.translate(pxp + 0.5, py + 0.5);
								ctx2d.rotate(angle);
								// Tige
								ctx2d.beginPath();
								ctx2d.moveTo(-len * 0.3, 0);
								ctx2d.lineTo(len * 0.7, 0);
								ctx2d.stroke();
								// Pointe
								ctx2d.beginPath();
								ctx2d.moveTo(len * 0.7, 0);
								ctx2d.lineTo(len * 0.5, -len * 0.18);
								ctx2d.moveTo(len * 0.7, 0);
								ctx2d.lineTo(len * 0.5, len * 0.18);
								ctx2d.stroke();
								ctx2d.restore();
							}
						}

						// Récupérer RGBA avec flèches
						const composed = ctx2d.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
						rgba = new Uint8ClampedArray(composed.data);
					}
				}
			}
		} catch (err) {
			console.warn('⚠️ [WORKER] Dessin flèches ignoré:', err);
		}

		if (drawOnTiles.includes(variable.value)) {
			console.log('🎯 [WORKER] Application des icônes sur tuile...');
			// Icônes désactivées pour simplifier
		}

		// 🆕 FORMAT DE SORTIE ADAPTATIF
		const workerProcessingEnd = performance.now();
		const totalProcessingTime = workerProcessingEnd - workerProcessingStart;

		if (outputFormat === 'leaflet') {
			console.log('🍃 [WORKER] Format Leaflet - Retour RGBA directement:', {
				processingTime: `${totalProcessingTime.toFixed(2)}ms`,
				pixelsGenerated: TILE_SIZE * TILE_SIZE,
				rgbaSize: rgba.length,
				rgbaBytes: rgba.byteLength
			});
			postMessage({
				type: 'RT',
				rgba: rgba,           // ⚠️ Données RGBA brutes pour Leaflet
				width: TILE_SIZE,
				height: TILE_SIZE,
				key: key,
				processingTime: totalProcessingTime
			});
		} else {
			console.log('🗺️ [WORKER] Format MapLibre - Création ImageBitmap:', {
				processingTime: `${totalProcessingTime.toFixed(2)}ms`,
				approxImageBytes: TILE_SIZE * TILE_SIZE * 4
			});
			const tile = await createImageBitmap(new ImageData(rgba, TILE_SIZE, TILE_SIZE));
			postMessage({
				type: 'RT',
				tile: tile,
				key: key,
				processingTime: totalProcessingTime
			});
		}

		console.log('📤 [WORKER] Réponse envoyée, fermeture worker - Temps total:', `${totalProcessingTime.toFixed(2)}ms`);
		self.close();
	}
};
