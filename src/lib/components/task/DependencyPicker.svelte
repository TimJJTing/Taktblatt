<!--
	The dependencies of a task. Own dependencies are chips that you can remove.
	A parent also shows the inherited dependencies of its subtasks (read-only).
	The search shows only candidates that keep the rules. Refer to docs/spec.md, section 3.
-->
<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import XIcon from '@lucide/svelte/icons/x';
	import { Input } from '#lib/components/ui/input/index.js';
	import { breaksDateRule, canDependOn, inheritedDependencies } from '#lib/domain/dependencies.js';
	import { matchesWords } from '#lib/domain/mentions.js';
	import type { Task } from '#lib/domain/schema.js';
	import { m } from '#lib/paraglide/messages.js';
	import { updateTask } from '#lib/state/commands.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import { cn } from '#lib/utils.js';

	let { task }: { task: Task } = $props();

	const ws = getWorkspace();
	let query = $state('');
	let focused = $state(false);
	let active = $state(0);

	const title = (id: string) => ws.index.byId.get(id)?.title || m.task_untitled();
	const inherited = $derived(inheritedDependencies(ws.index, task.id));
	const candidates = $derived(
		focused
			? ws.plan.tasks
					.filter((t) => canDependOn(ws.index, task.id, t.id) && matchesWords(t.title || '', query))
					.slice(0, 8)
			: []
	);

	function add(id: string) {
		updateTask(ws, task.id, { dependsOn: [...task.dependsOn, id] });
		query = '';
		active = 0;
	}

	function remove(id: string) {
		updateTask(ws, task.id, { dependsOn: task.dependsOn.filter((d) => d !== id) });
	}

	function onKeydown(event: KeyboardEvent) {
		if (candidates.length === 0) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + candidates.length) % candidates.length;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			add(candidates[Math.min(active, candidates.length - 1)].id);
		}
	}
</script>

<div class="flex flex-col gap-2">
	{#if task.dependsOn.length || inherited.length}
		<ul class="flex flex-wrap gap-1.5" data-testid="dependency-list">
			{#each task.dependsOn as id (id)}
				{@const warn = breaksDateRule(ws.index, id, task.id)}
				<li
					class={cn(
						'flex items-center gap-1 rounded-full border bg-background py-0.5 pr-0.5 pl-2 text-xs',
						warn && 'border-amber-500/60'
					)}
				>
					{#if warn}
						<TriangleAlertIcon
							class="size-3 text-amber-600"
							aria-label={m.dependency_warning({ task: title(id) })}
						/>
					{/if}
					<span
						class="max-w-48 truncate"
						title={warn ? m.dependency_warning({ task: title(id) }) : undefined}
					>
						{title(id)}
					</span>
					<button
						type="button"
						class="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
						aria-label={m.dependency_remove({ task: title(id) })}
						onclick={() => remove(id)}
					>
						<XIcon class="size-3" aria-hidden="true" />
					</button>
				</li>
			{/each}
			{#each inherited as dep (dep.depId + dep.fromId)}
				<li
					class="flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground"
					title={m.dependency_inherited({ task: title(dep.fromId) })}
				>
					<span class="max-w-48 truncate">{title(dep.depId)}</span>
					<span class="sr-only">({m.dependency_inherited({ task: title(dep.fromId) })})</span>
				</li>
			{/each}
		</ul>
	{/if}
	<div class="relative">
		<Input
			bind:value={query}
			placeholder={m.dependency_search()}
			aria-label={m.dependency_add()}
			role="combobox"
			aria-expanded={candidates.length > 0}
			aria-controls="dependency-options"
			class="h-8"
			onfocus={() => (focused = true)}
			onblur={() => (focused = false)}
			oninput={() => (active = 0)}
			onkeydown={onKeydown}
			data-testid="dependency-input"
		/>
		{#if focused}
			<div
				id="dependency-options"
				role="listbox"
				class="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
			>
				{#each candidates as candidate, i (candidate.id)}
					<button
						type="button"
						role="option"
						aria-selected={i === active}
						class={cn(
							'block w-full truncate rounded-sm px-2 py-1 text-left',
							i === active && 'bg-accent'
						)}
						onmousedown={(e) => {
							e.preventDefault();
							add(candidate.id);
						}}
					>
						{candidate.title || m.task_untitled()}
					</button>
				{:else}
					<p class="px-2 py-1 text-muted-foreground">{m.dependency_none()}</p>
				{/each}
			</div>
		{/if}
	</div>
</div>
