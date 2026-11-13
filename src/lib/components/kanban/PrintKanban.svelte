<script lang="ts">
	import type { DiagramPaperProps } from '#lib/components/diagram/view-contract.ts';
	import StageBadge from '#lib/components/diagram/StageBadge.svelte';
	import StationDot from '#lib/components/diagram/StationDot.svelte';
	import ReadyDot from '#lib/components/edit/ReadyDot.svelte';
	import { markColorLevel, stagePaperColor } from '#lib/components/plan/colors.ts';
	import { joinList } from '#lib/domain/format.ts';
	import { m } from '#lib/paraglide/messages.js';
	import {
		KANBAN_PAPER_METRICS,
		type KanbanPaperData,
		type KanbanPaperRow
	} from '#lib/scene/kanban-paper.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import { cardDates } from './card-text.ts';
	let { segment, from, to }: DiagramPaperProps = $props();
	const data = $derived(segment.data as KanbanPaperData);
	const rows = $derived(segment.items as KanbanPaperRow[]);
	const ws = getWorkspace();
	const intl = uiIntl();
</script>

<div data-testid="sheet-kanban">
	<div data-part="repeat">
		<h2 class="text-xs font-semibold">{m.diagram_view_kanban()}</h2>
		<div class="grid grid-cols-4 gap-1">
			{#each data.columns as column (column.id)}<div
					class="flex justify-between border-b py-1 text-[9px] font-semibold"
				>
					<span>{column.label}</span><span data-testid="kanban-count">{column.count}</span>
				</div>{/each}
		</div>
	</div>
	{#each rows.slice(from, to) as row, i (from + i)}<div
			class="grid grid-cols-4 gap-1 pb-1"
			data-item={from + i}
		>
			{#if data.emptyKind !== 'none'}<p class="col-span-4 text-xs">
					{data.emptyKind === 'no-tasks' ? m.kanban_empty_tasks() : m.kanban_empty_canceled()}
				</p>{/if}
			{#each row.cards as card, column (column)}{#if card}{@const color =
						ws.plan.stages.find((s) => s.id === card.stageId)?.color ?? 'blue'}
					<div
						class="flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-sm border p-1 text-[9px]"
						style:height="{KANBAN_PAPER_METRICS.cardHeight}px"
						style:border-left="4px solid color-mix(in oklab, {stagePaperColor(color)}
						{markColorLevel(card.status, 'line', false, true)}%, #FFFFFF)"
						data-testid="sheet-kanban-card"
						data-task-id={card.id}
						aria-label={joinList(
							[
								card.title || m.task_untitled(),
								m.stage_badge({ n: card.stageNumber }),
								card.stageTitle,
								...(card.parentTitle !== null
									? [m.kanban_parent({ parent: card.parentTitle || m.task_untitled() })]
									: []),
								card.owners.length ? joinList(card.owners, intl) : m.kanban_no_owners(),
								cardDates(card, intl)
							],
							intl
						)}
					>
						<div class="flex min-w-0 items-start gap-1">
							<StationDot
								status={card.status}
								color={stagePaperColor(color)}
								size={8}
								still
							/><ReadyDot readiness={card.readiness} reserve still /><span
								class="paper-title min-w-0 font-semibold break-all"
								class:line-through={card.status === 'done'}>{card.title || m.task_untitled()}</span
							>
						</div>
						<div class="mt-auto flex min-w-0 items-center gap-1">
							<StageBadge {color} label={m.stage_badge({ n: card.stageNumber })} still /><span
								class="truncate">{card.stageTitle}</span
							>
						</div>
						<div class="h-3 truncate">
							{card.parentTitle !== null
								? m.kanban_parent({ parent: card.parentTitle || m.task_untitled() })
								: ''}
						</div>
						<div class="h-3 truncate">
							{card.owners.length ? joinList(card.owners, intl) : m.kanban_no_owners()}
						</div>
						<div class="h-3 truncate">
							{cardDates(card, intl)}
						</div>
					</div>{:else}<div aria-hidden="true"></div>{/if}{/each}
		</div>{/each}
</div>

<style>
	.paper-title {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.25;
		min-height: 2lh;
	}
</style>
