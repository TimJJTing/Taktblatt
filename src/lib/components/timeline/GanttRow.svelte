<!--
	One Gantt row: the label (chevron, ready light, title) and the mark of the task.
	The row moves to its new position with a tween when rows come in or go out.
	The mark moves with a tween when the plan range changes.
	Bars are read-only. A label click shows the task row in the work plan.
-->
<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { mergeProps } from 'bits-ui';
	import { untrack } from 'svelte';
	import type { Action } from 'svelte/action';
	import type { RoutePaint } from '#lib/components/plan/colors.ts';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import { fade } from 'svelte/transition';
	import Hint from '#lib/components/app/Hint.svelte';
	import ReadyDot from '#lib/components/edit/ReadyDot.svelte';
	import TaskMark from '#lib/components/diagram/TaskMark.svelte';
	import type { GanttMarkGeom } from '#lib/scene/gantt-scene.ts';
	import type { Junction } from '#lib/scene/types.ts';
	import type { GanttRow } from '#lib/domain/gantt.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getEditing } from '#lib/state/editing.svelte.ts';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { cn } from '#lib/utils.ts';
	import { ROW_HEIGHT } from './gantt-layout.ts';
	import { markLabel } from './mark-label.ts';

	interface Props {
		row: GanttRow;
		routeTarget: Action<HTMLElement, string>;
		geom: GanttMarkGeom;
		width: number;
		taps: readonly Junction[];
		/** The stage color as a CSS value. */
		color: string;
		highlighted: boolean;
		route?: RoutePaint;
		tapRoutes?: ReadonlyMap<string, RoutePaint>;
		onJump: (id: string) => void;
		onHighlight: (id: string, on: boolean) => void;
	}

	let {
		row,
		routeTarget,
		geom,
		width,
		taps,
		color,
		highlighted,
		onJump,
		onHighlight,
		route = null,
		tapRoutes
	}: Props = $props();
	const editing = getEditing();
	const targetId = $props.id();

	const ws = getWorkspace();
	const viewer = getViewer();

	const task = $derived(ws.index.byId.get(row.id));
	const titleText = $derived(task?.title || m.task_untitled());
	const taskState = $derived(ws.index.state.get(row.id)!);
	const eff = $derived(taskState.eff);
	const muted = $derived(taskState.finished);
	const subtask = $derived(row.level === 1);
	const mark = $derived(row.mark);

	const markName = $derived(markLabel({ mark, title: titleText, dates: eff, status: row.status }));

	const y = new GeometryTween(
		untrack(() => row.row * ROW_HEIGHT),
		untrack(() => width)
	);
	$effect(() => {
		y.set(row.row * ROW_HEIGHT, { width });
	});

	const bounds = (g: GanttMarkGeom) => {
		const dot = g.stations[0];
		return {
			x0: g.line?.x0 ?? (dot ? dot.x - dot.r : 0),
			x1: g.line?.x1 ?? (dot ? dot.x + dot.r : 0),
			height: Math.max(g.line?.height ?? 0, ...g.stations.map((s) => s.r * 2))
		};
	};
	const x = new GeometryTween(
		untrack(() => bounds(geom)),
		untrack(() => width)
	);
	let previousVisible = untrack(() => geom.line !== null || geom.stations.length > 0);
	$effect(() => {
		const visible = geom.line !== null || geom.stations.length > 0;
		const newlyVisible = !previousVisible && visible;
		previousVisible = visible;
		x.set(bounds(geom), { width, snap: newlyVisible });
	});
	const colorDuration = $derived(`${motionDuration(150)}ms`);

	const showRowId = `${targetId}-show`;
	const showRow = $derived(m.gantt_show_row({ task: titleText }));

	const focusInput = {
		onfocusin: () => onHighlight(row.id, true),
		onfocusout: () => onHighlight(row.id, false)
	};
	function markClick(event: MouseEvent) {
		if (editing.routeFocus.lastPointerType === 'touch')
			editing.routeFocus.toggleTouch(
				row.id,
				editing.routeFocus.tokenFor(event.currentTarget as Element)
			);
	}
</script>

