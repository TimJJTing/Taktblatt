<!--
	The Gantt chart on paper. A fragment shows the rows `from` to `to` of the segment.
	The first fragment has the title and the milestone row. Each fragment has the month header.
	Rows have a fixed height, so the paginator can split between rows. There are no controls and no motion.
	A dependency line shows only when both of its rows are in the same fragment.
-->
<script lang="ts">
	import ReadyDot from '#lib/components/edit/ReadyDot.svelte';
	import {
		bandFill,
		bandPaperTint,
		stagePaperColor,
		subtaskFill
	} from '#lib/components/plan/colors.js';
	import { clipEdges, elbowPath, rowCenterY } from '#lib/components/timeline/gantt-layout.js';
	import { markLabel } from '#lib/components/timeline/mark-label.js';
	import { MILESTONE_SYMBOLS } from '#lib/components/timeline/milestone-symbols.js';
	import { readyCount } from '#lib/domain/dependencies.js';
	import { effectiveOf } from '#lib/domain/derive.js';
	import { formatDate, formatMonth, formatRangeDisplay, intlLocale } from '#lib/domain/format.js';
	import type { GanttSegment } from '#lib/domain/print-model.js';
	import type { Locale } from '#lib/domain/schema.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import { cn } from '#lib/utils.js';
	import {
		GANTT_LABEL_WIDTH,
		GANTT_MILESTONE_HEIGHT,
		GANTT_MONTH_HEIGHT,
		GANTT_ROW_HEIGHT
	} from './print-layout.js';

	interface Props {
		segment: GanttSegment;
		from: number;
		to: number;
		first: boolean;
		locale: Locale;
		/** The width of the sheet content in pixels. 0 while the paginator measures. */
		width: number;
		/** A key that is unique for the fragment. It names the arrow marker. */
		uid: string;
	}

	let { segment, from, to, first, locale, width, uid }: Props = $props();

	const ws = getWorkspace();
	const intl = $derived(intlLocale(locale));
	const rows = $derived(segment.rows.slice(from, to));
	const colors = $derived(new Map(ws.plan.stages.map((s) => [s.id, stagePaperColor(s.color)])));
	const timelineWidth = $derived(Math.max(0, width - GANTT_LABEL_WIDTH));
	const bodyTop = $derived(first ? GANTT_MILESTONE_HEIGHT : 0);
	const lines = $derived(
		segment.lines.filter((l) => l.row0 >= from && l.row0 < to && l.row1 >= from && l.row1 < to)
	);
	const centerY = (row: number) => rowCenterY(row - from, bodyTop, GANTT_ROW_HEIGHT);
	const marker = $derived(`arrow-${uid}`);
</script>

