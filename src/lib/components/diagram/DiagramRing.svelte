<script lang="ts">
	import { motionDuration } from '#lib/motion.ts';
	import { untrack } from 'svelte';
	import { GeometryTween } from './geometry-tween.svelte.ts';
	import type { Junction } from '#lib/scene/types.ts';
	let {
		junction,
		width,
		still = false,
		route = null
	}: {
		junction: Junction;
		width: number;
		still?: boolean;
		route?: 'lit' | 'off' | null;
	} = $props();
	const paint = $derived(still ? null : route);
	const ink = $derived(
		still
			? 'currentColor'
			: paint === 'lit'
				? 'var(--foreground)'
				: paint === 'off'
					? 'color-mix(in oklab, var(--muted-foreground) 30%, var(--background, #FFFFFF))'
					: 'currentColor'
	);
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
	data-junction-key={junction.key}
	data-route={paint ?? undefined}
	data-testid={still ? 'sheet-gantt-junction' : 'gantt-junction'}
	><circle
		class:route-lit={paint === 'lit'}
		style:transition-property="stroke"
		style:transition-duration={`${motionDuration(still ? 0 : 150)}ms`}
		cx={still ? 2 : 3}
		cy={still ? 2 : 3}
		r={still ? 1.5 : 2.5}
		stroke={ink}
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
		circle.route-lit {
			stroke: Highlight;
		}
	}
</style>
