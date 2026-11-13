<script lang="ts">
	import type { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import { markColorLevel, type RoutePaint } from '#lib/components/plan/colors.ts';
	import { motionDuration } from '#lib/motion.ts';
	import type { EdgeGeom } from '#lib/scene/types.ts';
	interface Props {
		line: EdgeGeom;
		muted: boolean;
		strokeWidth?: number;
		tween: Pick<GeometryTween<{ x: number; y: number }[]>, 'current'>;
		route?: RoutePaint;
	}
	let { line, muted, strokeWidth = 2, tween, route = null }: Props = $props();
	const d = $derived(tween.current.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' '));
	const offRoute = $derived(!line.cycle && route === 'off');
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
	class:off-route={offRoute}
	data-route={line.cycle ? (route === 'lit' ? 'lit' : undefined) : (route ?? undefined)}
	class={line.cycle ? 'text-destructive' : undefined}
	data-cycle={line.cycle ? 'true' : undefined}
	fill="none"
	stroke={line.cycle
		? 'currentColor'
		: offRoute
			? `color-mix(in oklab, currentColor ${markColorLevel('done', 'connector', true)}%, var(--background, #FFFFFF))`
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
		.muted,
		.off-route {
			forced-color-adjust: none;
			stroke: CanvasText;
		}
	}
</style>
