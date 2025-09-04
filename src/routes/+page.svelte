<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import { pushState } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	// Import Leaflet (sera importé dynamiquement dans onMount pour éviter SSR)
	import 'leaflet/dist/leaflet.css';

	// Import de la fonction pour récupérer les valeurs météo depuis la couleur
	import { getValueFromColorScale } from '$lib/utils/color-to-value';
	import { getColorScale } from '$lib/utils/color-scales';
	import { pad } from '$lib/utils/pad';
	import { domains } from '$lib/utils/domains';
	import { hideZero, variables } from '$lib/utils/variables';

	import type { Variable, Domain } from '$lib/types';

	// Import utilitaires Leaflet
	import { loadLeaflet, createLeafletMap } from '$lib/leaflet-utils';

	// Simplified state
	let partial = $state(false);
	let showScale = $state(true);
	let showTimeSelector = $state(true);
	let dataStatus = $state({ available: true, message: 'Chargement...', referenceTime: '' });

	import '../styles.css';
	import Scale from '$lib/components/scale/scale.svelte';
	import { CustomSelect } from '$lib/components/ui/custom-select';
	import { SimpleTimeSlider } from '$lib/components/ui/simple-time-slider';
	import { SimpleWeatherPopup } from '$lib/components/simple-weather-popup';

	// Le time slider est maintenant géré par le composant SimpleTimeSlider

	// Leaflet layer management
	let omFileLayer: any = null;
	let windArrowsLayer: any = null;

	// Réglages flèches (UI)
	let showArrowsSettings = $state(false);
	let arrowGridSize = $state<number | undefined>(undefined); // undefined => auto
	let arrowLineWidth = $state(2);
	let arrowHeadSize = $state(6);
	let arrowOpacity = $state(0.85);
	let arrowHalo = $state(true);
	let arrowHaloWidth = $state(1.5);
	let arrowUsePalette = $state(true);
	let arrowFixedColor = $state('#000000');

	const hexToRgb = (hex: string): [number, number, number] => {
		const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
	};

	const getArrowStyle = () => ({
		lineWidth: arrowLineWidth,
		headSize: arrowHeadSize,
		opacity: arrowOpacity,
		useSpeedColor: arrowUsePalette,
		color: hexToRgb(arrowFixedColor) as [number, number, number],
		halo: arrowHalo,
		haloWidth: arrowHaloWidth
	});

	const updateArrowsLayerOptions = async () => {
		if (windArrowsLayer) {
			windArrowsLayer.updateOptions({ gridSize: arrowGridSize, arrowStyle: getArrowStyle() });
		}
	};

			const addOmFileLayer = async () => {
		if (!map || !omUrl) return;

		console.log('🚀 [PAGE] addOmFileLayer() appelée:', {
			omUrl: omUrl.substring(0, 100) + '...',
			domain: domain.value,
			variable: variable.value
		});

		// Import des couches avec worker
		const { createOMapsLayerWithWorker, createWindArrowsLayerWithWorker } = await import('$lib/leaflet-omaps-layer');

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

		// Ajouter la couche de flèches si variable vent moyenne
		if (variable.value === 'wind_10m') {
			windArrowsLayer = await createWindArrowsLayerWithWorker({
				omUrl: omUrl,
				domain: domain,
				variable: variable,
				opacity: 1,
				gridSize: arrowGridSize,
				// @ts-ignore - options étendues
				arrowStyle: getArrowStyle()
			});
			windArrowsLayer.addTo(map);
			console.log('🧭 [PAGE] Couche flèches ajoutée');
		}
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

			omUrl = await getOMUrl();

			// Supprimer les anciennes couches et en créer de nouvelles
			if (omFileLayer) {
				map.removeLayer(omFileLayer);
			}
			if (windArrowsLayer) {
				map.removeLayer(windArrowsLayer);
				windArrowsLayer = null;
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

	// Variables pour le popup météo simple au passage de la souris
	let simplePopupVisible = $state(false);
	let simplePopupX = $state(0);
	let simplePopupY = $state(0);
	let simplePopupValue = $state('');

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
			omUrl = await getOMUrl();

			// Initialiser le statut des données
			dataStatus = {
				available: true,
				message: 'Données actuelles',
				referenceTime: modelRunSelected.toISOString()
			};

		await addOmFileLayer();

		// Le time slider sera maintenant géré par le composant SimpleTimeSlider

		// Gestionnaire de clic basique (supprimé car remplacé par le gestionnaire de coordonnées)

				// 🎯 GESTIONNAIRE POUR AFFICHER LES COORDONNÉES ET LA COULEUR AU CLIC
		map.on('click', (e: any) => {
			const lat = e.latlng.lat;
			const lng = e.latlng.lng;

			// Formater les coordonnées avec 6 décimales
			const latFormatted = lat.toFixed(6);
			const lngFormatted = lng.toFixed(6);

			// Capturer la couleur du pixel à la position cliquée
			let colorInfo = '';
			try {
				console.log('🔍 [DEBUG] Vérification couche météo:', {
					omFileLayer: !!omFileLayer,
					hasTiles: !!(omFileLayer && omFileLayer._tiles),
					tilesCount: omFileLayer ? Object.keys(omFileLayer._tiles || {}).length : 0
				});

				if (omFileLayer && omFileLayer._tiles) {
					// Afficher les clés de tuiles disponibles pour le débogage
					const availableTileKeys = Object.keys(omFileLayer._tiles);
					console.log('🔍 [DEBUG] Tuiles disponibles:', availableTileKeys.slice(0, 10)); // Afficher les 10 premières

										// Utiliser la méthode Leaflet pour obtenir les coordonnées de tuile
					const zoom = map.getZoom();
					const point = map.project(e.latlng, zoom);
					const tileCoords = {
						x: Math.floor(point.x / 256),
						y: Math.floor(point.y / 256),
						z: zoom
					};

					console.log('🔍 [DEBUG] Recherche tuile:', {
						clickPoint: e.latlng,
						zoom: zoom,
						projectedPoint: point,
						tileCoords: tileCoords,
						availableKeys: availableTileKeys.slice(0, 5)
					});

					// Chercher la tuile dans le cache avec le bon format de clé (x:y:z)
					const tileKey = `${tileCoords.x}:${tileCoords.y}:${tileCoords.z}`;
					const tile = omFileLayer._tiles[tileKey];

					console.log('🔍 [DEBUG] Tuile trouvée:', {
						tileKey: tileKey,
						tile: !!tile,
						tileEl: !!(tile && tile.el),
						tileElType: tile && tile.el ? tile.el.tagName : 'N/A'
					});

										if (tile && tile.el && tile.el.tagName === 'CANVAS') {
						const canvas = tile.el;
						const ctx = canvas.getContext('2d');

						if (ctx) {
							// Calculer la position relative dans la tuile
							const projectedPoint = map.project(e.latlng);
							const tileSize = 256;
							const tilePoint = {
								x: Math.floor(projectedPoint.x % tileSize),
								y: Math.floor(projectedPoint.y % tileSize)
							};

							console.log('🔍 [DEBUG] Position dans tuile:', tilePoint);

														// Capturer la couleur du pixel
							const imageData = ctx.getImageData(tilePoint.x, tilePoint.y, 1, 1);
							const [r, g, b, a] = imageData.data;

														// Formater la couleur RGBA
							colorInfo = `\nCouleur: rgba(${r}, ${g}, ${b}, ${(a/255).toFixed(2)})`;

							// Convertir la couleur en valeur météo avec l'échelle précise
							const weatherValue = getValueFromColorScale(r, g, b, a, variable);
							colorInfo += `\n${variable.label}: ${weatherValue}`;

							console.log('🎨 [CLICK] Couleur pixel:', { r, g, b, a, tileCoords, tilePoint, weatherValue });
						}
					} else {
						console.log('⚠️ [DEBUG] Tuile non disponible ou pas un canvas');
						colorInfo = '\nCouleur: Tuile non disponible';
					}
				} else {
					console.log('⚠️ [DEBUG] Pas de couche météo ou pas de tuiles');
					colorInfo = '\nCouleur: Pas de données météo';
				}
			} catch (error) {
				console.warn('⚠️ Erreur lors de la capture de couleur:', error);
				colorInfo = '\nCouleur: Erreur de capture';
			}

			// Mettre à jour le popup avec les coordonnées et la couleur
			simplePopupValue = `Lat: ${latFormatted}°\nLng: ${lngFormatted}°${colorInfo}`;
			simplePopupVisible = true;

			// Positionner le popup à la position du clic
			simplePopupX = e.originalEvent.clientX;
			simplePopupY = e.originalEvent.clientY;

			console.log('🗺️ [CLICK] Coordonnées cliquées:', { lat: latFormatted, lng: lngFormatted });
		});
	});
	onDestroy(() => {
		if (map) {
			map.remove();
		}
	});

	/**
	 * 🔍 VALIDATION ET FALLBACK DES DONNÉES MÉTÉO
	 * Teste plusieurs références temporelles pour trouver des données disponibles
	 */
	const findAvailableDataUrl = async (baseModelRun: Date, baseTime: Date, maxRetries = 4): Promise<{ url: string; modelRun: Date; time: Date } | null> => {
		console.log('🔍 [DATA-VALIDATION] Recherche de données disponibles...');

		const retryHours = [0, -3, -6, -12, -24]; // Heures de retry

		for (let i = 0; i < Math.min(maxRetries, retryHours.length); i++) {
			const hoursOffset = retryHours[i];
			const testModelRun = new Date(baseModelRun);
			testModelRun.setUTCHours(testModelRun.getUTCHours() + hoursOffset);

			const testTime = new Date(baseTime);
			testTime.setUTCHours(testTime.getUTCHours() + hoursOffset);

			// Construire l'URL de test
			const testUrl = `https://map-tiles.open-meteo.com/data_spatial/${domain.value}/${testModelRun.getUTCFullYear()}/${pad(testModelRun.getUTCMonth() + 1)}/${pad(testModelRun.getUTCDate())}/${pad(testModelRun.getUTCHours())}00Z/${testTime.getUTCFullYear()}-${pad(testTime.getUTCMonth() + 1)}-${pad(testTime.getUTCDate())}T${pad(testTime.getUTCHours())}00.om`;

			console.log(`🔍 [DATA-VALIDATION] Test ${i + 1}/${maxRetries}: ${testUrl.substring(0, 100)}...`);

			try {
				const response = await fetch(testUrl, { method: 'HEAD' });
				if (response.ok) {
					console.log(`✅ [DATA-VALIDATION] Données trouvées pour ${testModelRun.toISOString()}`);
					return {
						url: testUrl,
						modelRun: testModelRun,
						time: testTime
					};
				}
			} catch (error) {
				console.log(`❌ [DATA-VALIDATION] Erreur pour ${testModelRun.toISOString()}:`, error);
			}
		}

		console.error('❌ [DATA-VALIDATION] Aucune donnée disponible après tous les retries');
		return null;
	};

	const getOMUrl = async () => {
		if (!mapBounds) return '';

		console.log('🔄 [OM-URL] Recherche d\'URL disponible...');

		// Rechercher une URL disponible avec fallback
		const availableData = await findAvailableDataUrl(modelRunSelected, timeSelected);

		if (!availableData) {
			console.error('❌ [OM-URL] Aucune donnée disponible');
			dataStatus = { available: false, message: 'Aucune donnée disponible', referenceTime: '' };
			toast.error('Aucune donnée météo disponible pour cette période. Veuillez essayer une date antérieure.');
			return '';
		}

		// Mettre à jour les dates si nécessaire
		if (availableData.modelRun.getTime() !== modelRunSelected.getTime()) {
			console.log('🔄 [OM-URL] Utilisation d\'une référence antérieure:', availableData.modelRun.toISOString());
			modelRunSelected = availableData.modelRun;
			dataStatus = {
				available: true,
				message: `Utilisation de données antérieures (${availableData.modelRun.toISOString().slice(0, 16).replace('T', ' ')})`,
				referenceTime: availableData.modelRun.toISOString()
			};
		}

		if (availableData.time.getTime() !== timeSelected.getTime()) {
			console.log('🔄 [OM-URL] Utilisation d\'un temps antérieur:', availableData.time.toISOString());
			timeSelected = availableData.time;
		}

		// Mettre à jour le statut si tout est OK
		if (dataStatus.available && !dataStatus.message) {
			dataStatus = {
				available: true,
				message: 'Données actuelles',
				referenceTime: availableData.modelRun.toISOString()
			};
		}

		// Construire l'URL finale avec les paramètres
		const finalUrl = `${availableData.url}?dark=false&variable=${variable.value}&bounds=${mapBounds.getSouth()},${mapBounds.getWest()},${mapBounds.getNorth()},${mapBounds.getEast()}&partial=${partial}`;

		console.log('✅ [OM-URL] URL finale construite:', finalUrl.substring(0, 100) + '...');
		return finalUrl;
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

					if (modelRunSelected.getTime() - timeSelected.getTime() > 0) {
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
		if (latest && (latest as any).reference_time) {
			let referenceTime = new Date((latest as any).reference_time);
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
	<div class="absolute bottom-1 right-1 z-[100005] bg-black/70 text-white text-xs p-2 rounded">
		TimeSelector: {showTimeSelector ? 'VISIBLE' : 'CACHÉ'}
	</div>

			<!-- Panneau supprimé - informations intégrées dans le time slider -->

	<!-- Échelle de couleur -->
	<div class="absolute bottom-1 left-1 max-h-[300px] z-[100005] pointer-events-none">
		<Scale {showScale} {variable} />
	</div>
</div>

<!-- Interface épurée - plus de drawer -->

<!-- Dropdowns flottants pour Modèle et Variable -->
<div class="absolute top-4 right-4 flex flex-row gap-3 pointer-events-auto" style="z-index: 99999;">
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

	<!-- Réglages flèches -->
	<div class="bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-gray-200" style="z-index: 100003; min-width: 260px;">
		<div class="flex items-center justify-between mb-2">
			<div class="font-semibold">Flèches</div>
			<label class="text-sm flex items-center gap-2">
				<input type="checkbox" bind:checked={showArrowsSettings} />
				<span>Afficher réglages</span>
			</label>
		</div>
		{#if showArrowsSettings}
			<div class="space-y-2 text-sm">
				<div class="flex items-center justify-between gap-2">
					<label>Densité</label>
					<input type="range" min="6" max="20" step="1" bind:value={arrowGridSize} on:change={updateArrowsLayerOptions} />
				</div>
				<div class="flex items-center justify-between gap-2">
					<label>Épaisseur</label>
					<input type="range" min="1" max="4" step="0.5" bind:value={arrowLineWidth} on:change={updateArrowsLayerOptions} />
				</div>
				<div class="flex items-center justify-between gap-2">
					<label>Tête</label>
					<input type="range" min="3" max="12" step="1" bind:value={arrowHeadSize} on:change={updateArrowsLayerOptions} />
				</div>
				<div class="flex items-center justify-between gap-2">
					<label>Opacité</label>
					<input type="range" min="0.4" max="1" step="0.05" bind:value={arrowOpacity} on:change={updateArrowsLayerOptions} />
				</div>
				<div class="flex items-center justify-between gap-2">
					<label>Halo</label>
					<input type="checkbox" bind:checked={arrowHalo} on:change={updateArrowsLayerOptions} />
				</div>
				<div class="flex items-center justify-between gap-2">
					<label>Largeur halo</label>
					<input type="range" min="0" max="3" step="0.5" bind:value={arrowHaloWidth} on:change={updateArrowsLayerOptions} />
				</div>
				<div class="flex items-center justify-between gap-2">
					<label>Palette vitesse</label>
					<input type="checkbox" bind:checked={arrowUsePalette} on:change={updateArrowsLayerOptions} />
				</div>
				{#if !arrowUsePalette}
					<div class="flex items-center justify-between gap-2">
						<label>Couleur</label>
						<input type="color" bind:value={arrowFixedColor} on:change={updateArrowsLayerOptions} />
					</div>
				{/if}
			</div>
		{/if}
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
		modelRunTime={modelRunSelected}
		dataStatus={dataStatus}
		on:change={async (e) => {
			console.log('🕐 [TIME-SLIDER] Changement de temps:', e.detail);
			timeSelected = e.detail;
			url.searchParams.set('time', e.detail.toISOString().replace(/[:Z]/g, '').slice(0, 15));
			history.pushState({}, '', url);
			await changeOMfileURL();
		}}
	/>
</div>

<!-- 🎯 POPUP MÉTÉO SIMPLE AU PASSAGE DE LA SOURIS -->
<SimpleWeatherPopup
	visible={simplePopupVisible}
	x={simplePopupX}
	y={simplePopupY}
	value={simplePopupValue}
	variable={variable.value}
/>

<!-- Interface épurée - plus de drawer -->
