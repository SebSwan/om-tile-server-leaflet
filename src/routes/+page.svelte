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
	import { createTimeSlider } from '$lib/components/time-slider';

	import type { Variable, Domain } from '$lib/types';
	import * as Drawer from '$lib/components/ui/drawer';
	import { getColorScale } from '$lib/utils/color-scales';

	// Import utilitaires Leaflet
	import { loadLeaflet, createLeafletMap } from '$lib/leaflet-utils';

	// Simplified state
	let partial = $state(false);
	let showScale = $state(true);
	let drawerOpen = $state(false);
	let showTimeSelector = $state(true);

	import '../styles.css';
	import Scale from '$lib/components/scale/scale.svelte';
	import SelectedVariables from '$lib/components/scale/selected-variables.svelte';
	import VariableSelection from '$lib/components/selection/variable-selection.svelte';

	let timeSliderApi: { setDisabled: (d: boolean) => void; setBackToPreviousDate: () => void };
	let timeSliderContainer: HTMLElement;

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

	let domain: Domain = $state({
		value: 'meteoswiss_icon_ch1',
		label: 'DWD ICON D2',
		model_interval: 3
	});
	let variable: Variable = $state({ value: 'temperature_2m', label: 'Temperature 2m' });
	let timeSelected = $state(new Date());
	let modelRunSelected = $state(new Date());
	let mapBounds: any = $state();

	const TILE_SIZE = Number(import.meta.env.VITE_TILE_SIZE) || 256;

	let loading = $state(false);

	const changeOMfileURL = async () => {
		if (map) {
			loading = true;
			if (popup) {
				popup.remove();
			}

			mapBounds = map.getBounds();
			if (timeSliderApi) {
			timeSliderApi.setDisabled(true);
			}

			omUrl = getOMUrl();

			// Supprimer l'ancienne couche et en créer une nouvelle
			if (omFileLayer) {
				map.removeLayer(omFileLayer);
			}

			await addOmFileLayer();

			// Simple loading simulation
			setTimeout(() => {
				if (timeSliderApi) {
					timeSliderApi.setDisabled(false);
				}
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
		const { createLeafletControl } = await import('$lib/leaflet-utils');

		// Créer les contrôles personnalisés Leaflet
		const variableControl = await createLeafletControl({
			onAdd: function(map) {
				const div = L.DomUtil.create('div', 'leaflet-control-variable');
				div.innerHTML = `<button style="padding: 5px; background: white; border: 1px solid #ccc; border-radius: 3px;" title="Variables">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M18 22H4a2 2 0 0 1-2-2V6"/><path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18"/>
						<circle cx="12" cy="8" r="2"/><rect width="16" height="16" x="6" y="2" rx="2"/>
					</svg>
				</button>`;

				L.DomEvent.on(div, 'click', () => {
					drawerOpen = !drawerOpen;
				});

				return div;
			}
		}, { position: 'topright' });

		const timeControl = await createLeafletControl({
			onAdd: function(map) {
				const div = L.DomUtil.create('div', 'leaflet-control-time');
				div.innerHTML = `<button style="padding: 5px; background: white; border: 1px solid #ccc; border-radius: 3px;" title="Time Selector">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M16 14v2.2l1.6 1"/><path d="M16 2v4"/><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/>
						<path d="M3 10h5"/><path d="M8 2v4"/><circle cx="16" cy="16" r="6"/>
					</svg>
				</button>`;

				L.DomEvent.on(div, 'click', () => {
					showTimeSelector = !showTimeSelector;
				});

				return div;
			}
		}, { position: 'topright' });

		// Créer la carte Leaflet
		map = await createLeafletMap(mapContainer as HTMLElement, {
			center: typeof domain.grid.center == 'object' ? [domain.grid.center.lat, domain.grid.center.lng] : [47.3769, 8.5417],
			zoom: domain?.grid.zoom || 6
		});

		// Ajouter les contrôles
		variableControl.addTo(map);
		timeControl.addTo(map);

		// Initialiser les bounds
			mapBounds = map.getBounds();

		// Charger les données du domaine
			latest = await getDomainData();
			omUrl = getOMUrl();
		await addOmFileLayer();

		// Setup time slider
			timeSliderApi = createTimeSlider({
				container: timeSliderContainer,
				initialDate: timeSelected,
			onChange: async (newDate) => {
					timeSelected = newDate;
					url.searchParams.set('time', newDate.toISOString().replace(/[:Z]/g, '').slice(0, 15));
					history.pushState({}, '', url);
				await changeOMfileURL();
				},
				resolution: domain.time_interval
			});

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
		if (timeSliderContainer) {
			timeSliderContainer.innerHTML = ``;
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

<div class="map" id="#map_container" bind:this={mapContainer}></div>
<div class="absolute bottom-1 left-1 max-h-[300px]">
	<Scale {showScale} {variable} />
	<SelectedVariables {domain} {variable} />
</div>
<div
	class="bg-background/50 absolute bottom-14.5 left-[50%] mx-auto transform-[translate(-50%)] rounded-lg px-4 py-4 {!showTimeSelector
		? 'pointer-events-none opacity-0'
		: 'opacity-100'}"
>
	<div
		bind:this={timeSliderContainer}
		class="time-slider-container flex flex-col items-center gap-0"
	></div>
</div>
<div class="absolute">
	<Drawer.Root bind:open={drawerOpen}>
		<Drawer.Content class="h-1/3">
			<div class="flex flex-col items-center overflow-y-scroll pb-12">
				<div class="container mx-auto px-3">
					<VariableSelection
						{domain}
						{variable}
						{modelRuns}
						{timeSelected}
						{latestRequest}
						{progressRequest}
						{modelRunSelected}
						domainChange={(value: string) => {
							domain = domains.find((dm) => dm.value === value) ?? domains[0];
							url.searchParams.set('domain', value);
							pushState(url.toString(), {});
							toast('Domain set to: ' + domain.label);
							changeOMfileURL();
						}}
						modelRunChange={(mr: Date) => {
							modelRunSelected = mr;
							url.searchParams.set('model', mr.toISOString().replace(/[:Z]/g, '').slice(0, 15));
							pushState(url.toString(), {});
							toast(
								'Model run set to: ' +
									mr.getUTCFullYear() +
									'-' +
									pad(mr.getUTCMonth() + 1) +
									'-' +
									pad(mr.getUTCDate()) +
									' ' +
									pad(mr.getUTCHours()) +
									':' +
									pad(mr.getUTCMinutes())
							);
							changeOMfileURL();
						}}
						variableChange={(value: string) => {
							variable = variables.find((v) => v.value === value) ?? variables[0];
							url.searchParams.set('variable', variable.value);
							pushState(url.toString(), {});
							toast('Variable set to: ' + variable.label);
							changeOMfileURL();
						}}
					/>
				</div>
			</div>
		</Drawer.Content>
	</Drawer.Root>
</div>
