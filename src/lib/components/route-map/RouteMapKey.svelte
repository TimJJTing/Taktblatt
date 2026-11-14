<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	let { still = false }: { still?: boolean } = $props();
	const signs = $derived([
		{ kind: 'workflow', label: m.route_map_key_workflow() },
		{ kind: 'terminus', label: m.route_map_key_terminus() },
		{ kind: 'interchange', label: m.route_map_key_interchange() },
		{ kind: 'walkway', label: m.route_map_key_walkway() },
		{ kind: 'family', label: m.route_map_key_family() },
		{ kind: 'cycle', label: m.route_map_key_cycle() }
	]);
</script>

<ul
	aria-label={m.route_map_key_label()}
	data-testid="route-map-key"
	class="map-key"
	class:paper={still}
>
	{#each signs as sign (sign.kind)}
		<li>
			<svg
				width="24"
				height="20"
				viewBox="0 0 24 20"
				aria-hidden="true"
				class:cycle={sign.kind === 'cycle'}
			>
				{#if sign.kind === 'workflow'}<path
						d="M 0 10 H 24"
						fill="none"
						stroke="currentColor"
						stroke-width="8"
					/>
				{:else if sign.kind === 'terminus'}
					<path d="M 0 10 H 12" fill="none" stroke="currentColor" stroke-width="4" />
					<circle cx="12" cy="10" r="7" class="ground" stroke="currentColor" stroke-width="2" />
					<circle cx="12" cy="10" r="2" fill="currentColor" />
				{:else if sign.kind === 'interchange'}
					<path d="M 0 6 H 24 M 0 14 H 24" fill="none" stroke="currentColor" stroke-width="3" />
					<rect
						x="7"
						y="1"
						width="10"
						height="18"
						rx="5"
						class="ground"
						stroke="currentColor"
						stroke-width="2"
					/>
					<circle cx="12" cy="6" r="2" fill="currentColor" />
					<circle cx="12" cy="14" r="2" fill="currentColor" />
				{:else if sign.kind === 'walkway'}
					<path
						d="M 0 14 L 5 9 H 19 L 24 14"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
					/>
				{:else if sign.kind === 'family'}
					<path d="M 0 5 H 6 L 16 15 H 24" fill="none" stroke="currentColor" stroke-width="2" />
				{:else}
					<path
						d="M 1 10 H 23"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-dasharray="1 4"
					/>
				{/if}
			</svg>
			<span>{sign.label}</span>
		</li>
	{/each}
</ul>

<style>
	.map-key {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 16px;
		color: var(--foreground);
		font-size: 11px;
		font-weight: 400;
		line-height: 16px;
	}
	li {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	svg {
		flex: none;
	}
	.cycle {
		color: var(--destructive);
	}
	.ground {
		fill: var(--background);
	}
	.paper {
		color: var(--color-paper-ink, #1a1d23);
		font-size: 10px;
	}
	.paper .ground {
		fill: white;
	}
	.paper .cycle {
		color: var(--color-paper-warning, #c8352d);
	}
	@media (forced-colors: active) {
		.map-key {
			color: CanvasText;
		}
		svg {
			forced-color-adjust: none;
		}
		.cycle,
		.paper .cycle {
			color: CanvasText;
		}
		.ground,
		.paper .ground {
			fill: Canvas;
		}
	}
</style>
