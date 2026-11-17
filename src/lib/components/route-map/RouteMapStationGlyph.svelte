<script lang="ts">
	import { motionDuration } from '#lib/motion.ts';
	import type { RoutePaint } from '#lib/components/plan/colors.ts';
	let {
		color,
		size = 8,
		route = null,
		still = false
	}: { color: string; size?: number; route?: RoutePaint; still?: boolean } = $props();
	const ground = $derived(still ? 'white' : 'var(--background)');
	const ink = $derived(route === 'off' ? `color-mix(in oklab, ${color} 30%, ${ground})` : color);
</script>

<svg
	data-route-map-station-glyph
	width={size}
	height={size}
	viewBox="0 0 {size} {size}"
	aria-hidden="true"
	class="station-glyph shrink-0"
	style:color={ink}
	style:--station-ground={ground}
	style:transition-duration={`${still ? 0 : motionDuration(150)}ms`}
>
	<circle
		cx={size / 2}
		cy={size / 2}
		r={Math.max(1, size / 2 - 0.75)}
		fill="var(--station-ground)"
		stroke="currentColor"
		stroke-width="1.5"
	/>
</svg>

<style>
	.station-glyph {
		overflow: visible;
		transition-property: color;
	}
	@media (forced-colors: active) {
		.station-glyph {
			forced-color-adjust: none;
			color: CanvasText !important;
			--station-ground: Canvas !important;
		}
	}
</style>
