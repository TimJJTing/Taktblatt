<script lang="ts">
	import type { DiagramPaperProps } from '#lib/components/diagram/view-contract.ts';
	import { familySummaryText } from '#lib/components/diagram/family-summary.ts';
	import StageBadge from '#lib/components/diagram/StageBadge.svelte';
	import StatusKey from '#lib/components/diagram/StatusKey.svelte';
	import ReadyDot from '#lib/components/edit/ReadyDot.svelte';
	import { stagePaperColor } from '#lib/components/plan/colors.ts';
	import TaskStatusIcon from '#lib/components/task/TaskStatusIcon.svelte';
	import { joinList } from '#lib/domain/format.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { KanbanCard } from '#lib/scene/kanban-board.ts';
	import type { KanbanPaperItem, KanbanPaperSceneData } from '#lib/scene/kanban-paper.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import {
		cardDates,
		cardOwners,
		cardReadinessText,
		kanbanColumnLabel,
		kanbanStateText,
		kanbanTaskContext
	} from './card-text.ts';

	let { segment, from, to }: DiagramPaperProps = $props();
	const data = $derived(segment.data as KanbanPaperSceneData);
	const items = $derived(segment.items as KanbanPaperItem[]);
	const lanes = $derived(new Map(data.lanes.map((lane) => [lane.stageId, lane])));
	const locale = getLocale();
	const intl = uiIntl();

	function cardLabel(card: KanbanCard, owners: string, dates: string, summary: string): string {
		const readiness = cardReadinessText(card.readiness);
		return joinList(
			[
				card.title || m.task_untitled(),
				kanbanTaskContext(card, card.column, intl),
				...(summary ? [summary] : []),
				m.kanban_card_description({ owners, dates, readiness })
			],
			intl
		);
	}
</script>