<div
	class="pointer-events-none absolute inset-x-0 flex"
	style:top="{y.current}px"
	style:height="{ROW_HEIGHT}px"
	data-route-target={row.id}
	use:routeTarget={row.id}
	data-testid="gantt-row"
	data-task-id={row.id}
	data-highlighted={highlighted || undefined}
	data-route={route ?? undefined}
	transition:fade={{ duration: motionDuration(150) }}
>
	<div
		class={cn(
			'pointer-events-auto sticky left-0 z-10 flex w-(--gantt-label-width) shrink-0 items-center gap-1 border-r px-1 transition-colors',
			highlighted
				? 'bg-accent forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:forced-color-adjust-none forced-colors:[&_button]:text-inherit'
				: 'bg-background',
			subtask && 'pl-6'
		)}
		style:transition-duration={colorDuration}
		data-route-target={row.id}
		data-route-focus="keyboard"
		use:routeTarget={row.id}
		{...focusInput}
	>
		{#if row.isParent}
			<button
				type="button"
				class="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
				aria-expanded={row.expanded}
				aria-label={row.expanded
					? m.task_collapse({ task: titleText })
					: m.task_expand({ task: titleText })}
				onclick={(event) => {
					viewer.toggleExpanded(ws.plan.id, row.id);
					if (event.detail > 0) {
						event.currentTarget.blur();
						onHighlight(row.id, false);
					}
				}}
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
		<ReadyDot readiness={taskState.readiness} reserve />
		<Hint text={showRow}>
			{#snippet child({ props })}
				<button
					{...mergeProps(props, { onclick: () => onJump(row.id) })}
					type="button"
					class={cn(
						'min-w-0 flex-1 truncate rounded-sm px-0.5 text-left text-xs hover:underline focus-visible:outline-2 focus-visible:outline-ring',
						!subtask && 'font-medium',
						muted && 'text-muted-foreground line-through decoration-muted-foreground/50'
					)}
					aria-describedby={showRowId}
					data-diagram-label={row.id}
					data-testid="gantt-label">{titleText}</button
				>
			{/snippet}
		</Hint>
		<span id={showRowId} class="sr-only">{showRow}</span>
	</div>
	<div class="relative flex-1" style:transition-duration={colorDuration}>
		{#if mark.kind === 'bar' || mark.kind === 'point'}
			<Hint text={markName}>
				{#snippet child({ props })}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<div
						{...mergeProps(props, focusInput, { onclick: markClick })}
						role="img"
						tabindex="0"
						aria-label={markName}
						class="pointer-events-auto absolute top-1/2 -translate-y-1/2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
						style:left="{x.current.x0}px"
						style:width="{x.current.x1 - x.current.x0}px"
						style:height="{x.current.height}px"
						data-route-target={row.id}
						data-route-focus="keyboard"
						data-route-touch
						use:routeTarget={row.id}
						data-diagram-task={row.id}
						data-diagram-parent={row.parentId ?? undefined}
						data-testid={mark.kind === 'bar' ? 'gantt-bar' : 'gantt-point'}
						data-clip-start={(mark.kind === 'bar' && mark.clipStart) || undefined}
						data-clip-end={(mark.kind === 'bar' && mark.clipEnd) || undefined}
					>
						<TaskMark
							{route}
							{tapRoutes}
							{subtask}
							{geom}
							box={x.current}
							status={row.status}
							{color}
							{width}
							{taps}
							taskId={row.id}
						/>
					</div>
				{/snippet}
			</Hint>
		{:else if mark.kind === 'outside'}
			{@const name = mark.side === 'before' ? m.gantt_outside_before() : m.gantt_outside_after()}
			<Hint text={name} focusable={false}>
				{#snippet child({ props })}
					<span
						{...props}
						role="img"
						aria-label={m.field_value({ label: titleText, value: name })}
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
				{/snippet}
			</Hint>
		{:else}
			<span
				class="absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground italic"
				data-testid={mark.kind === 'none' ? 'gantt-no-dates' : 'gantt-invalid'}
				>{mark.kind === 'none' ? m.gantt_no_dates() : m.gantt_invalid_dates()}</span
			>
		{/if}
	</div>
</div>
