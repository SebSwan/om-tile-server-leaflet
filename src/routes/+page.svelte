<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import { pushState } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	// Import Leaflet (sera importé dynamiquement dans onMount pour éviter SSR)
	import 'leaflet/dist/leaflet.css';

	// import { omProtocol, getValueFromLatLong } from '../om-protocol'; // TODO: Adapter pour Leaflet
	import { pad } from '$lib/utils/pad';
	import { domains } from '$lib/utils/domains';
	import { hideZero, variables } from '$lib/utils/variables';

	import type { Variable, Domain } from '$lib/types';
	import { getColorScale } from '$lib/utils/color-scales';

	// Import utilitaires Leaflet
	import { loadLeaflet, createLeafletMap } from '$lib/leaflet-utils';

	// Simplified state
	let partial = $state(false);
	let showScale = $state(true);
	let showTimeSelector = $state(true);

	import '../styles.css';
	import Scale from '$lib/components/scale/scale.svelte';
	import { CustomSelect } from '$lib/components/ui/custom-select';
	import { SimpleTimeSlider } from '$lib/components/ui/simple-time-slider';

	// Le time slider est maintenant géré par le composant SimpleTimeSlider

	// Leaflet layer management
	let omFileLayer: any = null;

			const addOmFileLayer = async () => {
		if (!map || !omUrl) return;

		console.log('🚀 [PAGE] addOmFileLayer() appelée:', {
			omUrl: omUrl.substring(0, 100) + '...',
			domain: domain.value,
			variable: variable.value
		});

		// Import de la couche OMaps avec worker
		const { createOMapsLayerWithWorker } = await import('$lib/leaflet-omaps-layer');

		// Créer la couche OMaps avec vraies données météo
		omFileLayer = await createOMapsLayerWithWorker({
			omUrl: omUrl,
			domain: domain,
			variable: variable,
			opacity: 0.8
		});

		console.log('✅ [PAGE] Couche OMaps créée, ajout à la carte');

		// Ajouter la couche à la carte
		omFileLayer.addTo(map);

		console.log('🗺️ [PAGE] Couche OMaps ajoutée à la carte Leaflet');
	};

	// Leaflet map variables
	let map: any; // Type Leaflet sera défini dynamiquement
	let mapContainer: HTMLElement | null;
	let omUrl: string;
	let popup: any;

	let url: URL;
	let params: URLSearchParams;

	let domain: Domain = $state(
		domains.find(d => d.value === 'dwd_icon_d2') ?? domains[0]
	);
	let variable: Variable = $state({ value: 'temperature_2m', label: 'Temperature 2m' });
	let timeSelected = $state(new Date());
	let modelRunSelected = $state(new Date());
	let mapBounds: any = $state();

	// Variables filtrées selon le domaine sélectionné
	const availableVariables = $derived(
		variables.filter(v => domain.variables.includes(v.value))
	);

	// Auto-sélection de variable compatible quand domaine change
	$effect(() => {
		if (!domain.variables.includes(variable.value)) {
			// Essayer de trouver temperature_2m en priorité
			const tempVar = availableVariables.find(v => v.value === 'temperature_2m');
			if (tempVar) {
				variable = tempVar;
			} else if (availableVariables.length > 0) {
				variable = availableVariables[0];
			}
			console.log('🔄 [VARIABLE] Auto-sélection:', variable.value, 'pour domaine:', domain.value);
		}
	});

	const TILE_SIZE = Number(import.meta.env.VITE_TILE_SIZE) || 256;

	let loading = $state(false);

	const changeOMfileURL = async () => {
		if (map) {
			loading = true;
			if (popup) {
				popup.remove();
			}

			mapBounds = map.getBounds();
			// Le time slider sera désactivé via le composant SimpleTimeSlider

			omUrl = getOMUrl();

			// Supprimer l'ancienne couche et en créer une nouvelle
			if (omFileLayer) {
				map.removeLayer(omFileLayer);
			}

			await addOmFileLayer();

			// Simple loading simulation
			setTimeout(() => {
				loading = false;
			}, 1000);
		}
	};

	let latest = $state();

	onMount(() => {
		url = new URL(document.location.href);
		params = new URLSearchParams(url.search);

		if (params.get('domain')) {
			domain = domains.find((dm) => dm.value === params.get('domain')) ?? domains[0];
		} else {
			domain = domains.find((dm) => dm.value === import.meta.env.VITE_DOMAIN) ?? domains[0];
		}

		let urlModelTime = params.get('model');
		if (urlModelTime && urlModelTime.length == 15) {
			const year = parseInt(urlModelTime.slice(0, 4));
			const month = parseInt(urlModelTime.slice(5, 7)) - 1; // zero-based
			const day = parseInt(urlModelTime.slice(8, 10));
			const hour = parseInt(urlModelTime.slice(11, 13));
			const minute = parseInt(urlModelTime.slice(13, 15));
			// Parse Date from UTC components (urlTime is in UTC)
			modelRunSelected = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));
		} else {
			modelRunSelected.setHours(0, 0, 0, 0); // Default to 12:00 local time
		}

		let urlTime = params.get('time');
		if (urlTime && urlTime.length == 15) {
			const year = parseInt(urlTime.slice(0, 4));
			const month = parseInt(urlTime.slice(5, 7)) - 1; // zero-based
			const day = parseInt(urlTime.slice(8, 10));
			const hour = parseInt(urlTime.slice(11, 13));
			const minute = parseInt(urlTime.slice(13, 15));
			// Parse Date from UTC components (urlTime is in UTC)
			timeSelected = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));
		} else {
			timeSelected.setHours(12, 0, 0, 0); // Default to 12:00 local time
		}

		if (params.get('variable')) {
			variable = variables.find((v) => v.value === params.get('variable')) ?? variables[0];
		} else {
			variable = variables.find((v) => v.value === import.meta.env.VITE_VARIABLE) ?? variables[0];
		}

		if (params.get('partial')) {
			partial = params.get('partial') === 'true';
		}
	});

	let showPopup = false;

	onMount(async () => {
		// Import Leaflet dynamiquement pour éviter les problèmes SSR
		const L = await loadLeaflet();
		// Import supprimé car plus nécessaire

		// Note: Contrôles déplacés vers des boutons Svelte natifs pour une meilleure réactivité

		// Créer la carte Leaflet
		map = await createLeafletMap(mapContainer as HTMLElement, {
			center: typeof domain.grid.center == 'object' ? [domain.grid.center.lat, domain.grid.center.lng] : [47.3769, 8.5417],
			zoom: domain?.grid.zoom || 6
		});

		// Panneau de statut supprimé pour épurer l'interface

		// Initialiser les bounds
			mapBounds = map.getBounds();

		// Charger les données du domaine
			latest = await getDomainData();
			omUrl = getOMUrl();
		await addOmFileLayer();

		// Le time slider sera maintenant géré par le composant SimpleTimeSlider

		// Gestionnaire de clic basique
		map.on('click', (e: any) => {
			showPopup = !showPopup;
			console.log('Map clicked at:', e.latlng);
		});
	});
	onDestroy(() => {
		if (map) {
			map.remove();
		}
	});

	const getOMUrl = () => {
		if (!mapBounds) return '';
		return `https://map-tiles.open-meteo.com/data_spatial/${domain.value}/${modelRunSelected.getUTCFullYear()}/${pad(modelRunSelected.getUTCMonth() + 1)}/${pad(modelRunSelected.getUTCDate())}/${pad(modelRunSelected.getUTCHours())}00Z/${timeSelected.getUTCFullYear()}-${pad(timeSelected.getUTCMonth() + 1)}-${pad(timeSelected.getUTCDate())}T${pad(timeSelected.getUTCHours())}00.om?dark=false&variable=${variable.value}&bounds=${mapBounds.getSouth()},${mapBounds.getWest()},${mapBounds.getNorth()},${mapBounds.getEast()}&partial=${partial}`;
	};

	let colorScale = $derived.by(() => {
		return getColorScale(variable);
	});

	const getDomainData = async (latest = true) => {
		return new Promise((resolve) => {
			fetch(
				`https://map-tiles.open-meteo.com/data_spatial/${domain.value}/${latest ? 'latest' : 'in-progress'}.json`
			).then(async (result) => {
				const json = await result.json();
				if (latest) {
					const referenceTime = json.reference_time;
					modelRunSelected = new Date(referenceTime);

					if (modelRunSelected - timeSelected > 0) {
						timeSelected = new Date(referenceTime);
					}
				}

				resolve(json);
			});
		});
	};

	let latestRequest = $derived(getDomainData());
	let progressRequest = $derived(getDomainData(false));

	let modelRuns = $derived.by(() => {
		if (latest) {
			let referenceTime = new Date(latest.reference_time);
			let returnArray = [
				...Array(Math.round(referenceTime.getUTCHours() / domain.model_interval + 1))
			].map((_, i) => {
				let d = new Date();
				d.setUTCHours(i * domain.model_interval, 0, 0, 0);
				return d;
			});
			return returnArray;
		} else {
			return [];
		}
	});
