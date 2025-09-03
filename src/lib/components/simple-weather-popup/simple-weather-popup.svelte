<script lang="ts">
	interface Props {
		visible: boolean;
		x: number;
		y: number;
		value: string;
		variable: string;
	}

	let {
		visible = false,
		x = 0,
		y = 0,
		value = '',
		variable = ''
	}: Props = $props();

	// Nom de la variable en français
	function getVariableLabel(varName: string): string {
		const labels: Record<string, string> = {
			'temperature_2m': 'Température 2m',
			'precipitation': 'Précipitations',
			'rain': 'Pluie',
			'wind_speed_10m': 'Vitesse du vent 10m',
			'relative_humidity_2m': 'Humidité relative 2m',
			'pressure_msl': 'Pression au niveau de la mer',
			'weather_code': 'Conditions météo',
			'cloud_cover': 'Couverture nuageuse',
			'visibility': 'Visibilité'
		};

		return labels[varName] || varName;
	}
</script>

{#if visible}
	<div
		class="simple-weather-popup fixed pointer-events-none z-50 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg p-3 max-w-xs"
		style="left: {x}px; top: {y}px; transform: translate(-50%, -100%) translateY(-10px);"
	>
		<!-- En-tête avec variable -->
		<h3 class="text-sm font-semibold text-gray-800 mb-2">
			{getVariableLabel(variable)}
		</h3>

		<!-- Valeur principale -->
		<div class="text-xl font-bold text-blue-600 text-center">
			{value}
		</div>

		<!-- Flèche pointant vers le bas -->
		<div class="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white/95"></div>
	</div>
{/if}

<style>
	.simple-weather-popup {
		z-index: 10000;
		animation: popup-fade-in 0.2s ease-out;
	}

	@keyframes popup-fade-in {
		from {
			opacity: 0;
			transform: translate(-50%, -100%) translateY(-10px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -100%) translateY(-10px) scale(1);
		}
	}

	/* Mode sombre */
	:global(.dark) .simple-weather-popup {
		background-color: rgba(40, 40, 40, 0.95);
		border-color: rgba(100, 100, 100, 0.5);
		color: white;
	}

	:global(.dark) .simple-weather-popup h3 {
		color: rgba(255, 255, 255, 0.9);
	}

	:global(.dark) .simple-weather-popup .text-blue-600 {
		color: #60a5fa;
	}

	:global(.dark) .simple-weather-popup .border-t-white\/95 {
		border-top-color: rgba(40, 40, 40, 0.95);
	}
</style>
