<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	interface Option {
		value: string;
		label: string;
	}

	interface Props {
		options: Option[];
		value: string;
		placeholder?: string;
		label?: string;
		disabled?: boolean;
	}

	let {
		options = [],
		value = '',
		placeholder = 'Sélectionner...',
		label = '',
		disabled = false
	}: Props = $props();

	const dispatch = createEventDispatcher<{ change: string }>();

	let isOpen = $state(false);
	let dropdownRef: HTMLDivElement;
	let buttonRef: HTMLButtonElement;

	// Gestion du clic extérieur pour fermer le dropdown
	function handleClickOutside(event: MouseEvent) {
		if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
			isOpen = false;
		}
	}

	function toggleDropdown(event: MouseEvent) {
		event.stopPropagation();
		event.preventDefault();
		if (!disabled) {
			isOpen = !isOpen;
		}
	}

	function selectOption(optionValue: string, event: MouseEvent) {
		event.stopPropagation();
		event.preventDefault();

		if (value !== optionValue) {
			value = optionValue;
			dispatch('change', optionValue);
		}
		isOpen = false;
	}

	// Fonction pour fermer quand on clique ailleurs
	$effect(() => {
		if (isOpen) {
			document.addEventListener('click', handleClickOutside);
			return () => {
				document.removeEventListener('click', handleClickOutside);
			};
		}
	});

	// Obtenir le label de l'option sélectionnée
	const selectedOption = $derived(options.find(opt => opt.value === value));
	const selectedLabel = $derived(selectedOption?.label || placeholder);
</script>

<div
	bind:this={dropdownRef}
	class="relative w-full"
	style="z-index: 100005;"
>
	{#if label}
		<label class="block text-sm font-bold text-gray-700 mb-2" for="custom-select-{label}">
			{label}
		</label>
	{/if}

	<!-- Bouton principal du select -->
	<button
		bind:this={buttonRef}
		type="button"
		id="custom-select-{label}"
		onclick={toggleDropdown}
		class="w-full p-3 text-left bg-white border-2 border-gray-300 rounded-lg shadow-sm hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200 {disabled ? 'bg-gray-100 cursor-not-allowed' : 'cursor-pointer'}"
		style="pointer-events: auto !important; position: relative !important; z-index: 100006 !important;"
		{disabled}
	>
		<div class="flex items-center justify-between">
			<span class="text-gray-900 font-medium truncate">
				{selectedLabel}
			</span>
			<svg
				class="w-5 h-5 text-gray-400 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
			</svg>
		</div>
	</button>

	<!-- Dropdown menu -->
	{#if isOpen}
		<div
			class="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-xl max-h-60 overflow-y-auto"
			style="z-index: 100010 !important; pointer-events: auto !important;"
		>
			{#each options as option}
				<button
					type="button"
					onclick={(e) => selectOption(option.value, e)}
					class="w-full px-4 py-3 text-left hover:bg-blue-50 focus:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors duration-150 {value === option.value ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-gray-900'}"
					style="pointer-events: auto !important; z-index: 100011 !important;"
				>
					<div class="flex items-center justify-between">
						<span class="truncate">{option.label}</span>
						{#if value === option.value}
							<svg class="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
							</svg>
						{/if}
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* Assurer que le dropdown est toujours au-dessus */
	:global(.custom-select-container) {
		position: relative !important;
		z-index: 1000 !important;
	}
</style>
