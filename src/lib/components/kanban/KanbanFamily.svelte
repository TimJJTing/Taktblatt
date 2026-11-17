<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import { tick } from 'svelte';
	import type { Action } from 'svelte/action';
	import { fade } from 'svelte/transition';
	import Hint from '#lib/components/app/Hint.svelte';
	import { getDiagramLayer } from '#lib/components/diagram/diagram-layer.ts';
	import { markColorLevel } from '#lib/components/plan/colors.ts';
	import ExpandToggle from '#lib/components/task/ExpandToggle.svelte';
	import TaskStatusIcon from '#lib/components/task/TaskStatusIcon.svelte';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import type { KanbanFamily, KanbanLane } from '#lib/scene/kanban-board.ts';
	import { getEditing } from '#lib/state/editing.svelte.ts';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import { kanbanStateText, kanbanTaskContext } from './card-text.ts';

	let {
		family,
		stage,
		dimmed,
		target
	}: {
		family: KanbanFamily;
		stage: Pick<KanbanLane, 'stageNumber' | 'stageTitle'>;
		dimmed: Set<string>;
		target: Action<HTMLElement, string>;
	} = $props();
	const ws = getWorkspace();
	const viewer = getViewer();
	const editing = getEditing();
	const layer = getDiagramLayer();
	const intl = uiIntl();
	const detailId = $props.id();
	const title = $derived(family.title || m.task_untitled());
	const expanded = $derived(viewer.isExpanded(ws.plan.id, family.parentId));
	let detail = $state<HTMLUListElement>();
	$effect.pre(() => {
		if (!detail) return;
		if (!expanded) {
			const active = document.activeElement;
			const id =
				active instanceof HTMLElement && detail.contains(active)
					? active.closest<HTMLElement>('[data-diagram-task]')?.dataset.diagramTask
					: undefined;
			// Svelte makes an outgoing detail inert before it removes the task nodes.
			// Capture the shared resolver before that blur clears the stage's focus record.
			const resolve = id ? layer.returnFocus?.(id, null) : undefined;
			if (resolve)
				tick().then(() => {
					if (document.activeElement === active || document.activeElement === document.body)
						resolve()?.focus({ preventScroll: true });
				});
		}
		if (expanded) detail.removeAttribute('aria-hidden');
		else detail.setAttribute('aria-hidden', 'true');
		for (const button of detail.querySelectorAll('button')) {
			if (expanded) button.removeAttribute('tabindex');
			else button.tabIndex = -1;
		}
	});
	function openDetails(id: string, from: HTMLElement) {
		editing.openDetails(id, from, layer.returnFocus?.(id, from));
	}
	function hover(event: PointerEvent, id: string, enter: boolean) {
		const token = editing.routeFocus.tokenFor(event.currentTarget as Element);
		if (enter) editing.routeFocus.hoverEnter(id, token, event.pointerType);
		else editing.routeFocus.hoverLeave(token, event.pointerType);
	}
</script>

<div
	class="family relative col-start-2 col-end-6 min-w-0 px-1"
	data-testid="kanban-family"
	data-parent={family.parentId}
	data-expanded={expanded}
>
	<div class="flex min-w-0 items-center gap-1 py-1 text-sm">
		<ExpandToggle
			{expanded}
			task={title}
			large
			controls={detailId}
			testid="kanban-family-toggle"
			onToggle={() => viewer.toggleExpanded(ws.plan.id, family.parentId)}
		/>
		<span class="min-w-0 wrap-anywhere"
			>{m.kanban_family_row({ parent: title, count: family.total })}</span
		>
	</div>
	{#if expanded}
		<ul
			bind:this={detail}
			id={detailId}
			class="detail ml-6 flex flex-col gap-1 pb-2"
			data-testid="kanban-family-detail"
			transition:fade={{ duration: motionDuration(150) }}
		>
			{#each family.children as item (item.id)}
				{@const itemTitle = item.title || m.task_untitled()}
				{@const state = kanbanStateText(item.column)}
				{@const level = markColorLevel('todo', 'line', dimmed.has(item.id))}
				<li
					class="item min-w-0 rounded-md border bg-background"
					style:border-color={`color-mix(in oklab, var(--muted-foreground) ${level}%, var(--background))`}
					style:transition-duration="{motionDuration(150)}ms"
					data-testid="kanban-item"
					data-diagram-task={item.id}
					data-diagram-parent={item.parentId}
					data-route-target={item.id}
					use:target={item.id}
					onpointerenter={(event) => hover(event, item.id, true)}
					onpointerleave={(event) => hover(event, item.id, false)}
				>
					<Hint text={itemTitle}>
						{#snippet child({ props })}
							<button
								{...mergeProps(props, {
									onclick: (event: MouseEvent) =>
										openDetails(item.id, event.currentTarget as HTMLElement)
								})}
								type="button"
								class="flex w-full min-w-0 items-start gap-2 rounded-md p-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring"
								aria-label={m.kanban_card_action({
									task: itemTitle,
									context: m.kanban_item_context({
										parent: title,
										context: kanbanTaskContext(stage, item.column, intl)
									})
								})}
								data-diagram-label={item.id}
								data-route-target={item.id}
								data-route-focus="keyboard"
								use:target={item.id}
							>
								<span
									class="status-icon mt-0.5 flex size-4 shrink-0"
									data-diagram-station={item.id}
									aria-hidden="true"
									style:color={`color-mix(in oklab, var(--foreground) ${level}%, var(--background))`}
									style:transition-duration="{motionDuration(150)}ms"
									><TaskStatusIcon status={item.status} /></span
								>
								<span
									class="item-title min-w-0 flex-1 font-medium wrap-anywhere"
									class:line-through={item.status === 'done' || item.status === 'canceled'}
									class:text-muted-foreground={item.status === 'done' || item.status === 'canceled'}
									>{itemTitle}</span
								>
								<span
									class="shrink-0 text-xs leading-5 text-muted-foreground"
									data-testid="kanban-item-state">{state}</span
								>
							</button>
						{/snippet}
					</Hint>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	/* Keep the complete item clear of the stage heading in a narrow strip. */
	.detail {
		max-inline-size: calc(100cqw - 6rem - 2rem);
	}
	.item-title {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.25rem;
	}
	.item {
		transition-property: border-color;
	}
	.status-icon {
		transition-property: color;
	}
	/* The global reduced-motion rule keeps a 0.01 ms transition. Remove it here. */
	@media (prefers-reduced-motion: reduce) {
		.item,
		.status-icon,
		.status-icon :global(*) {
			transition: none;
		}
	}
	/* Keep the leaving detail visible while the lanes move to their final positions. */
	.family[data-expanded='false'] > .detail {
		position: absolute;
		inset-inline: 0.25rem;
		top: 100%;
		pointer-events: none;
	}
	@media (forced-colors: active) {
		.item {
			border-color: CanvasText !important;
		}
		.status-icon {
			color: CanvasText !important;
		}
	}
</style>
