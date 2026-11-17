<script lang="ts">
	import { untrack } from 'svelte';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import type { RouteMapSign } from '#lib/scene/route-map-layout.ts';
	let { sign, still = false }: { sign: RouteMapSign; still?: boolean } = $props();
	const dimensions = () => ({ width: sign.width, height: sign.height });
	const geom = new GeometryTween(untrack(dimensions));
	$effect(() => geom.set(dimensions(), { still }));
</script>

<svg
	width={geom.current.width}
	height={geom.current.height}
	viewBox="0 0 {geom.current.width} {geom.current.height}"
	class="pointer-events-none absolute overflow-visible"
	style:left="calc(50% - {geom.current.width / 2}px)"
	style:top="calc(50% - {geom.current.height / 2}px)"
	aria-hidden="true"
	data-testid="route-map-interchange"
	data-station={sign.stationId ?? undefined}
>
	<rect
		data-sign-outline
		x={sign.outlineWidth / 2}
		y={sign.outlineWidth / 2}
		width={geom.current.width - sign.outlineWidth}
		height={geom.current.height - sign.outlineWidth}
		rx={geom.current.width / 2}
		fill={still ? 'white' : 'var(--background)'}
		stroke={still ? 'var(--color-paper-ink, #1A1D23)' : 'var(--foreground)'}
		stroke-width={sign.outlineWidth}
	/>
</svg>

<style>
	@media (forced-colors: active) {
		rect {
			forced-color-adjust: none;
			fill: Canvas;
			stroke: CanvasText;
		}
	}
</style>
