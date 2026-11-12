<script lang="ts">
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { todayTagPlacement } from './today-tag-placement.ts';

	let {
		x,
		today,
		milestones,
		chartWidth,
		still = false,
		width
	}: {
		x: number;
		today: number | null;
		milestones: readonly number[];
		chartWidth: number;
		still?: boolean;
		width?: number;
	} = $props();
	let measuredWidth = $state(0);
	const placement = $derived(
		todayTagPlacement(today, milestones, chartWidth, width ?? measuredWidth)
	);

	function measureTag(tag: HTMLSpanElement) {
		// Paper receives its placement before paint and has no layout observers.
		if (still) return;
		function measure() {
			measuredWidth = tag.getBoundingClientRect().width;
		}
		const resize = new ResizeObserver(measure);
		resize.observe(tag, { box: 'border-box' });
		measure();
		return {
			destroy() {
				resize.disconnect();
			}
		};
	}
</script>

{#if placement.side !== 'hidden'}
	<span
		use:measureTag
		class="today-tag pointer-events-none absolute top-1/2 rounded-sm px-0.5 text-[10px] leading-tight font-medium whitespace-nowrap"
		class:still
		style:left="{x * 100}%"
		style:width={width === undefined ? undefined : `${width}px`}
		style:transform="translate({placement.offset}px, -50%)"
		style:transition-duration="{still ? 0 : motionDuration(150)}ms"
		data-side={placement.side}
		data-testid={still ? 'sheet-gantt-today-label' : 'gantt-today-label'}>{m.gantt_today()}</span
	>
{/if}

<style>
	.today-tag {
		background: var(--foreground);
		color: var(--background);
		transition-property: transform;
	}
	.still {
		background: var(--color-paper-ink);
		color: var(--color-paper);
		font-size: 8px;
		text-align: center;
		transition: none;
	}
	/* The global reduced-motion rule keeps a 0.01 ms transition. Remove it here, so a
	   color or side change applies in the same frame. */
	@media (prefers-reduced-motion: reduce) {
		.today-tag {
			transition: none;
		}
	}
</style>
