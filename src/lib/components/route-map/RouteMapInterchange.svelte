<script lang="ts">
	import { untrack } from 'svelte';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import type { RouteMapSign } from '#lib/scene/route-map-layout.ts';
	import type { Stage } from '#lib/domain/schema.ts';
	import { stageColorVar, stagePaperColor } from '#lib/components/plan/colors.ts';
	let {
		sign,
		stages,
		still = false
	}: { sign: RouteMapSign; stages: ReadonlyMap<string, Stage>; still?: boolean } = $props();
	const above = $derived(Math.min(0, ...(sign.docks ?? []).map((d) => d.point.y - sign.center.y)));
	const below = $derived(Math.max(0, ...(sign.docks ?? []).map((d) => d.point.y - sign.center.y)));
	const ownY = $derived((sign.height - below - above) / 2);
	const dimensions = () => ({ width: sign.width, height: sign.height, ownY });
	const geom = new GeometryTween(untrack(dimensions));
	$effect(() => geom.set(dimensions(), { still }));
	let dockTweens = $state.raw(new Map<string, GeometryTween<{ y: number }>>());
	$effect(() => {
		const targets = (sign.docks ?? []).map((dock) => ({
			key: dock.key,
			y: dock.point.y - sign.center.y
		}));
		const stillDocks = still;
		untrack(() => {
			const previous = dockTweens;
			dockTweens = new Map(
				targets.map(({ key, y }) => {
					const tween = previous.get(key) ?? new GeometryTween({ y });
					tween.set({ y }, { still: stillDocks });
					return [key, tween];
				})
			);
		});
	});
</script>

<svg
	width={geom.current.width}
	height={geom.current.height}
	viewBox="0 0 {geom.current.width} {geom.current.height}"
	class="pointer-events-none absolute overflow-visible"
	style:left="calc(50% - {geom.current.width / 2}px)"
	style:top="calc(50% - {geom.current.ownY}px)"
	aria-hidden="true"
	data-testid="route-map-interchange"
	data-station={sign.stationId ?? undefined}
	data-slots={sign.slots}
>
	<rect
		data-sign-outline
		x={sign.outlineWidth / 2}
		y={sign.outlineWidth / 2}
		width={geom.current.width - sign.outlineWidth}
		height={geom.current.height - sign.outlineWidth}
		rx={geom.current.width / 2}
		fill={still ? 'white' : 'var(--background)'}
		stroke={still ? 'var(--color-paper-ink, #1A1D23)' : 'var(--foreground)'}
		stroke-width={sign.outlineWidth}
	/>
	{#each sign.docks ?? [] as dock (dock.key)}
		<circle
			data-dock-dot
			cx={geom.current.width / 2}
			cy={geom.current.ownY + (dockTweens.get(dock.key)?.current.y ?? dock.point.y - sign.center.y)}
			r={dock.carrier === 'walkway' ? (still ? 1.25 : 2) : still ? 2 : 3}
			fill={dock.carrier === 'walkway'
				? still
					? 'var(--color-paper-secondary, #68707E)'
					: 'var(--muted-foreground)'
				: still
					? stagePaperColor(stages.get(dock.stageId)!.color)
					: stageColorVar(stages.get(dock.stageId)!.color)}
		/>
	{/each}
</svg>

<style>
	@media (forced-colors: active) {
		rect {
			forced-color-adjust: none;
			fill: Canvas;
			stroke: CanvasText;
		}
		circle {
			forced-color-adjust: none;
			fill: CanvasText;
		}
	}
</style>
