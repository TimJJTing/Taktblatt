<script lang="ts">
	import { untrack } from 'svelte';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import type { RoutePaint } from '#lib/components/plan/colors.ts';
	import type { EdgeGeom } from '#lib/scene/types.ts';
	import GanttLine from './GanttLine.svelte';

	let {
		line,
		width = 600,
		muted = false,
		strokeWidth = 2,
		route = null
	}: {
		line: EdgeGeom;
		width?: number;
		muted?: boolean;
		strokeWidth?: number;
		route?: RoutePaint;
	} = $props();
	const points = () => line.points.map((p) => ({ x: p.x.f * width + p.x.px, y: p.y.px }));
	const tween = new GeometryTween(
		untrack(points),
		untrack(() => width)
	);
	$effect(() => tween.set(points(), { width }));
	const lineProps = $derived({ line, muted, strokeWidth, tween, route });
</script>

<svg aria-hidden="true" {width} height="300">
	<GanttLine {...lineProps} />
</svg>
