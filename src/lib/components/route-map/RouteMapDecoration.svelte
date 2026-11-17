<script lang="ts">
	import { untrack } from 'svelte';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import type { RouteMapSign } from '#lib/scene/route-map-layout.ts';
	import RouteMapStationGlyph from './RouteMapStationGlyph.svelte';
	let {
		sign,
		measured = true,
		still = false
	}: {
		sign: RouteMapSign;
		measured?: boolean;
		still?: boolean;
	} = $props();
	const point = new GeometryTween(untrack(() => sign.center));
	let initialized = $state(false);
	$effect(() => {
		point.set(sign.center, { still, snap: !initialized });
		initialized ||= measured;
	});
</script>

<div
	class="pointer-events-none absolute flex items-center justify-center"
	aria-hidden="true"
	style:left="{point.current.x - sign.width / 2}px"
	style:top="{point.current.y - sign.height / 2}px"
	style:width="{sign.width}px"
	style:height="{sign.height}px"
>
	<RouteMapStationGlyph
		color={still ? 'var(--color-paper-ink, #1A1D23)' : 'var(--foreground)'}
		size={sign.width}
		{still}
	/>
</div>
