/**
 * 🎨 CONVERSION COULEUR → VALEUR MÉTÉO PRÉCISE
 *
 * OBJECTIF : Convertir une couleur RGBA en valeur météo en utilisant
 * l'échelle de couleurs officielle du projet
 */

import { getColorScale } from './color-scales';
import type { Variable } from '../types';

/**
 * Trouve la valeur météo correspondant à une couleur RGBA
 * en utilisant l'échelle de couleurs officielle
 */
export function getValueFromColorScale(
	r: number,
	g: number,
	b: number,
	a: number,
	variable: Variable
): string {
	// Ignorer les pixels transparents
	if (a < 0.1) {
		return 'N/A';
	}

	// Utiliser getColorScale pour la correspondance intelligente
	const colorScale = getColorScale(variable);

	if (!colorScale) {
		return 'Échelle non disponible';
	}

	// Convertir la couleur RGBA en distance minimale vers l'échelle
	const targetColor = [r, g, b];
	let minDistance = Infinity;
	let bestIndex = 0;

	// Parcourir toutes les couleurs de l'échelle
	for (let i = 0; i < colorScale.colors.length; i++) {
		const scaleColor = colorScale.colors[i];
		const distance = getColorDistance(targetColor, scaleColor);

		if (distance < minDistance) {
			minDistance = distance;
			bestIndex = i;
		}
	}

	// Calculer la valeur correspondante
	const totalSteps = colorScale.colors.length;
	const valueRange = colorScale.max - colorScale.min;
	const value = colorScale.min + (bestIndex / (totalSteps - 1)) * valueRange;

	// Formater selon l'unité
	switch (colorScale.unit) {
		case 'C°':
			return `${value.toFixed(1)}°C`;
		case 'mm':
			return `${value.toFixed(1)} mm`;
		case 'hPa':
			return `${value.toFixed(0)} hPa`;
		case '%':
			return `${value.toFixed(0)}%`;
		case 'km/h':
			return `${value.toFixed(1)} km/h`;
		case 'm':
			return `${value.toFixed(0)} m`;
		default:
			return `${value.toFixed(2)}`;
	}
}

/**
 * Calcule la distance euclidienne entre deux couleurs RGB
 */
function getColorDistance(color1: number[], color2: number[]): number {
	const dr = color1[0] - color2[0];
	const dg = color1[1] - color2[1];
	const db = color1[2] - color2[2];
	return Math.sqrt(dr * dr + dg * dg + db * db);
}


