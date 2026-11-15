<script lang="ts">
	import type { Action } from 'svelte/action';
	import type { BoardColumn } from '#lib/domain/derive.ts';
	import type { StageColor } from '#lib/domain/palette.ts';
	import { m } from '#lib/paraglide/messages.js';
	import type { KanbanCard } from '#lib/scene/kanban-board.ts';
	import { kanbanColumnLabel } from '#lib/scene/kanban-paper.ts';
	import KanbanCardView from './KanbanCard.svelte';
	interface Props {
		column: { id: BoardColumn; cards: KanbanCard[]; count: number };
		colors: Map<string, StageColor>;
		dimmed: Set<string>;
		target: Action<HTMLElement, string>;
		onNavigate: (event: KeyboardEvent, id: string) => void;
	}
	let { column, colors, dimmed, target, onNavigate }: Props = $props();
	const headingId = $props.id();
</script>

<section
	class="min-w-0 flex-1"
	aria-labelledby={headingId}
	data-testid="kanban-column"
	data-column={column.id}
>
	<h3
		id={headingId}
		class="sticky top-0 z-20 flex h-10 items-center justify-between border-b bg-background px-2 text-sm font-semibold"
		style:transform="translateY(var(--kanban-scroll-top, 0px))"
		data-testid="kanban-heading"
	>
		{kanbanColumnLabel(column.id)} <span data-testid="kanban-count">{column.count}</span>
	</h3>
	<ul class="flex flex-col gap-2 p-1">
		{#each column.cards as card (card.id)}<li class="min-w-0">
				<KanbanCardView
					{card}
					color={colors.get(card.stageId) ?? 'blue'}
					dimmed={dimmed.has(card.id)}
					{target}
					{onNavigate}
				/>
			</li>{/each}
	</ul>
	{#if !column.count}<p class="p-2 text-xs text-muted-foreground">{m.kanban_column_empty()}</p>{/if}
</section>
