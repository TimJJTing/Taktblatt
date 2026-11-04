<!--
	One Gantt row: the label (chevron, ready light, title) and the mark of the task.
	The row moves to its new position with a tween when rows come in or go out.
	The mark moves with a tween when the plan range changes.
	Bars are read-only. A label click shows the task row in the work plan.
-->
<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { untrack } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { fade } from 'svelte/transition';
	import ReadyDot from '#lib/components/edit/ReadyDot.svelte';
	import { subtaskFill } from '#lib/components/plan/colors.js';
	import { readyCount } from '#lib/domain/dependencies.js';
	import { effectiveOf } from '#lib/domain/derive.js';
	import type { GanttMark, GanttRow } from '#lib/domain/gantt.js';
	import { motionDuration } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getViewer } from '#lib/state/viewer.svelte.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import { cn } from '#lib/utils.js';
	import { clipEdges, ROW_HEIGHT, ROW_MOTION_MS } from './gantt-layout.js';
	import { markLabel } from './mark-label.js';

	interface Props {
		row: GanttRow;
		/** The stage color as a CSS value. */
		color: string;
		highlighted: boolean;
		/** The document locale for dates (BCP 47). */
		locale: string;
		onJump: (id: string) => void;
		onHighlight: (id: string, on: boolean) => void;
	}

	let { row, color, highlighted, locale, onJump, onHighlight }: Props = $props();

	const ws = getWorkspace();
	const viewer = getViewer();

	const task = $derived(ws.index.byId.get(row.id));
	const titleText = $derived(task?.title || m.task_untitled());
	const eff = $derived(effectiveOf(ws.index, row.id));
	const ready = $derived(readyCount(ws.index, row.id));
	const done = $derived(row.done === 'done');
	const subtask = $derived(row.level === 1);
	const mark = $derived(row.mark);

	const markName = $derived(markLabel({ mark, title: titleText, dates: eff, done, intl: locale }));

	const fill = $derived(subtask ? subtaskFill(color) : color);

	const y = new Tween(untrack(() => row.row * ROW_HEIGHT));
	$effect(() => {
		y.set(row.row * ROW_HEIGHT, { duration: motionDuration(ROW_MOTION_MS), easing: cubicOut });
	});

	// The mark moves to its new position when the plan range changes.
	const markX = (value: GanttMark) =>
		value.kind === 'bar'
			? { x0: value.x0, x1: value.x1 }
			: value.kind === 'point'
				? { x0: value.x, x1: value.x }
				: null;
	const x = new Tween(untrack(() => markX(mark) ?? { x0: 0, x1: 0 }));
	$effect(() => {
		const next = markX(mark);
		if (next) x.set(next, { duration: motionDuration(ROW_MOTION_MS), easing: cubicOut });
	});
	const colorDuration = $derived(`${motionDuration(150)}ms`);

	const hover = {
		onpointerenter: () => onHighlight(row.id, true),
		onpointerleave: () => onHighlight(row.id, false),
		onfocusin: () => onHighlight(row.id, true),
		onfocusout: () => onHighlight(row.id, false)
	};
</script>

<div
	class="pointer-events-none absolute inset-x-0 flex"
	style:top="{y.current}px"
	style:height="{ROW_HEIGHT}px"
	data-testid="gantt-row"
	data-task-id={row.id}
	data-highlighted={highlighted || undefined}
	transition:fade={{ duration: motionDuration(150) }}