<div data-testid="sheet-kanban">
	<div data-part="repeat" class="pb-1">
		<h2 class="text-xs font-semibold">{m.diagram_view_kanban()}</h2>
		<div class="tracks grid gap-1">
			<div aria-hidden="true"></div>
			{#each data.columns as column (column.id)}
				<div
					class="flex min-w-0 justify-between gap-1 border-b border-paper-rule py-1 text-[9px] font-semibold"
					data-testid="sheet-kanban-heading"
					data-column={column.id}
				>
					<span>{kanbanColumnLabel(column.id)}</span><span data-testid="kanban-count"
						>{column.count}</span
					>
				</div>
			{/each}
		</div>
		<div class="py-1 text-[9px]"><StatusKey still /></div>
		{#if data.emptyKind !== 'none'}
			<p class="text-xs" data-testid="sheet-kanban-empty">
				{data.emptyKind === 'no-tasks' ? m.kanban_empty_tasks() : m.kanban_empty_canceled()}
			</p>
		{/if}
	</div>
	{#each items.slice(from, to) as item, offset (from + offset)}
		{@const lane = lanes.get(item.laneId)!}
		{@const headingVisible =
			item.kind === 'lane-start' || item.kind === 'lane-empty' || offset === 0}
		<div
			class="tracks grid items-start gap-1 pb-1"
			data-testid="sheet-kanban-item"
			data-item={from + offset}
			data-kind={item.kind}
			data-lane={item.laneId}
		>
			<!-- Keep the heading in every item so continuation headings keep the measured height. -->
			<div class="relative col-start-1 min-w-0 self-stretch">
				<span
					class="absolute -bottom-1 left-1 w-[4px]"
					style:top={headingVisible ? '1.5rem' : '0'}
					style:background-color={stagePaperColor(lane.color)}
					data-testid="sheet-kanban-stem"
					aria-hidden="true"
				></span>
				<div
					class="relative p-1"
					data-testid="sheet-kanban-stage"
					data-visible={headingVisible ? 'true' : 'false'}
					aria-hidden={headingVisible ? undefined : 'true'}
					style:visibility={headingVisible ? undefined : 'hidden'}
				>
					<div class="relative z-10 w-fit">
						<StageBadge color={lane.color} label={m.stage_badge({ n: lane.stageNumber })} still />
					</div>
					<h3
						class="relative mt-1 ml-2 text-[10px] leading-tight font-semibold wrap-anywhere"
						data-testid="sheet-kanban-stage-title"
					>
						{lane.stageTitle}
					</h3>
					<p class="relative ml-2 text-[9px] text-paper-ink-2">
						{m.kanban_stage_count({ count: lane.count })}
					</p>
				</div>
			</div>
			{#if item.kind === 'lane-start' || item.kind === 'card-row'}
				{#each item.cards as card, column (column)}
					{#if card}
						{@const summary = card.summary ? familySummaryText(card.summary, locale) : ''}
						{@const owners = cardOwners(card.owners, intl)}
						{@const dates = cardDates(card, intl)}
						<div
							class="flex min-w-0 flex-col gap-0.5 rounded-sm border border-paper-rule p-1 text-[9px]"
							data-testid="sheet-kanban-card"
							data-task-id={card.id}
							role="group"
							aria-label={cardLabel(card, owners, dates, summary)}
						>
							<div class="flex min-w-0 items-start gap-1">
								<TaskStatusIcon status={card.status} class="size-3 shrink-0" />
								<ReadyDot readiness={card.readiness} reserve still />
								<span
									class="paper-title min-w-0 flex-1 font-semibold wrap-anywhere"
									class:line-through={card.status === 'done'}
									class:text-paper-ink-2={card.status === 'done'}
									data-testid="sheet-kanban-card-title">{card.title || m.task_untitled()}</span
								>
							</div>
							{#if summary}
								<p class="wrap-anywhere text-paper-ink-2" data-testid="sheet-kanban-card-summary">
									{summary}
								</p>
							{/if}
							<div class="truncate text-paper-ink-2">{owners}</div>
							<div class="truncate text-paper-ink-2">{dates}</div>
						</div>
					{:else}
						<div aria-hidden="true"></div>
					{/if}
				{/each}
			{:else if item.kind === 'family-start' || item.kind === 'family-line'}
				{@const family = lane.families.find((family) => family.parentId === item.parentId)!}
				{@const parentTitle = family.title || m.task_untitled()}
				{@const title = item.line.title || m.task_untitled()}
				<div class="col-start-2 col-end-6 min-w-0 text-[9px]">
					{#if item.kind === 'family-start'}
						<p class="pb-1 font-semibold wrap-anywhere" data-parent={item.parentId}>
							{m.kanban_family_row({ parent: parentTitle, count: family.total })}
						</p>
					{/if}
					<div
						class="flex min-w-0 items-start gap-1 rounded-sm border border-paper-rule p-1"
						data-testid="sheet-kanban-line"
						data-task-id={item.line.id}
						role="group"
						aria-label={joinList(
							[
								title,
								m.kanban_item_context({
									parent: parentTitle,
									context: kanbanTaskContext(lane, item.line.column, intl)
								})
							],
							intl
						)}
					>
						<TaskStatusIcon status={item.line.status} class="size-3 shrink-0" />
						<span
							class="paper-title min-w-0 flex-1 font-semibold wrap-anywhere"
							class:line-through={item.line.status === 'done' || item.line.status === 'canceled'}
							class:text-paper-ink-2={item.line.status === 'done' ||
								item.line.status === 'canceled'}>{title}</span
						>
						<span class="shrink-0 text-paper-ink-2">
							{kanbanStateText(item.line.column)}
						</span>
					</div>
				</div>
			{:else}
				<p
					class="col-start-2 col-end-6 p-1 text-[9px] text-paper-ink-2"
					data-testid="sheet-kanban-stage-empty"
				>
					{m.kanban_stage_empty()}
				</p>
			{/if}
		</div>
	{/each}
</div>

<style>
	.tracks {
		grid-template-columns: 6rem repeat(4, minmax(0, 1fr));
	}
	.paper-title {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.25;
	}
</style>
