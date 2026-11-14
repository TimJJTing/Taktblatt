<script lang="ts">
	import { untrack } from 'svelte';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import StationDot from '#lib/components/diagram/StationDot.svelte';
	import type { RouteMapSign } from '#lib/scene/route-map-layout.ts';
	import RouteMapTerminus from './RouteMapTerminus.svelte';
	let { sign }: { sign: RouteMapSign } = $props();
	const point = new GeometryTween(untrack(() => sign.center));
	$effect(() => point.set(sign.center));
</script>

<div
	class="pointer-events-none absolute flex items-center justify-center"
	aria-hidden="true"
	style:left="{point.current.x - 7}px"
	style:top="{point.current.y - 7}px"
	style:width="14px"
	style:height="14px"
>
	<RouteMapTerminus {sign} /><span class="relative flex"
		><StationDot status="todo" color="var(--foreground)" size={8} /></span
	>
</div>
