<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import type { Action } from 'svelte/action';
	import Hint from '#lib/components/app/Hint.svelte';
	import StationDot from '#lib/components/diagram/StationDot.svelte';
	import StageBadge from '#lib/components/diagram/StageBadge.svelte';
	import ReadyDot from '#lib/components/edit/ReadyDot.svelte';
	import { markColorLevel, stageColorVar } from '#lib/components/plan/colors.ts';
	import { joinList } from '#lib/domain/format.ts';
	import type { StageColor } from '#lib/domain/palette.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import type { KanbanCard } from '#lib/scene/kanban-board.ts';
	import { kanbanColumnLabel } from '#lib/scene/kanban-paper.ts';
	import { getEditing } from '#lib/state/editing.svelte.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import { cardDates } from './card-text.ts';
	interface Props {
		card: KanbanCard;
		color: StageColor;
		dimmed: boolean;
		target: Action<HTMLElement, string>;
		onNavigate: (event: KeyboardEvent, id: string) => void;
	}
	let { card, color, dimmed, target, onNavigate }: Props = $props();
	const editing = getEditing();
	const locale = uiIntl();
	const descId = $props.id();
	const title = $derived(card.title || m.task_untitled());
	const owners = $derived(
		card.owners.length ? joinList(card.owners, locale) : m.kanban_no_owners()
	);
	const dates = $derived(cardDates(card, locale));
	const readiness = $derived(
		card.readiness.kind === 'ready'
			? card.readiness.via === 'subtasks'
				? m.ready_label_subtasks({ count: card.readiness.count })
				: card.readiness.count
					? m.ready_label({ count: card.readiness.count })
					: m.ready_label_plain()
			: card.readiness.kind === 'blocked'
				? m.kanban_blocked()
				: ''
	);
	const label = $derived(
		m.kanban_card_action({
			task: title,
			context: m.kanban_summary({
				stage: joinList(
					[
						m.stage_badge({ n: card.stageNumber }),
						card.stageTitle,
						...(card.parentTitle !== null
							? [m.kanban_parent({ parent: card.parentTitle || m.task_untitled() })]
							: [])
					],
					locale
				),
				status:
					card.column === 'blocked'
						? joinList([m.task_status_todo(), kanbanColumnLabel(card.column)], locale)
						: kanbanColumnLabel(card.column)
			})
		})
	);
	const colorValue = $derived(stageColorVar(color));
	const rule = $derived(
		`color-mix(in oklab, ${colorValue} ${markColorLevel(card.status, 'line', dimmed)}%, var(--background))`
	);
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
	class="card relative flex h-44 min-w-0 flex-col gap-1 overflow-hidden rounded-md border bg-background p-2 pl-3 text-sm"
	style:border-left="4px solid {rule}"
	style:transition-duration="{motionDuration(150)}ms"
	data-diagram-task={card.id}
	data-diagram-parent={card.parentId ?? undefined}
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
						onclick: (event: MouseEvent) =>
							editing.openDetails(card.id, event.currentTarget as HTMLElement),
						onkeydown: (event: KeyboardEvent) => onNavigate(event, card.id)
					})}
					type="button"
					class="order-2 flex min-w-0 flex-1 items-start gap-1 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring"
					aria-label={label}
					aria-describedby={[
						descId,
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
						class="title min-w-0 font-medium break-all">{title}</span
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
			><span data-diagram-station={card.id}
				><StationDot
					status={card.status}
					color={colorValue}
					size={10}
					route={dimmed ? 'off' : null}
				/></span
			></button
		>
	</div>
	<div class="mt-auto flex min-w-0 items-center gap-1">
		<StageBadge {color} label={m.stage_badge({ n: card.stageNumber })} /><span class="truncate"
			>{card.stageTitle}</span
		>
	</div>
	<div class="h-5 truncate text-xs text-muted-foreground">
		{card.parentTitle !== null
			? m.kanban_parent({ parent: card.parentTitle || m.task_untitled() })
			: ''}
	</div>
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
		min-height: 2.5em;
	}
	.card {
		transition-property: border-color;
	}
</style>
