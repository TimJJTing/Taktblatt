<script lang="ts">
	import { untrack } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { GEOMETRY_MOTION_MS, motionDuration } from '#lib/motion.ts';
	import type { EdgeGeom } from '#lib/scene/types.ts';
	interface Props {
		line: EdgeGeom;
		muted: boolean;
		width: number;
		strokeWidth?: number;
	}
	let { line, muted, width, strokeWidth = 2 }: Props = $props();
	const points = (edge: EdgeGeom, extent: number) =>
		edge.points.map((p) => ({ x: p.x.f * extent + p.x.px, y: p.y.px }));
	const pos = new Tween(untrack(() => points(line, width)));
	let previousWidth = untrack(() => width);
	let previousTarget = untrack(() => points(line, width));
	$effect(() => {
		const next = points(line, width);
		const resized = width !== previousWidth;
		previousWidth = width;
		if (
			!resized &&
			next.every((p, i) => p.x === previousTarget[i]?.x && p.y === previousTarget[i]?.y)
		)
			return;
		previousTarget = next;
		pos.set(next, { duration: resized ? 0 : motionDuration(GEOMETRY_MOTION_MS), easing: cubicOut });
	});
	const d = $derived(pos.current.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' '));
</script>

{#if line.cycle}
	<path
		{d}
		class="cycle-casing"
		fill="none"
		stroke="var(--background, #FFFFFF)"
		stroke-width="4"
		aria-hidden="true"
		data-overlay-for={line.key}
	/>
{/if}
<path
	{d}
	class:muted
	class={line.cycle ? 'text-destructive' : undefined}
	data-cycle={line.cycle ? 'true' : undefined}
	fill="none"
	stroke={line.cycle
		? 'currentColor'
		: muted
			? 'color-mix(in oklab, currentColor 40%, var(--background, #FFFFFF))'
			: 'currentColor'}
	stroke-width={line.cycle ? 2 : strokeWidth}
	stroke-dasharray={line.cycle ? '1 4' : undefined}
	stroke-linecap={line.cycle ? 'round' : undefined}
	style:transition-property="stroke"
	style:transition-duration={`${motionDuration(150)}ms`}
	data-testid="gantt-dependency"
	data-from={line.from}
	data-to={line.to}
/>

<style>
	@media (forced-colors: active) {
		.cycle-casing {
			forced-color-adjust: none;
			stroke: Canvas;
		}
		.muted {
			forced-color-adjust: none;
			stroke: CanvasText;
		}
	}
</style>
