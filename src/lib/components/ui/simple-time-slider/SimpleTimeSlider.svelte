<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	interface Props {
		initialDate: Date;
		resolution?: number;
		disabled?: boolean;
		modelRunTime?: Date; // Heure du run météo
		dataStatus?: { available: boolean; message: string; referenceTime?: string }; // Statut des données
	}

	let {
		initialDate,
		resolution = 1,
		disabled = false,
		modelRunTime,
		dataStatus
	}: Props = $props();

	const dispatch = createEventDispatcher<{ change: Date }>();

	// État local
	let currentDate = $state(new Date(initialDate));
	let currentHour = $state(initialDate.getHours());

	// Fonctions utilitaires
	function pad2(n: number): string {
		return n < 10 ? '0' + n : n;
	}

	function formatTimeLabel(date: Date, hour: number): string {
		return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(hour)}:00`;
	}

	function goBackOneHour() {
		if (disabled) return;

		if (currentHour > 0) {
			currentHour -= resolution;
		} else {
			currentHour = 23;
			currentDate.setDate(currentDate.getDate() - 1);
		}

		const newDate = new Date(currentDate);
		newDate.setHours(currentHour);
		dispatch('change', newDate);
	}

	function goForwardOneHour() {
		if (disabled) return;

		if (currentHour < 23) {
			currentHour += resolution;
		} else {
			currentHour = 0;
			currentDate.setDate(currentDate.getDate() + 1);
		}

		const newDate = new Date(currentDate);
		newDate.setHours(currentHour);
		dispatch('change', newDate);
	}

	function onSliderChange(event: Event) {
		if (disabled) return;

		const target = event.target as HTMLInputElement;
		currentHour = Number(target.value);

		const newDate = new Date(currentDate);
		newDate.setHours(currentHour);
		dispatch('change', newDate);
	}

	function onDateChange(event: Event) {
		if (disabled) return;

		const target = event.target as HTMLInputElement;
		const [year, month, day] = target.value.split('-').map(Number);

		currentDate = new Date(year, month - 1, day);
		const newDate = new Date(currentDate);
		newDate.setHours(currentHour);
		dispatch('change', newDate);
	}

	// Mise à jour réactive du label
	const timeLabel = $derived(formatTimeLabel(currentDate, currentHour));
</script>

<div class="simple-time-slider bg-white/90 backdrop-blur-sm rounded-lg p-4 shadow-lg border border-gray-200">
	<div class="flex flex-col gap-3">
		<!-- Label du temps actuel -->
		<div class="text-center">
			<span class="text-lg font-bold text-gray-800 {disabled ? 'opacity-50' : ''}">
				{timeLabel}
			</span>
		</div>

		<!-- Statut des données (si disponible) -->
		{#if dataStatus && dataStatus.message}
			<div class="text-center">
				<div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm {dataStatus.message.includes('antérieures') ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : 'bg-green-100 text-green-800 border border-green-200'}">
					{#if dataStatus.message.includes('antérieures')}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
						</svg>
					{:else}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
						</svg>
					{/if}
					<span class="font-medium">{dataStatus.message}</span>
				</div>
			</div>
		{/if}

		<!-- Contrôles de navigation -->
		<div class="flex items-center justify-center gap-4">
			<button
				type="button"
				onclick={goBackOneHour}
				disabled={disabled}
				class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				title="Heure précédente"
			>
				← Précédente
			</button>

			<button
				type="button"
				onclick={goForwardOneHour}
				disabled={disabled}
				class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				title="Heure suivante"
			>
				Suivante →
			</button>
		</div>

		<!-- Slider pour l'heure -->
		<div class="flex flex-col gap-2">
			<label for="hour-slider" class="text-sm font-medium text-gray-700">
				{#if modelRunTime}
					Run {modelRunTime.toISOString().slice(11, 16)}Z → Prévision {pad2(currentHour)}:00
				{:else}
					Heure: {pad2(currentHour)}:00
				{/if}
			</label>
			<input
				id="hour-slider"
				type="range"
				min="0"
				max="23"
				step={String(resolution)}
				value={String(currentHour)}
				onchange={onSliderChange}
				disabled={disabled}
				class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
				style="pointer-events: {disabled ? 'none' : 'auto'};"
			/>
		</div>

		<!-- Sélecteur de date -->
		<div class="flex flex-col gap-2">
			<label for="date-picker" class="text-sm font-medium text-gray-700">
				Date
			</label>
			<input
				id="date-picker"
				type="date"
				value="{currentDate.getFullYear()}-{pad2(currentDate.getMonth() + 1)}-{pad2(currentDate.getDate())}"
				onchange={onDateChange}
				disabled={disabled}
				class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
				style="pointer-events: {disabled ? 'none' : 'auto'};"
			/>
		</div>
	</div>
</div>

<style>
	/* Styles pour le slider */
	input[type="range"] {
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
		cursor: pointer;
	}

	input[type="range"]::-webkit-slider-track {
		background: #e5e7eb;
		height: 8px;
		border-radius: 4px;
	}

	input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		background: #3b82f6;
		height: 20px;
		width: 20px;
		border-radius: 50%;
		cursor: pointer;
	}

	input[type="range"]::-moz-range-track {
		background: #e5e7eb;
		height: 8px;
		border-radius: 4px;
	}

	input[type="range"]::-moz-range-thumb {
		background: #3b82f6;
		height: 20px;
		width: 20px;
		border-radius: 50%;
		cursor: pointer;
		border: none;
	}
</style>
