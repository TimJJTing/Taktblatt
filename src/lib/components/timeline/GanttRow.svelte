<!--
	One Gantt row: the label (chevron, ready light, title) and the mark of the task.
	The row moves to its new position with a tween when rows come in or go out.
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
	import { readyCount } from '#lib/domain/dependencies.js';
	import { effectiveOf } from '#lib/domain/derive.js';
	import { formatDate, formatRangeDisplay } from '#lib/domain/format.js';
	import type { GanttRow } from '#lib/domain/gantt.js';
	import { motionDuration } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getViewer } from '#lib/state/viewer.svelte.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import { cn } from '#lib/utils.js';
	import { clipEdges, LABEL_WIDTH, ROW_HEIGHT, ROW_MOTION_MS } from './gantt-layout.js';

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

	const markName = $derived.by(() => {
		if (mark.kind !== 'bar' && mark.kind !== 'point') return '';
		const dates =
			mark.kind === 'point'
				? formatDate(mark.date, locale)
				: formatRangeDisplay(eff?.start ?? null, eff?.end ?? null, locale);
		const parts = [m.gantt_bar({ task: titleText, dates })];
		if (done) parts.push(m.gantt_done());
		if (mark.kind === 'bar' && mark.clipStart) parts.push(m.gantt_clipped_start());
		if (mark.kind === 'bar' && mark.clipEnd) parts.push(m.gantt_clipped_end());
		return parts.join(', ');
	});

	const fill = $derived(subtask ? `color-mix(in oklab, ${color} 55%, transparent)` : color);

	const y = new Tween(untrack(() => row.row * ROW_HEIGHT));
	$effect(() => {
		y.set(row.row * ROW_HEIGHT, { duration: motionDuration(ROW_MOTION_MS), easing: cubicOut });
	});

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
			'pointer-events-auto sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r px-1 transition-colors',
			highlighted ? 'bg-accent' : 'bg-background',
			subtask && 'pl-6'
		)}
		style:width="{LABEL_WIDTH}px"
		{...hover}
	>
		{#if row.isParent}
			<button
				type="button"
				class="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring print:hidden"
				aria-expanded={row.expanded}
				aria-label={row.expanded
					? m.task_collapse({ task: titleText })
					: m.task_expand({ task: titleText })}
				onclick={() => viewer.toggleExpanded(ws.plan.id, row.id)}
				data-testid="gantt-toggle"
			>
				<ChevronRightIcon
					class={cn('size-3.5 transition-transform', row.expanded && 'rotate-90')}
					style="transition-duration: {motionDuration(200)}ms"
					aria-hidden="true"
				/>
			</button>
		{:else}
			<span class="size-5 shrink-0 print:hidden" aria-hidden="true"></span>
		{/if}
		<ReadyDot count={ready} />
		<button
			type="button"
			class={cn(
				'min-w-0 flex-1 truncate rounded-sm px-0.5 text-left text-xs hover:underline focus-visible:outline-2 focus-visible:outline-ring',
				!subtask && 'font-medium',
				done && 'text-muted-foreground line-through decoration-muted-foreground/50'
			)}
			title={m.gantt_show_row()}
			onclick={() => onJump(row.id)}
			data-testid="gantt-label">{titleText}</button
		>
	</div>
	<div class={cn('relative flex-1 transition-colors', highlighted && 'bg-accent/60')}>
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
					done && 'opacity-40',
					highlighted && 'ring-2 ring-ring/70'
				)}
				style:left="{mark.x0 * 100}%"
				style:width="{(mark.x1 - mark.x0) * 100}%"
				style:height={subtask ? '8px' : '14px'}
				style:background={fill}
				style:clip-path={clipEdges(mark.clipStart, mark.clipEnd)}
				data-testid="gantt-bar"
				data-clip-start={mark.clipStart || undefined}
				data-clip-end={mark.clipEnd || undefined}
				{...hover}
			></div>
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
				style:left="{mark.x * 100}%"
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
