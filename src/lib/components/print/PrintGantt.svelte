<!--
	The Gantt chart on paper. A fragment shows the rows `from` to `to` of the segment.
	The first fragment has the title and the milestone row. Each fragment has the month header.
	Rows have a fixed height, so the paginator can split between rows. There are no controls and no motion.
	Complete dependencies use local routes. Crossing dependencies use boundary signs.
-->
<script lang="ts">
	import TodayTag from '#lib/components/timeline/TodayTag.svelte';
	import ReadyDot from '#lib/components/edit/ReadyDot.svelte';
	import { bandFill, bandPaperTint, stagePaperColor } from '#lib/components/plan/colors.ts';
	import { ganttFragment, type GanttPaperLayout } from '#lib/scene/gantt-fragment.ts';
	import { routePath } from '#lib/scene/route-path.ts';
	import TaskMark from '#lib/components/diagram/TaskMark.svelte';
	import DiagramRing from '#lib/components/diagram/DiagramRing.svelte';
	import { markLabel } from '#lib/components/timeline/mark-label.ts';
	import { MILESTONE_SYMBOLS } from '#lib/components/timeline/milestone-symbols.ts';
	import { isFinished } from '#lib/domain/derive.ts';
	import { formatDate, formatMonth, formatRangeDisplay } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import type { GanttSegment } from '#lib/domain/print-model.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { cn } from '#lib/utils.ts';
	import {
		GANTT_LABEL_WIDTH,
		GANTT_MILESTONE_HEIGHT,
		GANTT_MONTH_HEIGHT,
		GANTT_ROW_HEIGHT,
		GANTT_TODAY_TAG_WIDTH
	} from './print-layout.ts';

	interface Props {
		segment: GanttSegment;
		from: number;
		to: number;
		first: boolean;
		/** The width of the sheet content in pixels. 0 while the paginator measures. */
		width: number;
		/** A key that identifies this rendered Gantt fragment. */
		uid: string;
		paper?: GanttPaperLayout;
	}

	let { segment, from, to, first, width, uid, paper }: Props = $props();

	const ws = getWorkspace();
	const intl = uiIntl();
	const fragment = $derived(
		ganttFragment(segment.rows, segment.lines, { from, to, first, width, paper })
	);
	const rows = $derived(fragment.rows);
	const scene = $derived(fragment.scene);
	const continuations = $derived(new Map(fragment.continuations.map((edge) => [edge.key, edge])));
	const marks = $derived(new Map(scene.marks.map((m) => [m.id, m])));
	const sourceRows = $derived(new Map(segment.rows.map((r) => [r.id, r])));
	const edges = $derived(
		[...scene.geometry.edges, ...fragment.continuations].sort(
			(a, b) =>
				Number(a.cycle) - Number(b.cycle) ||
				Number(isFinished(sourceRows.get(b.from)!.status)) -
					Number(isFinished(sourceRows.get(a.from)!.status)) ||
				a.key.localeCompare(b.key)
		)
	);
	const colors = $derived(new Map(ws.plan.stages.map((s) => [s.id, stagePaperColor(s.color)])));
	const timelineWidth = $derived(Math.max(0, width - GANTT_LABEL_WIDTH));
	const milestoneFractions = $derived(segment.milestones.map((item) => item.x));
</script>