{#if first}
	<h2
		data-part="lead"
		class="pb-1.5 text-[10px] font-semibold tracking-wider text-paper-ink uppercase"
	>
		{m.section_timeline({}, { locale })}
	</h2>
{/if}
<div class="text-[9px] text-paper-ink" role="group" aria-label={m.gantt_label({}, { locale })}>
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
					<span class="truncate">{formatMonth(tick.month, intl)}</span>
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
					{m.legend_milestones({}, { locale })}
				</div>
				<div class="relative flex-1">
					{#each segment.milestones as item (item.milestone.id)}
						{@const Symbol = MILESTONE_SYMBOLS[item.milestone.symbol]}
						<span
							role="img"
							class="absolute top-1/2 flex -translate-y-1/2 items-center gap-0.5 text-[9px] font-medium"
							style:left="calc({item.x * 100}% - 6px)"
							aria-label={m.gantt_milestone(
								{
									label: item.label,
									title: item.milestone.title,
									date: formatDate(item.milestone.date, intl)
								},
								{ locale }
							)}
						>
							<Symbol class="size-3 fill-current" />{item.label}
						</span>
					{/each}
				</div>
			</div>
		{/if}
		{#each rows as row, i (row.id)}
			{@const task = ws.index.byId.get(row.id)}
			{@const title = task?.title || m.task_untitled({}, { locale })}
			{@const done = row.done === 'done'}
			{@const mark = row.mark}
			{@const eff = effectiveOf(ws.index, row.id)}
			{@const base = colors.get(row.stageId) ?? stagePaperColor('slate')}
			{@const fill = row.level === 1 ? subtaskFill(base) : base}
			<div
				data-item={from + i}
				data-testid="sheet-gantt-row"
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
					<ReadyDot count={readyCount(ws.index, row.id)} {locale} still />
					<span
						class={cn(
							'min-w-0 truncate',
							row.level === 0 && 'font-medium',
							done && 'text-paper-ink-3 line-through decoration-paper-ink-3/50'
						)}>{title}</span
					>
				</div>
				<div class="relative flex-1">
					{#if mark.kind === 'bar' || mark.kind === 'point'}
						{@const name = markLabel({ mark, title, dates: eff, done, intl }, locale)}
						{#if mark.kind === 'bar'}
							<div
								role="img"
								aria-label={name}
								class={cn(
									'absolute top-1/2 min-w-0.5 -translate-y-1/2',
									!mark.clipStart && 'rounded-l-[2px]',
									!mark.clipEnd && 'rounded-r-[2px]',
									done && 'opacity-40'
								)}
								style:left="{mark.x0 * 100}%"
								style:width="{(mark.x1 - mark.x0) * 100}%"
								style:height={row.level === 1 ? '5px' : '9px'}
								style:background={fill}
								style:clip-path={clipEdges(mark.clipStart, mark.clipEnd)}
								data-testid="sheet-gantt-bar"
							></div>
						{:else}
							<div
								role="img"
								aria-label={name}
								class={cn(
									'absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45',
									done && 'opacity-40'
								)}
								style:left="{mark.x * 100}%"
								style:background={fill}
								data-testid="sheet-gantt-point"
							></div>
						{/if}
					{:else if mark.kind === 'outside'}
						{@const name =
							mark.side === 'before'
								? m.gantt_outside_before({}, { locale })
								: m.gantt_outside_after({}, { locale })}
						<span
							role="img"
							aria-label="{title}: {name}"
							class={cn(
								'absolute top-1/2 -translate-y-1/2 text-[11px] leading-none text-paper-ink-3',
								mark.side === 'before' ? 'left-0.5' : 'right-0.5'
							)}
							data-testid="sheet-gantt-outside">{mark.side === 'before' ? '‹' : '›'}</span
						>
					{:else}
						<span class="absolute top-1/2 left-2 -translate-y-1/2 text-paper-ink-3 italic">
							{mark.kind === 'none'
								? m.gantt_no_dates({}, { locale })
								: m.gantt_invalid_dates({}, { locale })}
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
					aria-label={m.gantt_band(
						{
							title: item.band.title,
							range: formatRangeDisplay(item.band.start, item.band.end, intl)
						},
						{ locale }
					)}
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
					class="absolute inset-y-0 border-l border-dashed border-paper-ink-2"
					style:left="{segment.today * 100}%"
					data-testid="sheet-gantt-today"
				>
					<!-- The label sits below the milestone row, so it does not cover a milestone. -->
					<span
						class="absolute left-1 bg-paper/80 px-0.5 text-[8px] leading-tight font-medium"
						style:top="{bodyTop + 2}px"
						data-testid="sheet-gantt-today-label">{m.gantt_today({}, { locale })}</span
					>
				</div>
			{/if}
			{#if timelineWidth > 0 && lines.length > 0}
				<svg
					class="absolute inset-0 size-full overflow-visible text-paper-ink-3"
					aria-hidden="true"
				>
					<defs>
						<marker
							id={marker}
							viewBox="0 0 6 6"
							refX="5"
							refY="3"
							markerWidth="5"
							markerHeight="5"
							orient="auto"
						>
							<path d="M 0 0 L 6 3 L 0 6 z" fill="currentColor" />
						</marker>
					</defs>
					{#each lines as line (line.key)}
						<path
							d={elbowPath(
								line.x0 * timelineWidth,
								centerY(line.row0),
								line.x1 * timelineWidth,
								centerY(line.row1)
							)}
							fill="none"
							stroke="currentColor"
							stroke-width="1"
							marker-end="url(#{marker})"
							data-testid="sheet-gantt-dependency"
						/>
					{/each}
				</svg>
			{/if}
		</div>
	</div>
</div>
