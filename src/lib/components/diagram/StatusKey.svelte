<script lang="ts">
	import TaskStatusIcon from '#lib/components/task/TaskStatusIcon.svelte';
	import { taskStatusLabel } from '#lib/components/task/task-status.ts';
	import { m } from '#lib/paraglide/messages.js';

	let { still }: { still?: boolean } = $props();
	const statuses = ['todo', 'in_progress', 'done', 'canceled'] as const;
</script>

<ul class="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label={m.diagram_status_key()}>
	{#each statuses as status (status)}
		<li class="flex items-center gap-1">
			<TaskStatusIcon {status} class={still ? 'size-3' : 'size-4'} />
			{taskStatusLabel(status)}
		</li>
	{/each}
</ul>
<p>{m.diagram_status_key_readiness()}</p>
