<script lang="ts">
	import { untrack } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { motionDuration, GEOMETRY_MOTION_MS } from '#lib/motion.ts';
	import type { Junction } from '#lib/scene/types.ts';
	let {
		tap,
		width,
		left,
		still = false
	}: { tap: Junction; width: number; left: number; still?: boolean } = $props();
	const x = () => tap.point.x.f * width + tap.point.x.px;
	const pos = new Tween(untrack(x));
	let previousWidth = untrack(() => width);
	let previousTarget = untrack(x);
	$effect(() => {
		const target = x();
		const resized = previousWidth !== width;
		previousWidth = width;
		if (!resized && target === previousTarget) return;
		previousTarget = target;
		pos.set(target, {
			duration: still || resized ? 0 : motionDuration(GEOMETRY_MOTION_MS),
			easing: cubicOut
		});
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
