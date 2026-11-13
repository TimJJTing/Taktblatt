<!--
	A test-only screen renderer (ADR 20). It shows tasks as HTML nodes in a list or board layout.
	It uses the shared route-focus owner and the stage markers like a real view.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { getDiagramLayer } from '#lib/components/diagram/diagram-layer.ts';
	import type { DiagramViewProps } from '#lib/components/diagram/view-contract.ts';
	import { getEditing } from '#lib/state/editing.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { fixtureTasks } from './tasks.ts';

	let { layout, class: className }: DiagramViewProps & { layout: 'list' | 'board' } = $props();

	const ws = getWorkspace();
	const editing = getEditing();
	const layer = getDiagramLayer();
	const tasks = $derived(fixtureTasks(ws.plan));
	const routeTargets = editing.routeFocus.view(
		() => new Set(layer.active ? tasks.map((task) => task.id) : [])
	);
	onMount(routeTargets.register);
	const columns = ['todo', 'in_progress', 'done', 'canceled'] as const;
</script>

{#snippet node(task: { id: string; title: string; parentId: string | null })}
	<div
		role="button"
		tabindex="0"
		class="rounded border bg-background px-2 py-1 text-xs"
		aria-label={task.title}
		data-route-target={task.id}
		data-route-focus="keyboard"
		data-diagram-task={task.id}
		data-diagram-parent={task.parentId ?? undefined}
		data-testid="fixture-task"
		use:routeTargets.target={task.id}
	>
		<span data-diagram-label={task.id}>{task.title}</span>
	</div>
{/snippet}

<div class={['min-h-21 rounded-md border p-2', className]} data-testid="fixture-{layout}">
	{#if layout === 'list'}
		<div class="flex flex-col gap-1">
			{#each tasks as task (task.id)}{@render node(task)}{/each}
		</div>
	{:else}
		<div class="grid grid-cols-4 gap-2">
			{#each columns as column (column)}
				<div class="flex flex-col gap-1" data-testid="fixture-column">
					{#each tasks.filter((task) => task.status === column) as task (task.id)}
						{@render node(task)}
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>
