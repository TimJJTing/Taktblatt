<!--
	The dependencies of a task. Own dependencies are chips that you can remove.
	A parent also shows the inherited dependencies of its subtasks (read-only).
	The search shows only candidates that keep the rules. Refer to docs/spec.md, section 3.
-->
<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import XIcon from '@lucide/svelte/icons/x';
	import { isComposing } from '#lib/browser/keyboard.ts';
	import Hint from '#lib/components/app/Hint.svelte';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { breaksDateRule, canDependOn, inheritedDependencies } from '#lib/domain/dependencies.ts';
	import { matchesWords } from '#lib/domain/mentions.ts';
	import type { Task } from '#lib/domain/schema.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { updateTask } from '#lib/state/commands.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { cn } from '#lib/utils.ts';

	let { task }: { task: Task } = $props();

	const id = $props.id();
	const ws = getWorkspace();
	let query = $state('');
	let focused = $state(false);
	let suggestionsHidden = $state(false);
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

	const listOpen = $derived(focused && !suggestionsHidden);
	const activeIndex = $derived(Math.min(active, candidates.length - 1));

	function add(id: string) {
		updateTask(ws, task.id, { dependsOn: [...task.dependsOn, id] });
		query = '';
		active = 0;
	}

	function remove(id: string) {
		updateTask(ws, task.id, { dependsOn: task.dependsOn.filter((d) => d !== id) });
	}

	function onKeydown(event: KeyboardEvent) {
		if (isComposing(event)) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			if (listOpen) suggestionsHidden = true;
			else query = '';
			return;
		}
		if (!listOpen || candidates.length === 0) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + candidates.length) % candidates.length;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			add(candidates[activeIndex].id);
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
							role="img"
							aria-label={m.dependency_warning({ task: title(id) })}
						/>
					{/if}
					<Hint
						text={warn ? m.dependency_warning({ task: title(id) }) : undefined}
						focusable={false}
					>
						{#snippet child({ props })}
							<span {...props} class="max-w-48 truncate">{title(id)}</span>
						{/snippet}
					</Hint>
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
				<Hint text={m.dependency_inherited({ task: title(dep.fromId) })} focusable={false}>
					{#snippet child({ props })}
						<li
							{...props}
							class="flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground"
						>
							<span class="max-w-48 truncate">{title(dep.depId)}</span>
							<span class="sr-only"
								>{m.parenthetical({
									text: m.dependency_inherited({ task: title(dep.fromId) })
								})}</span
							>
						</li>
					{/snippet}
				</Hint>
			{/each}
		</ul>
	{/if}
	<div class="relative">
		<Input
			bind:value={query}
			placeholder={m.dependency_search()}
			aria-label={m.dependency_add()}
			role="combobox"
			aria-expanded={listOpen}
			aria-autocomplete="list"
			aria-controls={listOpen ? `${id}-options` : undefined}
			aria-activedescendant={listOpen && candidates.length > 0
				? `${id}-option-${activeIndex}`
				: undefined}
			class="h-8"
			onfocus={() => {
				focused = true;
				suggestionsHidden = false;
			}}
			onblur={() => {
				focused = false;
				query = '';
				active = 0;
			}}
			oninput={() => {
				active = 0;
				suggestionsHidden = false;
			}}
			onkeydown={onKeydown}
			data-testid="dependency-input"
		/>
		{#if listOpen}
			<div
				id={`${id}-options`}
				aria-label={m.dependency_search()}
				role="listbox"
				class="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
			>
				{#each candidates as candidate, i (candidate.id)}
					<button
						type="button"
						role="option"
						id={`${id}-option-${i}`}
						tabindex="-1"
						aria-selected={i === activeIndex}
						class={cn(
							'block w-full truncate rounded-sm px-2 py-1 text-left',
							i === activeIndex && 'bg-accent'
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
