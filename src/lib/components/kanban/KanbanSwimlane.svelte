<script lang="ts">
	import type { Action } from 'svelte/action';
	import StageBadge from '#lib/components/diagram/StageBadge.svelte';
	import { stageColorVar } from '#lib/components/plan/colors.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { KANBAN_COLUMNS, type KanbanLane } from '#lib/scene/kanban-board.ts';
	import KanbanCard from './KanbanCard.svelte';
	import KanbanFamily from './KanbanFamily.svelte';

	let {
		lane,
		dimmed,
		target,
		onNavigate
	}: {
		lane: KanbanLane;
		dimmed: Set<string>;
		target: Action<HTMLElement, string>;
		onNavigate: (event: KeyboardEvent, id: string) => void;
	} = $props();
	const badge = $derived(m.stage_badge({ n: lane.stageNumber }));
</script>

<section
	class="relative grid border-b last:border-b-0"
	style:grid-template-columns="var(--kanban-tracks)"
	style:grid-template-rows={`repeat(${1 + lane.families.length + (lane.count ? 0 : 1)}, auto)`}
	role="group"
	aria-label={m.kanban_stage_group({ badge, stage: lane.stageTitle })}
	data-testid="kanban-swimlane"
	data-stage={lane.stageId}
>
	<div
		class="stage-heading sticky start-0 z-20 min-w-0 bg-background p-2"
		data-testid="kanban-stage-heading"
	>
		<div class="relative z-10 w-fit"><StageBadge color={lane.color} label={badge} /></div>
		<span
			class="stem absolute bottom-0 left-2 w-[4px]"
			style:background-color={stageColorVar(lane.color)}
			aria-hidden="true"
			data-testid="kanban-stem"
		></span>
		<h4
			class="relative mt-1 ml-2 text-sm leading-5 font-semibold wrap-anywhere"
			data-testid="kanban-stage-title"
		>
			{lane.stageTitle}
		</h4>
		<p class="relative ml-2 text-xs text-muted-foreground" data-testid="kanban-stage-count">
			{m.kanban_stage_count({ count: lane.count })}
		</p>
	</div>
	{#each KANBAN_COLUMNS as column (column)}
		<div class="min-w-0 p-1" data-testid="kanban-cell" data-column={column}>
			<ul class="flex flex-col gap-2">
				{#each lane.cells[column] as card (card.id)}
					<li class="min-w-0">
						<KanbanCard {card} dimmed={dimmed.has(card.id)} {target} {onNavigate} />
					</li>
				{/each}
			</ul>
		</div>
	{/each}
	{#if !lane.count}
		<p
			class="col-start-2 col-end-6 px-2 pb-3 text-sm text-muted-foreground"
			data-testid="kanban-stage-empty"
		>
			{m.kanban_stage_empty()}
		</p>
	{/if}
	{#each lane.families as family (family.parentId)}
		<KanbanFamily {family} stage={lane} {dimmed} {target} />
	{/each}
</section>

<style>
	.stage-heading {
		grid-column: 1;
		grid-row: 1 / -1;
	}
	.stem {
		top: 1.5rem;
	}
	@media (forced-colors: active) {
		.stem {
			forced-color-adjust: none;
			background-color: CanvasText !important;
		}
	}
</style>
