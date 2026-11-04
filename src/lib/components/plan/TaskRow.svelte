<!--
	The cells of one work-plan row: a task (level 1) or a subtask (level 2).
	A parent shows derived values for target, owners and done. These cells are read-only.
-->
<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import { tick } from 'svelte';
	import OwnerChips from '#lib/components/edit/OwnerChips.svelte';
	import DateRangeField from '#lib/components/edit/DateRangeField.svelte';
	import InlineText from '#lib/components/edit/InlineText.svelte';
	import OwnerField from '#lib/components/edit/OwnerField.svelte';
	import ReadyDot from '#lib/components/edit/ReadyDot.svelte';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { focusSiblingRow } from '#lib/browser/grid.js';
	import { readyCount } from '#lib/domain/dependencies.js';
	import { effectiveValues } from '#lib/domain/derive.js';
	import { formatRangeDisplay, formatTarget, intlLocale } from '#lib/domain/format.js';
	import type { Task } from '#lib/domain/schema.js';
	import { m } from '#lib/paraglide/messages.js';
	import { renameOwnerEverywhere, updateTask } from '#lib/state/commands.js';
	import { getEditing } from '#lib/state/editing.svelte.js';
	import { getViewer } from '#lib/state/viewer.svelte.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import { cn } from '#lib/utils.js';

	interface Props {
		task: Task;
		ownerSuggestions: readonly string[];
		/** Called when the title edit ends. The parent removes a new task that stayed empty. */
		onTitleDone?: (task: Task) => void;
	}

	let { task, ownerSuggestions, onTitleDone }: Props = $props();

	const ws = getWorkspace();
	const viewer = getViewer();
	const editing = getEditing();

	const children = $derived(ws.index.children.get(task.id) ?? []);
	const isParent = $derived(children.length > 0);
	const isSubtask = $derived(task.parentId !== null);
	const eff = $derived(effectiveValues(task, children));
	const ready = $derived(readyCount(ws.index, task.id));
	const expanded = $derived(viewer.isExpanded(ws.plan.id, task.id));
	const locale = $derived(intlLocale(ws.plan.locale));
	const titleText = $derived(task.title || m.task_untitled());
	const muted = $derived(eff.done === 'done');

	let titleCell = $state<HTMLTableCellElement | null>(null);

	function next(from: 'title' | 'deliverable') {
		const cell = titleCell?.closest('tr')?.querySelector(`[data-grid-col="${from}"]`);
		if (cell) tick().then(() => focusSiblingRow(cell, 1));
	}

	const rangeText = $derived(formatRangeDisplay(eff.start, eff.end, locale));
</script>

<td class="py-1 pl-1 align-middle">
	{#if isParent}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<span {...props} class="inline-flex">
						<Checkbox
							checked={eff.done === 'done'}
							indeterminate={eff.done === 'partial'}
							disabled
							aria-label={m.task_done_label({ task: titleText })}
						/>
					</span>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{m.task_done_derived()}</Tooltip.Content>
		</Tooltip.Root>
	{:else}
		<Checkbox
			checked={task.done}
			onCheckedChange={(done) => updateTask(ws, task.id, { done })}
			aria-label={m.task_done_label({ task: titleText })}
			data-testid="task-done"
		/>
	{/if}
</td>
<td bind:this={titleCell} class="py-1" data-grid-col="title">
	<div class={cn('flex min-w-0 items-center gap-1', isSubtask && 'pl-6')}>
		{#if isParent}
			<button
				type="button"
				class="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
				aria-expanded={expanded}
				aria-label={expanded
					? m.task_collapse({ task: titleText })
					: m.task_expand({ task: titleText })}
				onclick={() => viewer.toggleExpanded(ws.plan.id, task.id)}
				data-testid="task-toggle"
			>
				<ChevronRightIcon
					class={cn('size-3.5 transition-transform duration-200', expanded && 'rotate-90')}
					aria-hidden="true"
				/>
			</button>
		{:else}
			<span class="size-5 shrink-0" aria-hidden="true"></span>
		{/if}
		<ReadyDot count={ready} />
		<div class="min-w-0 flex-1">
			<InlineText
				value={task.title}
				label={m.column_task()}
				placeholder={isSubtask ? m.subtask_title_placeholder() : m.task_title_placeholder()}
				autoEdit={editing.newTaskId === task.id}
				class={cn(
					!isSubtask && 'font-medium',
					muted && 'line-through decoration-muted-foreground/50'
				)}
				onCommit={(title) => updateTask(ws, task.id, { title })}
				onEnter={() => next('title')}
				onDone={() => {
					if (editing.newTaskId === task.id) editing.newTaskId = null;
					onTitleDone?.(task);
				}}
				testId="task-title"
			/>
		</div>
	</div>
</td>
<td class="py-1" data-grid-col="deliverable">
	<InlineText
		value={task.deliverable}
		label={m.column_deliverable()}
		onCommit={(deliverable) => updateTask(ws, task.id, { deliverable })}
		onEnter={() => next('deliverable')}
		testId="task-deliverable"
	/>
</td>
<td class="py-1 whitespace-nowrap" data-grid-col="target">
	{#if isParent}
		<span
			class="block px-1.5 py-0.5 tabular-nums"
			title="{m.target_derived()}{eff.start || eff.end ? ` · ${rangeText}` : ''}"
			data-testid="task-target"
		>
			{formatTarget(eff, true, locale)}
		</span>
	{:else}
		<DateRangeField
			start={task.start}
			end={task.end}
			locale={ws.plan.locale}
			label={m.column_target()}
			onCommit={(range) => updateTask(ws, task.id, range)}
		>
			{#snippet trigger({ props })}
				<button
					{...props}
					type="button"
					title={eff.start || eff.end ? rangeText : undefined}
					class="block w-full rounded-sm px-1.5 py-0.5 text-left tabular-nums transition-colors outline-none hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring/50"
					data-testid="task-target"
				>
					{#if task.end}
						{formatTarget(task, false, locale)}
					{:else if task.start}
						<span class="text-muted-foreground">{formatTarget(task, false, locale)}</span>
					{:else}
						<span class="text-muted-foreground/70">{m.target_empty()}</span>
					{/if}
				</button>
			{/snippet}
		</DateRangeField>
	{/if}
</td>
<td class="py-1" data-grid-col="owner" data-testid="task-owners">
	{#if isParent}
		<span class="flex px-1.5 py-0.5" title={m.owner_derived()}>
			<OwnerChips owners={eff.owners} />
		</span>
	{:else}
		<OwnerField
			owners={task.owners}
			suggestions={ownerSuggestions}
			label={m.column_owner()}
			onChange={(owners) => updateTask(ws, task.id, { owners })}
			onRename={(from, to) => renameOwnerEverywhere(ws, from, to)}
		/>
	{/if}
</td>
<td class="py-1 pr-1 text-right">
	<button
		type="button"
		class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
		aria-label={m.task_details({ task: titleText })}
		aria-haspopup="dialog"
		onclick={(e) => editing.openDetails(task.id, e.currentTarget)}
		data-testid="task-details"
	>
		<EllipsisIcon class="size-4" aria-hidden="true" />
	</button>
</td>
