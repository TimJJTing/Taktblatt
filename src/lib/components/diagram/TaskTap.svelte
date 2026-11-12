<script lang="ts">
	import { untrack } from 'svelte';
	import { GeometryTween } from './geometry-tween.svelte.ts';
	import type { Junction } from '#lib/scene/types.ts';
	let {
		tap,
		width,
		left,
		still = false
	}: { tap: Junction; width: number; left: number; still?: boolean } = $props();
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
	data-testid={still ? 'sheet-gantt-tap' : 'gantt-tap'}
	data-source={tap.source}
>
	<svg width={still ? 4 : 6} height={still ? 4 : 6} aria-hidden="true"
		><circle
			cx={still ? 2 : 3}
			cy={still ? 2 : 3}
			r={still ? 1.5 : 2.5}
			fill={still ? '#FFFFFF' : 'var(--background, #FFFFFF)'}
			stroke={still ? 'var(--color-paper-ink-3)' : 'var(--muted-foreground)'}
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
	}
</style>
