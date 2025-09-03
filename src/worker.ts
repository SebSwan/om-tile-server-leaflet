import { hideZero, drawOnTiles } from '$lib/utils/variables';

import { DynamicProjection, ProjectionGrid, type Projection } from '$lib/utils/projection';

import { tile2lat, tile2lon, getIndexFromLatLong } from '$lib/utils/math';

import { getColorScale, getInterpolator } from '$lib/utils/color-scales';

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

const getOpacity = (v: string, px: number, dark: boolean): number => {
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
		return 255 * (dark ? OPACITY / 100 - 0.2 : OPACITY / 100);
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
		// Mode flèches (overlay): rendu transparent à partir de composantes U/V
		if (message.data.mode === 'arrows') {
			const workerProcessingStart = performance.now();
			const key = message.data.key;
			const x = message.data.x;
			const y = message.data.y;
			const z = message.data.z;
			const ranges = message.data.ranges;
			const outputFormat = message.data.outputFormat || 'maplibre';
			const domain: Domain = message.data.domain;
			const uValues = message.data.data?.u as Float32Array;
			const vValues = message.data.data?.v as Float32Array;

			// Canvas hors-écran pour un rendu anti-crénelé des flèches
			const offscreen = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
			const ctx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
			if (!ctx) {
				// Fallback en cas d'absence de contexte (rare)
				const pixels = TILE_SIZE * TILE_SIZE;
				const rgba = new Uint8ClampedArray(pixels * 4);
				postMessage({ type: 'RT', rgba, width: TILE_SIZE, height: TILE_SIZE, key, processingTime: 0 });
				self.close();
				return;
			}

			let projectionGrid = null;
			if (domain.grid.projection) {
				const projectionName = domain.grid.projection.name;
				const projection = new DynamicProjection(
					projectionName,
					domain.grid.projection
				) as Projection;
				projectionGrid = new ProjectionGrid(projection, domain.grid);
			}

			const samples = (() => {
				const gridSize = message.data.gridSize;
				if (typeof gridSize === 'number' && gridSize > 0) return gridSize;
				if (z <= 4) return 8;
				if (z <= 7) return 12;
				if (z <= 10) return 14;
				return 16;
			})();

			const step = TILE_SIZE / samples;
			// const ctxWidth = TILE_SIZE;
			// const ctxHeight = TILE_SIZE;

			// Alignement global (monde) et marge de débord
			const worldX0 = x * TILE_SIZE;
			const worldY0 = y * TILE_SIZE;
			const phaseX = ((step / 2 - (worldX0 % step)) + step) % step;
			const phaseY = ((step / 2 - (worldY0 % step)) + step) % step;
			const margin = Math.min(12, Math.max(6, Math.floor(step * 0.5)));

			// Style B: configuration de rendu
			ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.miterLimit = 2;
			ctx.shadowColor = 'rgba(255,255,255,0.6)';
			ctx.shadowBlur = 0.8;
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 0;

			const drawArrowAt = (cx: number, cy: number, angle: number, length: number, speed: number) => {
				const x2 = cx + Math.cos(angle) * length;
				const y2 = cy + Math.sin(angle) * length;
				const head = Math.max(3, Math.floor(length * 0.35));
				// Épaisseur modulée par densité et vitesse
				const baseWidth = Math.max(1.2, Math.min(2.0, step * 0.10));
				ctx.lineWidth = Math.min(3.0, baseWidth + Math.min(1.0, speed * 0.06));
				ctx.strokeStyle = 'rgba(0,0,0,0.85)';
				ctx.fillStyle = 'rgba(0,0,0,0.85)';

				ctx.beginPath();
				ctx.moveTo(cx, cy);
				ctx.lineTo(x2, y2);
				ctx.stroke();

				const leftAngle = angle + Math.PI * 0.82;
				const rightAngle = angle - Math.PI * 0.82;
				const xl = x2 + Math.cos(leftAngle) * head;
				const yl = y2 + Math.sin(leftAngle) * head;
				const xr = x2 + Math.cos(rightAngle) * head;
				const yr = y2 + Math.sin(rightAngle) * head;
				ctx.beginPath();
				ctx.moveTo(x2, y2);
				ctx.lineTo(xl, yl);
				ctx.lineTo(xr, yr);
				ctx.closePath();
				ctx.fill();
			};

			// Boucles alignées et débordantes (clip implicite par canvas)
			for (let py = -margin + phaseY; py < TILE_SIZE + margin; py += step) {
				for (let px = -margin + phaseX; px < TILE_SIZE + margin; px += step) {

					const lat = tile2lat(y + (py / TILE_SIZE), z);
					const lon = tile2lon(x + (px / TILE_SIZE), z);

					const { index, xFraction, yFraction } = getIndexAndFractions(
						lat,
						lon,
						domain,
						projectionGrid,
						ranges
					);

					if (!Number.isFinite(index)) continue;
					const nx = ranges[1]['end'] - ranges[1]['start'];
					const base = index as number;
					const u =
						Number(uValues[base]) * (1 - xFraction) * (1 - yFraction) +
						Number(uValues[base + 1]) * xFraction * (1 - yFraction) +
						Number(uValues[base + nx]) * (1 - xFraction) * yFraction +
						Number(uValues[base + 1 + nx]) * xFraction * yFraction;
					const v =
						Number(vValues[base]) * (1 - xFraction) * (1 - yFraction) +
						Number(vValues[base + 1]) * xFraction * (1 - yFraction) +
						Number(vValues[base + nx]) * (1 - xFraction) * yFraction +
						Number(vValues[base + 1 + nx]) * xFraction * yFraction;

					if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
					const speed = Math.hypot(u, v);
					if (!Number.isFinite(speed) || speed <= 0.25) continue;

					// Angle carte (y vers le bas)
					const angle = -Math.atan2(u, v);
					const length = Math.min(18, Math.max(6, speed * 2.0));
					drawArrowAt(px, py, angle, length, speed);
				}
			}

			const workerProcessingEnd = performance.now();
			const totalProcessingTime = workerProcessingEnd - workerProcessingStart;

			const imageData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
			if (outputFormat === 'leaflet') {
				postMessage({ type: 'RT', rgba: imageData.data, width: TILE_SIZE, height: TILE_SIZE, key, processingTime: totalProcessingTime });
			} else {
				const tile = await createImageBitmap(imageData);
				postMessage({ type: 'RT', tile, key, processingTime: totalProcessingTime });
			}

			self.close();
			return;
		}
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
		const rgba = new Uint8ClampedArray(pixels * 4);
		const dark = message.data.dark;

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
						rgba[4 * ind + 3] = getOpacity(variable.value, px, dark);
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
				rgbaSize: rgba.length
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
				processingTime: `${totalProcessingTime.toFixed(2)}ms`
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
