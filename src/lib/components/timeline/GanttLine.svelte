<script lang="ts">
	import { untrack } from 'svelte';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import { markColorLevel } from '#lib/components/plan/colors.ts';
	import { motionDuration } from '#lib/motion.ts';
	import type { EdgeGeom } from '#lib/scene/types.ts';
	interface Props {
		line: EdgeGeom;
		muted: boolean;
		width: number;
		strokeWidth?: number;
		// Stub: slice 4 implementation pending.
		tween?: GeometryTween<{ x: number; y: number }[]>;
		// Stub: slice 4 implementation pending.
		route?: 'lit' | 'off' | null;
	}
	// eslint-disable-next-line svelte/no-unused-props -- Stub: slice 4 implementation pending.
	let { line, muted, width, strokeWidth = 2 }: Props = $props();
	const points = (edge: EdgeGeom, extent: number) =>
		edge.points.map((p) => ({ x: p.x.f * extent + p.x.px, y: p.y.px }));
	const pos = new GeometryTween(
		untrack(() => points(line, width)),
		untrack(() => width)
	);
	$effect(() => {
		pos.set(points(line, width), { width });
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
			? `color-mix(in oklab, currentColor ${markColorLevel('done', 'connector')}%, var(--background, #FFFFFF))`
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
