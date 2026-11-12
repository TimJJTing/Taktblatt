<script lang="ts">
	import { untrack } from 'svelte';
	import { GeometryTween } from './geometry-tween.svelte.ts';
	import StationDot from './StationDot.svelte';
	import TaskTap from './TaskTap.svelte';
	import type { GanttMarkGeom } from '#lib/scene/gantt-scene.ts';
	import type { Junction } from '#lib/scene/types.ts';
	import type { TaskStatus } from '#lib/domain/schema.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { markColorLevel, subtaskFill } from '#lib/components/plan/colors.ts';
	interface Props {
		geom: GanttMarkGeom;
		box: { x0: number; x1: number };
		status: TaskStatus;
		color: string;
		width: number;
		taps?: readonly Junction[];
		still?: boolean;
		subtask?: boolean;
	}
	let {
		geom,
		box,
		status,
		color,
		width,
		taps = [],
		still = false,
		subtask = false
	}: Props = $props();
	const ground = $derived(still ? '#FFFFFF' : 'var(--background, #FFFFFF)');
	const base = $derived(
		subtask && status !== 'done' && status !== 'canceled' ? subtaskFill(color, ground) : color
	);
	const ink = $derived(
		`color-mix(in oklab, ${base} ${markColorLevel(status, 'line', false, still)}%, ${ground})`
	);
	// Keep two stable slots. A short bar merges them into one centered station.
	const stationTargets = (g: GanttMarkGeom) => {
		const first = g.stations[0];
		if (g.stations.length === 2) return [...g.stations];
		if (
			first &&
			(g.mark.kind === 'point' || (g.mark.kind === 'bar' && !g.mark.clipStart && !g.mark.clipEnd))
		)
			return [first, first];
		const empty = (x: number) => ({ x, y: first?.y ?? g.line?.y ?? 0, r: 0, inset: 0 });
		return [
			g.mark.kind === 'bar' && g.mark.clipStart ? empty(g.line?.x0 ?? 0) : (first ?? empty(0)),
			g.mark.kind === 'bar' && g.mark.clipEnd ? empty(g.line?.x1 ?? 0) : (first ?? empty(0))
		];
	};
	const stations = new GeometryTween(
		untrack(() => stationTargets(geom)),
		untrack(() => width)
	);
	$effect(() => {
		stations.set(stationTargets(geom), { width, still });
	});
</script>

<div
	class="task-mark-contents absolute inset-0"
	style:clip-path="inset(-10px {Math.min(0, box.x1 - width)}px -10px {-Math.max(0, box.x0)}px)"
>
	{#if geom.line}
		<div
			data-gantt-line
			class="task-line absolute top-1/2 w-full -translate-y-1/2"
			style:height="{geom.line.height}px"
			style:background={ink}
			style:transition-property="background-color"
			style:transition-duration={`${still ? 0 : motionDuration(150)}ms`}
			style:border-top-left-radius={geom.mark.kind === 'bar' && !geom.mark.clipStart
				? '999px'
				: '0px'}
			style:border-bottom-left-radius={geom.mark.kind === 'bar' && !geom.mark.clipStart
				? '999px'
				: '0px'}
			style:border-top-right-radius={geom.mark.kind === 'bar' && !geom.mark.clipEnd
				? '999px'
				: '0px'}
			style:border-bottom-right-radius={geom.mark.kind === 'bar' && !geom.mark.clipEnd
				? '999px'
				: '0px'}
		></div>
	{/if}
	{#each taps as tap (tap.key)}<TaskTap {tap} {width} left={box.x0} {still} />{/each}
	{#each stations.current as station, i (i)}
		{#if station.r > 0 && (i === 0 || Math.abs(station.x - stations.current[0].x) > 1e-7 || Math.abs(station.r - stations.current[0].r) > 1e-7)}
			<span
				class="absolute top-1/2 flex -translate-y-1/2"
				style:left={i === 0 ? '0px' : undefined}
				style:right={i === 1 ? '0px' : undefined}
				style:transform="translateX({i === 0
					? Math.max(0, station.x - box.x0 - station.r)
					: -Math.max(0, box.x1 - station.x - station.r)}px)"
			>
				<StationDot {status} {color} size={station.r * 2} inset={station.inset} {still} />
			</span>
		{/if}
	{/each}
</div>

<style>
	@media (forced-colors: active) {
		.task-line {
			forced-color-adjust: none;
			background: CanvasText !important;
		}
	}
</style>
