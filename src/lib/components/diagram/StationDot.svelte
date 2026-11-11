<script lang="ts">
	import type { TaskStatus } from '#lib/domain/schema.ts';
	import { motionDuration } from '#lib/motion.ts';

	interface Props {
		status: TaskStatus;
		color: string;
		size?: number;
		/** Static paper output. The ground stays white. */
		still?: boolean;
		/** Omit when the containing task control already names the status. */
		label?: string;
	}

	let { status, color, size = 8, still = false, label }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 16 16"
	class="station-dot inline-block shrink-0"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : true}
	style:color
	style:--station-ground={still ? '#FFFFFF' : 'var(--background, #FFFFFF)'}
	style:transition-duration={`${still ? 0 : motionDuration(150)}ms`}
>
	<circle cx="8" cy="8" r="6" fill="var(--station-ground)" />
	<g opacity={status === 'canceled' ? 0.4 : 1}>
		<circle
			cx="8"
			cy="8"
			r="6"
			fill={status === 'done' || status === 'canceled' ? 'currentColor' : 'none'}
			stroke="currentColor"
			stroke-width="2"
		/>
		{#if status === 'in_progress'}
			<path d="M 8 2 A 6 6 0 0 1 8 14 Z" fill="currentColor" />
		{/if}
	</g>
</svg>

<style>
	.station-dot {
		transition-property: color, width, height;
	}
</style>
