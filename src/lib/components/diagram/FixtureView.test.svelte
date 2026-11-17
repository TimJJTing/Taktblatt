<!--
	A test-only screen renderer (ADR 20). It shows the plan tasks as focusable HTML nodes.
	It uses the shared route targets and the stage marks like a real view.
	Layouts: `list` (a column), `row` (one row with an offset) and `board` (status columns).
-->
<script lang="ts">
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { diagramRouteTargets } from './diagram-layer.ts';
	import {
		fixtureTasks,
		type FixtureLayout,
		type FixtureScrollOptions,
		type FixtureTask
	} from './fixture-views.test-helper.ts';
	import type { DiagramViewProps } from './view-contract.ts';

	interface Props extends DiagramViewProps {
		layout: FixtureLayout;
		/** Task ids that this view does not show. */
		omit?: readonly string[];
		/** Omit subtasks (`parentId !== null`) while keeping their parents. */
		omitSubtasks?: boolean;
		/** Nested scroller bounds and sticky-header clearance. */
		scroll?: FixtureScrollOptions;
	}

	let { layout, omit = [], omitSubtasks = false, scroll, class: className }: Props = $props();

	const ws = getWorkspace();
	const tasks = $derived(
		fixtureTasks(ws.plan).filter(
			(task) => !omit.includes(task.id) && !(omitSubtasks && task.parentId !== null)
		)
	);
	const routeTargets = diagramRouteTargets(() => tasks.map((task) => task.id));
	const columns = ['todo', 'in_progress', 'done', 'canceled'] as const;
</script>

{#snippet node(task: FixtureTask)}
	<div
		role="button"
		tabindex="0"
		class="h-6 w-24 shrink-0 rounded border bg-background px-2 py-1 text-xs"
		aria-label={task.title}
		data-route-target={task.id}
		data-route-focus="keyboard"
		data-diagram-task={task.id}
		data-diagram-parent={task.parentId ?? undefined}
		data-testid="fixture-task"
		use:routeTargets.target={task.id}
	>
		<span data-diagram-station={task.id} style="display: inline-block; width: 8px; height: 8px"
		></span>
		<span data-diagram-label={task.id}>{task.title}</span>
	</div>
{/snippet}

<div
	class={['min-h-21 rounded-md border p-2', scroll?.height && 'overflow-y-auto', className]}
	style:max-height={scroll?.height ? `${scroll.height}px` : undefined}
	style:scroll-padding-top={scroll?.paddingTop ? `${scroll.paddingTop}px` : undefined}
	data-testid="fixture-{layout}"
	data-diagram-scroller
>
	{#if scroll?.paddingTop}
		<div
			class="sticky top-0 z-10 shrink-0 bg-background text-xs"
			style:height="{scroll.paddingTop}px"
		>
			Header
		</div>
	{/if}
	<div
		class={scroll?.width ? 'flex overflow-x-auto' : undefined}
		style:max-width={scroll?.width ? `${scroll.width}px` : undefined}
		style:scroll-padding-left={scroll?.paddingLeft ? `${scroll.paddingLeft}px` : undefined}
		data-testid="fixture-scroller"
		data-diagram-scroller
	>
		{#if scroll?.paddingLeft}
			<div
				class="sticky left-0 z-10 shrink-0 bg-background text-xs"
				style:width="{scroll.paddingLeft}px"
			>
				Stage
			</div>
		{/if}
		{#if layout === 'board'}
			<div class="grid grid-cols-4 gap-2">
				{#each columns as column (column)}
					<div class="flex flex-col gap-1" data-testid="fixture-column">
						{#each tasks.filter((task) => task.status === column) as task (task.id)}
							{@render node(task)}
						{/each}
					</div>
				{/each}
			</div>
		{:else}
			<div
				class={layout === 'row' ? 'flex flex-row gap-6 pt-24 pl-60' : 'flex flex-col gap-2 pl-4'}
			>
				{#each tasks as task (task.id)}{@render node(task)}{/each}
			</div>
		{/if}
	</div>
</div>