</script>

<svelte:head>
	<title>Open-Meteo Maps</title>
</svelte:head>

{#if loading}
	<div
		in:fade={{ delay: 1200, duration: 400 }}
		out:fade={{ duration: 150 }}
		class="pointer-events-none absolute top-[50%] left-[50%] z-50 transform-[translate(-50%,-50%)]"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="48"
			height="48"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="lucide lucide-loader-circle-icon lucide-loader-circle animate-spin"
			><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg
		>
	</div>
{/if}

<!-- Container de la carte avec contrôles intégrés -->
<div class="relative w-full h-screen">
	<div class="map" id="map_container" bind:this={mapContainer}></div>

	<!-- Debug info -->
	<div class="absolute bottom-1 right-1 z-40 bg-black/70 text-white text-xs p-2 rounded">
		TimeSelector: {showTimeSelector ? 'VISIBLE' : 'CACHÉ'}
	</div>

	<!-- Échelle de couleur -->
	<div class="absolute bottom-1 left-1 max-h-[300px] z-40">
		<Scale {showScale} {variable} />
	</div>
</div>

<!-- Interface épurée - plus de drawer -->

<!-- Dropdowns flottants pour Modèle et Variable -->
<div class="absolute top-4 right-4 flex flex-col gap-3 pointer-events-auto" style="z-index: 99999;">
	<!-- Dropdown Modèle -->
	<div class="bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-gray-200" style="z-index: 100001;">
		<CustomSelect
			label="Modèle:"
			options={domains.map(d => ({ value: d.value, label: d.label }))}
			value={domain.value}
			placeholder="Choisissez un modèle..."
			on:change={(e) => {
				console.log('🔄 [DROPDOWN] Changement modèle vers:', e.detail);
				const newDomain = domains.find(d => d.value === e.detail) ?? domains[0];
				domain = newDomain;
				console.log('🔄 [DROPDOWN] Modèle changé vers:', domain.label);
				changeOMfileURL();
			}}
		/>
	</div>

	<!-- Dropdown Variable -->
	<div class="bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-gray-200" style="z-index: 100002;">
		<CustomSelect
			label="Variable:"
			options={availableVariables.map(v => ({ value: v.value, label: v.label }))}
			value={variable.value}
			placeholder="Choisissez une variable..."
			on:change={(e) => {
				console.log('🔄 [DROPDOWN] Changement variable vers:', e.detail);
				const newVariable = availableVariables.find(v => v.value === e.detail) ?? availableVariables[0];
				if (newVariable) {
					variable = newVariable;
					console.log('🔄 [DROPDOWN] Variable changée vers:', variable.label);
					changeOMfileURL();
				}
			}}
		/>
	</div>
</div>
<!-- Time Slider Simple -->
<div
	class="absolute bottom-4 left-[50%] mx-auto transform-[translate(-50%)] {!showTimeSelector
		? 'pointer-events-none opacity-0'
		: 'opacity-100'}"
	style="z-index: 1000;"
>
	<SimpleTimeSlider
		initialDate={timeSelected}
		resolution={domain.time_interval}
		disabled={loading}
		on:change={async (e) => {
			console.log('🕐 [TIME-SLIDER] Changement de temps:', e.detail);
			timeSelected = e.detail;
			url.searchParams.set('time', e.detail.toISOString().replace(/[:Z]/g, '').slice(0, 15));
			history.pushState({}, '', url);
			await changeOMfileURL();
		}}
	/>
</div>
<!-- Interface épurée - plus de drawer -->
