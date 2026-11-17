<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import type { Action } from 'svelte/action';
	import Hint from '#lib/components/app/Hint.svelte';
	import { familySummaryText } from '#lib/components/diagram/family-summary.ts';
	import TaskStatusIcon from '#lib/components/task/TaskStatusIcon.svelte';
	import { getDiagramLayer } from '#lib/components/diagram/diagram-layer.ts';
	import ReadyDot from '#lib/components/edit/ReadyDot.svelte';
	import { markColorLevel } from '#lib/components/plan/colors.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { KanbanCard } from '#lib/scene/kanban-board.ts';
	import { getEditing } from '#lib/state/editing.svelte.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import { cardDates, cardOwners, cardReadinessText, kanbanTaskContext } from './card-text.ts';
	interface Props {
		card: KanbanCard;
		dimmed: boolean;
		target: Action<HTMLElement, string>;
		onNavigate: (event: KeyboardEvent, id: string) => void;
	}
	let { card, dimmed, target, onNavigate }: Props = $props();
	const editing = getEditing();
	const layer = getDiagramLayer();
	function openDetails(from: HTMLElement) {
		editing.openDetails(card.id, from, layer.returnFocus?.(card.id, from));
	}
	const intl = uiIntl();
	const cardId = $props.id();
	const descId = `${cardId}-description`;
	const summaryId = `${cardId}-summary`;
	const summary = $derived(card.summary ? familySummaryText(card.summary, getLocale()) : '');
	const title = $derived(card.title || m.task_untitled());
	const owners = $derived(cardOwners(card.owners, intl));
	const dates = $derived(cardDates(card, intl));
	const readiness = $derived(cardReadinessText(card.readiness));
	const label = $derived(
		m.kanban_card_action({
			task: title,
			context: kanbanTaskContext(card, card.column, intl)
		})
	);
	const level = $derived(markColorLevel('todo', 'line', dimmed));
	function stationClick(event: MouseEvent) {
		if (editing.routeFocus.lastPointerType === 'touch')
			editing.routeFocus.toggleTouch(
				card.id,
				editing.routeFocus.tokenFor(event.currentTarget as Element)
			);
	}
</script>

<div
	role="group"
	class="card relative flex min-w-0 flex-col gap-1 rounded-md border bg-background p-2 text-sm"
	style:border-color={`color-mix(in oklab, var(--muted-foreground) ${level}%, var(--background))`}
	style:transition-duration="{motionDuration(150)}ms"
	data-diagram-task={card.id}
	data-testid="kanban-card"
	data-route-target={card.id}
	use:target={card.id}
	onpointerenter={(event) =>
		editing.routeFocus.hoverEnter(
			card.id,
			editing.routeFocus.tokenFor(event.currentTarget),
			event.pointerType
		)}
	onpointerleave={(event) =>
		editing.routeFocus.hoverLeave(
			editing.routeFocus.tokenFor(event.currentTarget),
			event.pointerType
		)}
>
	<div class="flex min-w-0 items-start gap-1">
		<Hint text={title}
			>{#snippet child({ props })}<button
					{...mergeProps(props, {
						onclick: (event: MouseEvent) => openDetails(event.currentTarget as HTMLElement),
						onkeydown: (event: KeyboardEvent) => onNavigate(event, card.id)
					})}
					type="button"
					class="order-2 flex min-h-6 min-w-0 flex-1 items-start gap-1 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring"
					aria-label={label}
					aria-describedby={[
						descId,
						summary ? summaryId : '',
						typeof props['aria-describedby'] === 'string' ? props['aria-describedby'] : ''
					]
						.filter(Boolean)
						.join(' ')}
					data-diagram-label={card.id}
					data-route-target={card.id}
					data-route-focus="keyboard"
					use:target={card.id}
				>
					<span class="mt-1.5" aria-hidden="true"
						><ReadyDot readiness={card.readiness} reserve /></span
					><span
						class:line-through={card.status === 'done'}
						class:text-muted-foreground={card.status === 'done'}
						class="title min-w-0 font-medium wrap-anywhere">{title}</span
					>
				</button>{/snippet}</Hint
		>
		<button
			type="button"
			class="order-1 flex size-6 shrink-0 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-ring [@media(pointer:coarse)]:size-11"
			aria-label={m.kanban_route_action({ task: title })}
			data-route-touch
			data-route-target={card.id}
			data-route-focus="keyboard"
			use:target={card.id}
			onclick={stationClick}
			><span
				class="status-icon flex size-4 shrink-0"
				data-diagram-station={card.id}
				aria-hidden="true"
				style:color={`color-mix(in oklab, var(--foreground) ${level}%, var(--background))`}
				style:transition-duration="{motionDuration(150)}ms"
				><TaskStatusIcon status={card.status} /></span
			></button
		>
	</div>
	{#if summary}<p
			id={summaryId}
			class="text-xs wrap-anywhere text-muted-foreground"
			data-testid="kanban-card-summary"
		>
			{summary}
		</p>{/if}
	<Hint text={owners} focusable={false}
		>{#snippet child({ props })}<div {...props} class="h-5 truncate text-xs text-muted-foreground">
				{owners}
			</div>{/snippet}</Hint
	>
	<div class="h-5 truncate text-xs text-muted-foreground">{dates}</div>
	<span id={descId} class="sr-only">{m.kanban_card_description({ owners, dates, readiness })}</span>
</div>

<style>
	.title {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.25rem;
	}
	.card {
		transition-property: border-color;
	}
	.status-icon {
		transition-property: color;
	}
	/* The global reduced-motion rule keeps a 0.01 ms transition. Remove it here. */
	@media (prefers-reduced-motion: reduce) {
		.card,
		.status-icon,
		.status-icon :global(*) {
			transition: none;
		}
	}
	@media (forced-colors: active) {
		.card {
			border-color: CanvasText !important;
		}
		.status-icon {
			color: CanvasText !important;
		}
	}
</style>
