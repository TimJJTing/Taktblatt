<script lang="ts">
	import { motionDuration } from '#lib/motion.ts';
	import { untrack } from 'svelte';
	import { GeometryTween } from './geometry-tween.svelte.ts';
	import type { Junction } from '#lib/scene/types.ts';
	let {
		tap,
		width,
		left,
		still = false,
		route = null
	}: {
		tap: Junction;
		width: number;
		left: number;
		still?: boolean;
		route?: 'lit' | 'off' | null;
	} = $props();
	const paint = $derived(still ? null : route);
	const ink = $derived(
		still
			? 'var(--color-paper-ink-3)'
			: paint === 'lit'
				? 'var(--foreground)'
				: paint === 'off'
					? 'color-mix(in oklab, var(--muted-foreground) 30%, var(--background, #FFFFFF))'
					: 'var(--muted-foreground)'
	);
	const x = () => tap.point.x.f * width + tap.point.x.px;
	const pos = new GeometryTween(
		untrack(x),
		untrack(() => width)
	);
	$effect(() => {
		pos.set(x(), { width, still });
	});
</script>

<span
	class="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2"
	style:left="{pos.current - left}px"
	style:width="{still ? 4 : 6}px"
	style:height="{still ? 4 : 6}px"
	aria-hidden="true"
	data-junction-key={tap.key}
	data-route={paint ?? undefined}
	data-testid={still ? 'sheet-gantt-tap' : 'gantt-tap'}
	data-source={tap.source}
>
	<svg width={still ? 4 : 6} height={still ? 4 : 6} aria-hidden="true"
		><circle
			class:route-lit={paint === 'lit'}
			style:transition-property="stroke"
			style:transition-duration={`${motionDuration(still ? 0 : 150)}ms`}
			cx={still ? 2 : 3}
			cy={still ? 2 : 3}
			r={still ? 1.5 : 2.5}
			fill={still ? '#FFFFFF' : 'var(--background, #FFFFFF)'}
			stroke={ink}
		/></svg
	>
</span>

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
