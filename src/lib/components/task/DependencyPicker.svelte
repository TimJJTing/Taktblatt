<!--
	The dependencies of a task. Own dependencies are chips that you can remove.
	Subtasks also show inherited dependencies (read-only).
	The search shows only candidates that keep the rules. Refer to docs/spec.md, section 3.
-->
<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import XIcon from '@lucide/svelte/icons/x';
	import { isComposing } from '#lib/browser/keyboard.ts';
	import Hint from '#lib/components/app/Hint.svelte';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { canDependOn, candidateWarnings, dependencyWarnings } from '#lib/domain/dependencies.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import { joinSentences } from '#lib/domain/format.ts';
	import { inheritedDependencies } from '#lib/domain/derive.ts';
	import { matchesWords } from '#lib/domain/mentions.ts';
	import type { Task } from '#lib/domain/schema.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { updateTask } from '#lib/state/commands.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { motionDuration } from '#lib/motion.ts';
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
	const warnings = $derived(dependencyWarnings(ws.index));
	const orderedOptions = $derived(
		task.parentId !== null
			? ws.plan.tasks.filter((t) => t.parentId === task.parentId)
			: ws.plan.tasks
					.filter((t) => t.parentId === null)
					.flatMap((parent) => [parent, ...ws.plan.tasks.filter((t) => t.parentId === parent.id)])
	);
	const candidates = $derived(
		focused
			? orderedOptions
					.filter(
						(t) =>
							canDependOn(ws.index, task.id, t.id) &&
							(matchesWords(t.title || '', query) ||
								(t.parentId !== null && matchesWords(title(t.parentId), query)))
					)
					.map((candidate) => ({
						...candidate,
						warnings: candidateWarnings(ws.index, task.id, candidate.id)
					}))
					.sort((a, b) => Number(a.warnings.length > 0) - Number(b.warnings.length > 0))
					.slice(0, 8)
			: []
	);

	function warningText(dependencyId: string, ownerId = task.id): string {
		return joinSentences(
			warnings
				.filter((w) => w.taskId === ownerId && w.dependencyId === dependencyId)
				.map((w) =>
					w.kind === 'date'
						? m.dependency_warning({ task: title(dependencyId) })
						: w.kind === 'cycle'
							? m.dependency_warning_cycle()
							: m.dependency_warning_subtask_scope()
				),
			uiIntl()
		);
	}

	function candidateText(warnings: ('cycle' | 'date')[]): string {
		return joinSentences(
			warnings.map((kind) =>
				kind === 'cycle' ? m.dependency_candidate_cycle() : m.dependency_candidate_date()
			),
			uiIntl()
		);
	}

	const listOpen = $derived(focused && !suggestionsHidden);

	/** The dialog scrolls. When the list opens, scroll it into the visible area of the dialog. */
	function revealList(list: HTMLElement) {
		list.scrollIntoView({
			block: 'nearest',
			behavior: motionDuration(1) === 0 ? 'instant' : 'smooth'
		});
	}
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
				{@const warn = warningText(id)}
				<li
					class={cn(
						'flex items-center gap-1 rounded-full border bg-background py-0.5 pr-0.5 pl-2 text-xs',
						warn && 'border-amber-500/60'
					)}
				>
					{#if warn}
						<TriangleAlertIcon class="size-3 text-amber-600" role="img" aria-label={warn} />
					{/if}
					<Hint text={warn || undefined} focusable={false}>
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
				{@const source = m.dependency_inherited_parent({ task: title(dep.fromId) })}
				{@const warn = warningText(dep.depId, dep.fromId)}
				<Hint text={joinSentences([source, ...(warn ? [warn] : [])], uiIntl())} focusable={false}>
					{#snippet child({ props })}
						<li
							{...props}
							class="flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground"
						>
							{#if warn}
								<TriangleAlertIcon class="size-3 text-amber-600" role="img" aria-label={warn} />
							{/if}
							<span class="max-w-48 truncate">{title(dep.depId)}</span>
							<span class="sr-only"
								>{m.parenthetical({
									text: source
								})}</span
							>
						</li>
					{/snippet}
				</Hint>
			{/each}
		</ul>
	{/if}
	<!-- The help is above the input. The open list covers the space below it. -->
	{#if task.parentId !== null}
		<p id={`${id}-help`} class="text-xs text-muted-foreground">{m.dependency_subtask_help()}</p>
	{/if}
	<div class="relative">
		<Input
			bind:value={query}
			aria-describedby={task.parentId !== null ? `${id}-help` : undefined}
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
				{@attach revealList}
				class="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
			>
				{#each candidates as candidate, i (candidate.id)}
					{@const warn = candidateText(candidate.warnings)}
					<Hint text={warn || undefined} focusable={false}>
						{#snippet child({ props })}
							<button
								{...mergeProps(props, {
									onmousedown: (event: MouseEvent) => {
										event.preventDefault();
										add(candidate.id);
									}
								})}
								type="button"
								role="option"
								id={`${id}-option-${i}`}
								tabindex="-1"
								aria-selected={i === activeIndex}
								class={cn(
									'block w-full truncate rounded-sm px-2 py-1 text-left',
									i === activeIndex && 'bg-accent',
									candidate.parentId !== null && task.parentId === null && 'pl-6'
								)}
							>
								{candidate.title || m.task_untitled()}
								{#if warn}
									<TriangleAlertIcon class="ml-1 inline size-3 text-amber-600" aria-hidden="true" />
									<span class="sr-only">{warn}</span>
								{/if}
								{#if candidate.parentId !== null && task.parentId === null}
									<span class="ml-2 text-xs text-muted-foreground">{title(candidate.parentId)}</span
									>
								{/if}
							</button>
						{/snippet}
					</Hint>
				{:else}
					<p class="px-2 py-1 text-muted-foreground">{m.dependency_none()}</p>
				{/each}
			</div>
		{/if}
	</div>
</div>
