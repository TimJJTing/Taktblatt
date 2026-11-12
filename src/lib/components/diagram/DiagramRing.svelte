<script lang="ts">
	import { untrack } from 'svelte';
	import { GeometryTween } from './geometry-tween.svelte.ts';
	import type { Junction } from '#lib/scene/types.ts';
	let {
		junction,
		width,
		still = false
	}: { junction: Junction; width: number; still?: boolean } = $props();
	const point = () => ({
		x: junction.point.x.f * width + junction.point.x.px,
		y: junction.point.y.px
	});
	const pos = new GeometryTween(
		untrack(point),
		untrack(() => width)
	);
	$effect(() => {
		pos.set(point(), { width, still });
	});
</script>

<svg
	x={pos.current.x - (still ? 2 : 3)}
	y={pos.current.y - (still ? 2 : 3)}
	width={still ? 4 : 6}
	style:width="{still ? 4 : 6}px"
	height={still ? 4 : 6}
	style:height="{still ? 4 : 6}px"
	aria-hidden="true"
	data-testid={still ? 'sheet-gantt-junction' : 'gantt-junction'}
	><circle
		cx={still ? 2 : 3}
		cy={still ? 2 : 3}
		r={still ? 1.5 : 2.5}
		stroke="currentColor"
		fill={still ? '#FFFFFF' : 'var(--background, #FFFFFF)'}
	/></svg
>

<style>
	@media (forced-colors: active) {
		circle {
			forced-color-adjust: none;
			fill: Canvas;
			stroke: CanvasText;
		}
	}
</style>
