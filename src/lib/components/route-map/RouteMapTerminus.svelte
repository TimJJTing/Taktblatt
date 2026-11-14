<script lang="ts">
	import type { RouteMapSign } from '#lib/scene/route-map-layout.ts';
	let { sign, still = false }: { sign: RouteMapSign; still?: boolean } = $props();
</script>

<svg
	width={sign.width}
	height={sign.height}
	viewBox="0 0 {sign.width} {sign.height}"
	class="pointer-events-none absolute"
	style:left="calc(50% - {sign.width / 2}px)"
	style:top="calc(50% - {sign.height / 2}px)"
	aria-hidden="true"
	data-testid="route-map-terminus"
	data-station={sign.stationId ?? undefined}
>
	<circle
		data-sign-outline
		cx={sign.width / 2}
		cy={sign.height / 2}
		r={(sign.width - sign.outlineWidth) / 2}
		fill={still ? 'white' : 'var(--background)'}
		stroke={still ? 'var(--color-paper-ink, #1A1D23)' : 'var(--foreground)'}
		stroke-width={sign.outlineWidth}
	/>
</svg>

<style>
	@media (forced-colors: active) {
		circle {
			forced-color-adjust: none;
			fill: Canvas;
			stroke: CanvasText;
		}
	}
</style>