>
	<div
		class={cn(
			'pointer-events-auto sticky left-0 z-10 flex w-(--gantt-label-width) shrink-0 items-center gap-1 border-r px-1 transition-colors',
			highlighted ? 'bg-accent' : 'bg-background',
			subtask && 'pl-6'
		)}
		style:transition-duration={colorDuration}
		{...hover}
	>
		{#if row.isParent}
			<button
				type="button"
				class="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
				aria-expanded={row.expanded}
				aria-label={row.expanded
					? m.task_collapse({ task: titleText })
					: m.task_expand({ task: titleText })}
				onclick={() => viewer.toggleExpanded(ws.plan.id, row.id)}
				data-testid="gantt-toggle"
			>
				<span
					class={cn('flex transition-transform', row.expanded && 'rotate-90')}
					style:transition-duration={`${motionDuration(200)}ms`}
					aria-hidden="true"><ChevronRightIcon class="size-3.5" /></span
				>
			</button>
		{:else}
			<span class="size-5 shrink-0" aria-hidden="true"></span>
		{/if}
		<ReadyDot count={ready} />
		<button
			type="button"
			class={cn(
				'min-w-0 flex-1 truncate rounded-sm px-0.5 text-left text-xs hover:underline focus-visible:outline-2 focus-visible:outline-ring',
				!subtask && 'font-medium',
				done && 'text-muted-foreground line-through decoration-muted-foreground/50'
			)}
			title={m.gantt_show_row({ task: titleText })}
			onclick={() => onJump(row.id)}
			data-testid="gantt-label">{titleText}</button
		>
	</div>
	<div
		class={cn('relative flex-1 transition-colors', highlighted && 'bg-accent/60')}
		style:transition-duration={colorDuration}
	>
		{#if mark.kind === 'bar'}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				role="img"
				tabindex="0"
				aria-label={markName}
				title={markName}
				class={cn(
					'pointer-events-auto absolute top-1/2 min-w-0.5 -translate-y-1/2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
					!mark.clipStart && 'rounded-l-sm',
					!mark.clipEnd && 'rounded-r-sm',
					highlighted && 'ring-2 ring-ring/70'
				)}
				style:left="{x.current.x0 * 100}%"
				style:width="{(x.current.x1 - x.current.x0) * 100}%"
				style:height={subtask ? '8px' : '14px'}
				data-testid="gantt-bar"
				data-clip-start={mark.clipStart || undefined}
				data-clip-end={mark.clipEnd || undefined}
				{...hover}
			>
				<!-- The clip path is on the fill only. The focus outline and the ring stay visible. -->
				<div
					class={cn(
						'absolute inset-0',
						!mark.clipStart && 'rounded-l-sm',
						!mark.clipEnd && 'rounded-r-sm',
						done && 'opacity-40'
					)}
					style:background={fill}
					style:clip-path={clipEdges(mark.clipStart, mark.clipEnd)}
				></div>
			</div>
		{:else if mark.kind === 'point'}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				role="img"
				tabindex="0"
				aria-label={markName}
				title={markName}
				class={cn(
					'pointer-events-auto absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
					done && 'opacity-40',
					highlighted && 'ring-2 ring-ring/70'
				)}
				style:left="{x.current.x0 * 100}%"
				style:background={fill}
				data-testid="gantt-point"
				{...hover}
			></div>
		{:else if mark.kind === 'outside'}
			{@const name = mark.side === 'before' ? m.gantt_outside_before() : m.gantt_outside_after()}
			<span
				role="img"
				aria-label="{titleText}: {name}"
				title={name}
				class={cn(
					'pointer-events-auto absolute top-1/2 flex -translate-y-1/2 items-center text-muted-foreground',
					mark.side === 'before' ? 'left-0' : 'right-0'
				)}
				data-testid="gantt-outside"
			>
				{#if mark.side === 'before'}
					<ChevronLeftIcon class="size-3.5" aria-hidden="true" />
				{:else}
					<ChevronRightIcon class="size-3.5" aria-hidden="true" />
				{/if}
			</span>
		{:else}
			<span
				class="absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground italic"
				data-testid={mark.kind === 'none' ? 'gantt-no-dates' : 'gantt-invalid'}
				>{mark.kind === 'none' ? m.gantt_no_dates() : m.gantt_invalid_dates()}</span
			>
		{/if}
	</div>
</div>
