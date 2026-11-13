<!--
	A test-only screen renderer for component tests of the diagram stage (ADR 20).
	It shows the plan tasks as focusable HTML nodes in a column or a row.
	It uses the shared route-focus owner and the stage markers like a real view.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { getEditing } from '#lib/state/editing.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { getDiagramLayer } from './diagram-layer.ts';
	import type { DiagramViewProps } from './view-contract.ts';

	interface Props extends DiagramViewProps {
		layout: 'column' | 'row';
		/** Task ids that this view does not show. */
		omit?: readonly string[];
	}

	let { layout, omit = [] }: Props = $props();

	const ws = getWorkspace();
	const editing = getEditing();
	const layer = getDiagramLayer();
	const tasks = $derived(ws.plan.tasks.filter((task) => !omit.includes(task.id)));
	const routeTargets = editing.routeFocus.view(
		() => new Set(layer.active ? tasks.map((task) => task.id) : [])
	);
	onMount(routeTargets.register);
</script>

<div
	class={layout === 'row' ? 'flex flex-row gap-6 pt-24 pl-60' : 'flex flex-col gap-2 pl-4'}
	data-testid="test-view-{layout}"
>
	{#each tasks as task (task.id)}
		<div
			role="button"
			tabindex="0"
			class="h-6 w-24 rounded border"
			aria-label={task.title}
			data-route-target={task.id}
			data-route-focus="keyboard"
			data-diagram-task={task.id}
			data-diagram-parent={task.parentId ?? undefined}
			use:routeTargets.target={task.id}
		>
			<span data-diagram-label={task.id}>{task.title}</span>
		</div>
	{/each}
</div>