{#if first}
	<h2
		data-part="lead"
		class="pb-1.5 text-[10px] font-semibold tracking-wider text-paper-ink uppercase"
	>
		{m.section_timeline()}
	</h2>
{/if}
<div
	data-gantt-fragment={uid}
	class="text-[9px] text-paper-ink"
	role="group"
	aria-label={m.gantt_label()}
>
	<div
		data-part="repeat"
		class="flex border-y border-paper-rule text-paper-ink-3"
		style:height="{GANTT_MONTH_HEIGHT}px"
		data-testid="sheet-month-header"
	>
		<div class="shrink-0 border-r border-paper-rule" style:width="{GANTT_LABEL_WIDTH}px"></div>
		<div class="relative flex-1">
			{#each segment.ticks as tick, t (tick.month)}
				<div
					class={cn(
						'absolute inset-y-0 flex items-center overflow-hidden px-1 whitespace-nowrap',
						t > 0 && 'border-l border-paper-rule-2'
					)}
					style:left="{tick.x0 * 100}%"
					style:width="{(tick.x1 - tick.x0) * 100}%"
				>
					<span class="truncate tabular-nums">{formatMonth(tick.month, intl)}</span>
				</div>
			{/each}
		</div>
	</div>
	<div class="relative">
		{#if first}
			<div
				data-part="extra"
				class="relative z-[1] flex border-b border-paper-rule-2"
				style:height="{GANTT_MILESTONE_HEIGHT}px"
			>
				<div
					class="flex shrink-0 items-center border-r border-paper-rule px-1.5 text-paper-ink-3"
					style:width="{GANTT_LABEL_WIDTH}px"
				>
					{m.legend_milestones()}
				</div>
				<div class="relative flex-1">
					{#each segment.milestones as item (item.milestone.id)}
						{@const Symbol = MILESTONE_SYMBOLS[item.milestone.symbol]}
						<span
							role="img"
							class="absolute top-1/2 flex -translate-y-1/2 items-center gap-0.5 text-[9px] font-medium"
							style:left="calc({item.x * 100}% - 7px)"
							data-milestone-sign
							aria-label={m.gantt_milestone({
								label: item.label,
								title: item.milestone.title,
								date: formatDate(item.milestone.date, intl)
							})}
						>
							<Symbol class="size-3.5 fill-current" aria-hidden="true" />{item.label}
						</span>
					{/each}
					{#if segment.today !== null}
						<TodayTag
							x={segment.today}
							today={segment.today}
							milestones={milestoneFractions}
							chartWidth={timelineWidth}
							width={GANTT_TODAY_TAG_WIDTH}
							still
						/>
					{/if}
				</div>
			</div>
		{/if}
		{#each rows as row, i (row.id)}
			{@const task = ws.index.byId.get(row.id)}
			{@const title = task?.title || m.task_untitled()}
			<!-- The print model is a snapshot. Undo can remove a task before the model updates. -->
			{@const taskState = ws.index.state.get(row.id)}
			{@const muted = isFinished(row.status)}
			{@const mark = row.mark}
			{@const eff = taskState?.eff ?? null}
			{@const base = colors.get(row.stageId) ?? stagePaperColor('slate')}
			{@const geom = marks.get(row.id)!}
			{@const dot = geom.stations[0]}
			{@const x0 = geom.line?.x0 ?? (dot ? dot.x - dot.r : 0)}
			{@const x1 = geom.line?.x1 ?? (dot ? dot.x + dot.r : 0)}
			{@const markHeight = Math.max(geom.line?.height ?? 0, ...geom.stations.map((s) => s.r * 2))}
			<div
				data-item={from + i}
				data-testid="sheet-gantt-row"
				data-task-id={row.id}
				class="relative z-[1] flex border-b border-paper-rule-3"
				style:height="{GANTT_ROW_HEIGHT}px"
			>
				<div
					class={cn(
						'flex shrink-0 items-center gap-1 overflow-hidden border-r border-paper-rule px-1.5',
						row.level === 1 && 'pl-4'
					)}
					style:width="{GANTT_LABEL_WIDTH}px"
				>
					<ReadyDot readiness={taskState?.readiness ?? { kind: 'inactive' }} still reserve />
					<span
						class={cn(
							'min-w-0 truncate',
							row.level === 0 && 'font-medium',
							muted && 'text-paper-ink-3 line-through decoration-paper-ink-3/50'
						)}>{title}</span
					>
				</div>
				<div class="relative flex-1" style:height="{GANTT_ROW_HEIGHT}px">
					{#if mark.kind === 'bar' || mark.kind === 'point'}
						{@const name = markLabel({ mark, title, dates: eff, status: row.status })}
						<div
							role="img"
							aria-label={name}
							class="absolute top-1/2 -translate-y-1/2"
							style:left="{x0}px"
							style:width="{x1 - x0}px"
							style:height="{markHeight}px"
							data-testid={mark.kind === 'bar' ? 'sheet-gantt-bar' : 'sheet-gantt-point'}
							data-clip-start={(mark.kind === 'bar' && mark.clipStart) || undefined}
							data-clip-end={(mark.kind === 'bar' && mark.clipEnd) || undefined}
						>
							<TaskMark
								subtask={row.level === 1}
								box={{ x0, x1 }}
								{geom}
								status={row.status}
								color={base}
								width={timelineWidth}
								taps={scene.geometry.junctions.filter(
									(j) => j.kind === 'tap' && j.source === row.id
								)}
								still
							/>
						</div>
					{:else if mark.kind === 'outside'}
						{@const name =
							mark.side === 'before' ? m.gantt_outside_before() : m.gantt_outside_after()}
						<span
							role="img"
							aria-label={m.field_value({ label: title, value: name })}
							class={cn(
								'absolute top-1/2 -translate-y-1/2 text-[11px] leading-none text-paper-ink-3',
								mark.side === 'before' ? 'left-0.5' : 'right-0.5'
							)}
							data-testid="sheet-gantt-outside">{mark.side === 'before' ? '‹' : '›'}</span
						>
					{:else}
						<span class="absolute top-1/2 left-2 -translate-y-1/2 text-paper-ink-3 italic">
							{mark.kind === 'none' ? m.gantt_no_dates() : m.gantt_invalid_dates()}
						</span>
					{/if}
				</div>
			</div>
		{/each}
		<div
			class="pointer-events-none absolute inset-y-0 right-0 z-0"
			style:left="{GANTT_LABEL_WIDTH}px"
		>
			{#each segment.ticks.slice(1) as tick (tick.month)}
				<div
					class="absolute inset-y-0 border-l border-paper-rule-2"
					style:left="{tick.x0 * 100}%"
					aria-hidden="true"
				></div>
			{/each}
			{#each segment.bands as item (item.band.id)}
				<div
					role="img"
					aria-label={m.gantt_band({
						title: item.band.title,
						range: formatRangeDisplay(item.band.start, item.band.end, intl)
					})}
					class="absolute inset-y-0 overflow-hidden"
					style:background={bandFill(bandPaperTint(item.band.color))}
					style:left="{item.x0 * 100}%"
					style:width="{(item.x1 - item.x0) * 100}%"
					data-testid="sheet-gantt-band"
				>
					<span
						class="absolute bottom-0.5 left-1 max-w-full truncate pr-1 text-[8px] text-paper-ink-3"
						aria-hidden="true">{item.band.title}</span
					>
				</div>
			{/each}
			{#if segment.today !== null}
				<div
					class="absolute inset-y-0 border-l border-dashed border-paper-ink/60"
					style:left="{segment.today * 100}%"
					data-testid="sheet-gantt-today"
				></div>
			{/if}
			{#if timelineWidth > 0 && edges.length > 0}
				<svg
					class="absolute inset-0 size-full overflow-visible text-paper-ink-3"
					style:clip-path="inset({first ? GANTT_MILESTONE_HEIGHT : 0}px 0 0 0)"
					aria-hidden="true"
				>
					{#each edges as line (line.key)}
						{@const d = routePath(line.points, { w: timelineWidth, h: 0 })}
						{@const muted = isFinished(sourceRows.get(line.from)!.status)}
						{@const continuation = continuations.get(line.key)}
						{@const stroke = line.cycle
							? 'currentColor'
							: muted
								? 'color-mix(in oklab, currentColor 40%, #FFFFFF)'
								: 'currentColor'}
						{@const strokeWidth = line.cycle
							? 2
							: sourceRows.get(line.from)!.level === 1 && sourceRows.get(line.to)!.level === 1
								? 0.75
								: 1}
						{#if line.cycle}<path
								{d}
								fill="none"
								stroke="#FFFFFF"
								stroke-width="4"
								aria-hidden="true"
								data-overlay-for={line.key}
							/>{/if}
						<path
							{d}
							class={line.cycle ? 'text-paper-warning' : undefined}
							data-cycle={line.cycle ? 'true' : undefined}
							fill="none"
							{stroke}
							stroke-width={strokeWidth}
							stroke-dasharray={line.cycle ? '1 4' : undefined}
							stroke-linecap={line.cycle ? 'round' : undefined}
							data-testid="sheet-gantt-dependency"
							data-from={line.from}
							data-to={line.to}
							data-continuation={continuation?.kind}
							data-riser-x={continuation?.riserX}
						/>
						{#if continuation}
							{#each continuation.stubs as points, i (i)}
								<path
									d={routePath(points, { w: timelineWidth, h: 0 })}
									class={line.cycle ? 'text-paper-warning' : undefined}
									fill="none"
									{stroke}
									stroke-width={strokeWidth}
									stroke-dasharray="none"
									aria-hidden="true"
									data-overlay-for={line.key}
									data-testid="sheet-gantt-continuation-stub"
								/>
							{/each}
							{#each continuation.ticks as points, i (i)}
								<path
									d={routePath(points, { w: timelineWidth, h: 0 })}
									class={line.cycle ? 'text-paper-warning' : undefined}
									fill="none"
									{stroke}
									stroke-width={strokeWidth}
									stroke-dasharray="none"
									aria-hidden="true"
									data-overlay-for={line.key}
									data-testid="sheet-gantt-continuation-tick"
								/>
							{/each}
						{/if}
					{/each}
					{#each scene.geometry.junctions.filter((j) => j.kind === 'junction') as junction (junction.key)}<DiagramRing
							{junction}
							width={timelineWidth}
							still
						/>{/each}
				</svg>
			{/if}
		</div>
	</div>
</div>
