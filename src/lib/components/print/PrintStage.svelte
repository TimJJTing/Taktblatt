<!--
	One stage of the work plan on paper: the header and a table of tasks and subtasks.
	The table header repeats on each sheet where the table continues.
	Rows are static. A parent row shows its derived values. Labels use the UI language.
-->
<script lang="ts">
	import ReadyDot from '#lib/components/edit/ReadyDot.svelte';
	import { stagePaperColor } from '#lib/components/plan/colors.ts';
	import { formatMonthSpan, formatTarget, joinList } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import type { StageSegment } from '#lib/domain/print-model.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.ts';

	interface Props {
		segment: StageSegment;
		from: number;
		to: number;
		first: boolean;
	}

	let { segment, from, to, first }: Props = $props();

	const intl = uiIntl();
	const color = $derived(stagePaperColor(segment.stage.color));
	const name = $derived(segment.stage.title || m.stage_title_placeholder({ n: segment.number }));
	const months = $derived(
		segment.span ? formatMonthSpan(segment.span.start, segment.span.end, intl) : ''
	);
	const rows = $derived(segment.rows.slice(from, to));
	const th = 'border-b border-paper-rule px-1.5 py-1 text-left font-medium text-paper-ink-3';
</script>

{#if first}
	<div data-part="lead">
		{#if segment.workPlanTitle}
			<h2 class="pb-2 text-[10px] font-semibold tracking-wider text-paper-ink uppercase">
				{m.section_work_plan()}
			</h2>
		{/if}
		<h3 class="flex items-baseline gap-1.5 pb-1.5 text-[12px] font-semibold text-paper-ink">
			<span class="size-2.5 shrink-0 self-center rounded-[2px]" style:background={color}></span>
			<span
				>{m.label_qualifier({ name: m.stage_label({ n: segment.number }), qualifier: name })}</span
			>
			{#if months}<span class="font-normal text-paper-ink-3"
					>{m.parenthetical({ text: months })}</span
				>{/if}
			<span class="ml-auto text-[10px] font-normal whitespace-nowrap text-paper-ink-3">
				{m.stage_progress({ done: segment.progress.done, total: segment.progress.total })}
			</span>
		</h3>
	</div>
{/if}
<table
	class="w-full table-fixed border-separate border-spacing-0 text-[10px] text-paper-ink"
	aria-label={name}
	data-testid="sheet-table"
>
	<colgroup>
		<col class="w-7" />
		<col />
		<col class="w-[26%]" />
		<col class="w-14" />
		<col class="w-[20%]" />
	</colgroup>
	<thead data-part="repeat" data-testid="sheet-table-head">
		<tr>
			<th class={th} style:border-top="2px solid {color}">{m.column_done()}</th>
			<th class={th} style:border-top="2px solid {color}">{m.column_task()}</th>
			<th class={th} style:border-top="2px solid {color}">
				{m.column_deliverable()}
			</th>
			<th class={th} style:border-top="2px solid {color}">{m.column_target()}</th>
			<th class={th} style:border-top="2px solid {color}">{m.column_owner()}</th>
		</tr>
	</thead>
	<tbody>
		{#if segment.rows.length === 0}
			<tr data-item="0">
				<td colspan="5" class="border-b border-paper-rule-2 px-1.5 py-1.5 text-paper-ink-3">
					{m.stage_empty()}
				</td>
			</tr>
		{/if}
		{#each rows as row, i (row.task.id)}
			{@const done = row.eff.done}
			{@const cell =
				'border-b px-1.5 py-1 align-top ' +
				(row.level === 1 ? 'border-paper-rule-3' : 'border-paper-rule-2')}
			<tr
				data-item={from + i}
				data-testid="sheet-task-row"
				class={cn(done === 'done' && 'text-paper-ink-3')}
			>
				<td class={cn(cell, 'pr-0')}>
					<span
						class="flex size-2.5 items-center justify-center border border-paper-ink-3"
						aria-hidden="true"
					>
						{#if done === 'done'}
							<svg viewBox="0 0 10 10" class="size-2.5">
								<path
									d="M2 5.2 4.2 7.4 8 2.8"
									fill="none"
									stroke="currentColor"
									stroke-width="1.4"
								/>
							</svg>
						{:else if done === 'partial'}
							<span class="h-px w-1.5 bg-current"></span>
						{/if}
					</span>
					{#if done === 'done'}<span class="sr-only">{m.gantt_done()}</span>{/if}
				</td>
				<td class={cell}>
					<div class={cn('flex items-baseline gap-1', row.level === 1 && 'pl-3.5')}>
						<ReadyDot count={row.ready} still reserve />
						<span
							class={cn(
								'min-w-0 break-words',
								row.level === 0 && 'font-medium',
								done === 'done' && 'line-through decoration-paper-ink-3/50'
							)}>{row.task.title || m.task_untitled()}</span
						>
					</div>
				</td>
				<td class={cn(cell, 'break-words')}>{row.task.deliverable}</td>
				<td class={cn(cell, 'whitespace-nowrap tabular-nums')}
					>{formatTarget(row.eff, row.isParent, intl) || '–'}</td
				>
				<td class={cn(cell, 'break-words')}>{joinList(row.eff.owners, intl)}</td>
			</tr>
		{/each}
	</tbody>
</table>
