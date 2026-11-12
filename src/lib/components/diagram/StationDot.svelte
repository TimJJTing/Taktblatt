<script lang="ts">
	import type { TaskStatus } from '#lib/domain/schema.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { markColorLevel } from '#lib/components/plan/colors.ts';
	interface Props {
		status: TaskStatus;
		color: string;
		size?: number;
		inset?: number;
		still?: boolean;
		offRoute?: boolean;
		label?: string;
	}
	let {
		status,
		color,
		size = 8,
		inset = 1,
		still = false,
		offRoute = false,
		label
	}: Props = $props();
	const ground = $derived(still ? '#FFFFFF' : 'var(--background, #FFFFFF)');
	const ink = $derived(
		`color-mix(in oklab, ${color} ${markColorLevel(status, 'dot', offRoute, still)}%, ${ground})`
	);
	const hole = $derived(Math.max(0, size / 2 - inset));
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 {size} {size}"
	class="station-dot inline-block shrink-0"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : true}
	style:color={ink}
	style:--station-ground={ground}
	style:transition-duration={`${still ? 0 : motionDuration(150)}ms`}
>
	<circle cx={size / 2} cy={size / 2} r={size / 2} fill="currentColor" />
	{#if status === 'todo' || status === 'in_progress' || status === 'canceled'}
		<circle cx={size / 2} cy={size / 2} r={hole} fill="var(--station-ground)" />
		{#if status === 'in_progress'}
			<path
				d="M {size / 2} {inset} A {hole} {hole} 0 0 1 {size / 2} {size - inset} Z"
				fill="currentColor"
			/>
		{/if}
	{/if}
	{#if status === 'canceled'}
		<path
			d="M {inset} {size - inset} L {size - inset} {inset}"
			fill="none"
			stroke="currentColor"
			stroke-width={inset}
		/>
	{/if}
</svg>

<style>
	.station-dot {
		transition-property: color;
	}
	@media (forced-colors: active) {
		.station-dot {
			forced-color-adjust: none;
			color: CanvasText !important;
			--station-ground: Canvas !important;
		}
	}
</style>
