<!--
	The task modal. It shows all fields of a task, plus Stage, Parent, Note and Dependencies.
	Each field saves on blur. Esc closes the modal. The focus goes back to the "…" button.
-->
<script lang="ts">
	import DateRangeField from '#lib/components/edit/DateRangeField.svelte';
	import InlineText from '#lib/components/edit/InlineText.svelte';
	import OwnerChips from '#lib/components/edit/OwnerChips.svelte';
	import OwnerField from '#lib/components/edit/OwnerField.svelte';
	import ReadyDot from '#lib/components/edit/ReadyDot.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import {
		deleteImpact,
		isValidMoveTarget,
		moveConflicts,
		readyCount,
		type MoveConflicts,
		type MoveTarget
	} from '#lib/domain/dependencies.js';
	import { effectiveValues } from '#lib/domain/derive.js';
	import { formatRange, intlLocale } from '#lib/domain/format.js';
	import { allOwners } from '#lib/domain/owners.js';
	import { m } from '#lib/paraglide/messages.js';
	import { moveTask, removeTasks, renameOwnerEverywhere, updateTask } from '#lib/state/commands.js';
	import { getEditing } from '#lib/state/editing.svelte.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import DependencyPicker from './DependencyPicker.svelte';
	import MoveConflictDialog from './MoveConflictDialog.svelte';
	import NoteEditor from './NoteEditor.svelte';

	const ws = getWorkspace();
	const editing = getEditing();

	const task = $derived(
		editing.detailsTaskId ? ws.index.byId.get(editing.detailsTaskId) : undefined
	);
	const open = $derived(task !== undefined);
	const children = $derived(task ? (ws.index.children.get(task.id) ?? []) : []);
	const isParent = $derived(children.length > 0);
	const eff = $derived(task ? effectiveValues(task, children) : null);
	const ready = $derived(task ? readyCount(ws.index, task.id) : 0);
	const locale = $derived(intlLocale(ws.plan.locale));
	const titleText = $derived(task?.title || m.task_untitled());
	const ownerSuggestions = $derived(allOwners(ws.plan.tasks.map((t) => t.owners)));
	const stageNumber = (id: string) => ws.plan.stages.findIndex((s) => s.id === id) + 1;
	const stageName = (id: string) => {
		const stage = ws.plan.stages.find((s) => s.id === id);
		return `${m.stage_label({ n: stageNumber(id) })} · ${stage?.title || m.stage_title_placeholder({ n: stageNumber(id) })}`;
	};
	const parentOptions = $derived(
		task
			? ws.plan.tasks.filter(
					(t) =>
						t.id !== task.id &&
						isValidMoveTarget(ws.plan, task.id, { stageId: task.stageId, parentId: t.id })
				)
			: []
	);

	let confirmDelete = $state(false);
	const impact = $derived(task && confirmDelete ? deleteImpact(ws.plan, [task.id]) : null);

	let pendingMove = $state<{ target: MoveTarget; conflicts: MoveConflicts } | null>(null);

	function close() {
		editing.detailsTaskId = null;
	}

	function requestMove(target: MoveTarget) {
		if (!task) return;
		const conflicts = moveConflicts(ws.plan, task.id, target);
		if (conflicts.fixes.length || conflicts.warnings.length) {
			pendingMove = { target, conflicts };
			return;
		}
		moveTask(ws, task.id, target, []);
	}

	function confirmMove() {
		if (task && pendingMove) moveTask(ws, task.id, pendingMove.target, pendingMove.conflicts.fixes);
		pendingMove = null;
	}

	function deleteTask() {
		if (!task) return;
		confirmDelete = false;
		const id = task.id;
		close();
		removeTasks(ws, [id]);
	}
</script>

<Dialog.Root {open} onOpenChange={(o) => !o && close()}>
	<Dialog.Content
		class="max-h-[90vh] overflow-y-auto sm:max-w-xl"
		onCloseAutoFocus={(e) => {
			e.preventDefault();
			editing.detailsReturnFocus?.focus();
		}}
		data-testid="task-dialog"
	>
		{#if task && eff}
			<Dialog.Header>
				<Dialog.Title class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{task.parentId ? m.modal_title_subtask() : m.modal_title_task()}
				</Dialog.Title>
				<Dialog.Description class="sr-only">{titleText}</Dialog.Description>
			</Dialog.Header>

			<div class="-mt-2 flex items-center gap-2">
				{#if isParent}
					<Checkbox
						checked={eff.done === 'done'}
						indeterminate={eff.done === 'partial'}
						disabled
						aria-label={m.task_done_label({ task: titleText })}
						title={m.task_done_derived()}
					/>
				{:else}
					<Checkbox
						checked={task.done}
						onCheckedChange={(done) => updateTask(ws, task.id, { done })}
						aria-label={m.task_done_label({ task: titleText })}
					/>
				{/if}
				<div class="min-w-0 flex-1 text-lg font-semibold">
					<InlineText
						value={task.title}
						label={m.field_title()}
						placeholder={m.task_title_placeholder()}
						onCommit={(title) => updateTask(ws, task.id, { title })}
						testId="dialog-title"
					/>
				</div>
			</div>

			<dl class="grid grid-cols-[8rem_1fr] items-center gap-x-3 gap-y-2.5 text-sm">
				<dt class="text-muted-foreground">{m.column_deliverable()}</dt>
				<dd>
					<InlineText
						value={task.deliverable}
						label={m.column_deliverable()}
						placeholder="–"
						onCommit={(deliverable) => updateTask(ws, task.id, { deliverable })}
					/>
				</dd>

				<dt class="text-muted-foreground">{m.field_range()}</dt>
				<dd>
					{#if isParent}
						<span class="px-1.5 text-foreground/80" title={m.target_derived()}>
							{eff.start && eff.end ? formatRange(eff.start, eff.end, locale) : '–'}
						</span>
					{:else}
						<DateRangeField
							start={task.start}
							end={task.end}
							locale={ws.plan.locale}
							label={m.field_range()}
							onCommit={(range) => updateTask(ws, task.id, range)}
						>
							{#snippet trigger({ props })}
								<button
									{...props}
									type="button"
									class="rounded-sm px-1.5 py-0.5 text-left hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
									data-testid="dialog-range"
								>
									{#if task.start && task.end}
										{formatRange(task.start, task.end, locale)}
									{:else if task.start || task.end}
										{formatRange(task.start ?? task.end!, task.end ?? task.start!, locale)}
									{:else}
										<span class="text-muted-foreground">{m.target_empty()}</span>
									{/if}
								</button>
							{/snippet}
						</DateRangeField>
					{/if}
				</dd>

				<dt class="text-muted-foreground">{m.column_owner()}</dt>
				<dd>
					{#if isParent}
						<span class="flex px-1.5" title={m.owner_derived()}
							><OwnerChips owners={eff.owners} max={6} /></span
						>
					{:else}
						<OwnerField
							owners={task.owners}
							suggestions={ownerSuggestions}
							label={m.column_owner()}
							onChange={(owners) => updateTask(ws, task.id, { owners })}
							onRename={(from, to) => renameOwnerEverywhere(ws, from, to)}
						/>
					{/if}
				</dd>

				<dt class="text-muted-foreground">{m.field_stage()}</dt>
				<dd>
					{#if task.parentId === null}
						<Select.Root
							type="single"
							value={task.stageId}
							onValueChange={(stageId) => stageId && requestMove({ stageId, parentId: null })}
						>
							<Select.Trigger
								size="sm"
								class="max-w-full"
								aria-label={m.field_stage()}
								data-testid="dialog-stage"
							>
								<span class="truncate">{stageName(task.stageId)}</span>
							</Select.Trigger>
							<Select.Content>
								{#each ws.plan.stages as stage (stage.id)}
									<Select.Item value={stage.id} label={stageName(stage.id)}
										>{stageName(stage.id)}</Select.Item
									>
								{/each}
							</Select.Content>
						</Select.Root>
					{:else}
						<span class="px-1.5">{stageName(task.stageId)}</span>
					{/if}
				</dd>

				<dt class="text-muted-foreground">{m.field_parent()}</dt>
				<dd>
					{#if isParent}
						<span class="px-1.5 text-muted-foreground">{m.field_parent_locked()}</span>
					{:else}
						<Select.Root
							type="single"
							value={task.parentId ?? ''}
							onValueChange={(parentId) =>
								requestMove({ stageId: task.stageId, parentId: parentId || null })}
						>
							<Select.Trigger
								size="sm"
								class="max-w-full"
								aria-label={m.field_parent()}
								data-testid="dialog-parent"
							>
								<span class="truncate">
									{task.parentId
										? ws.index.byId.get(task.parentId)?.title || m.task_untitled()
										: m.field_parent_none()}
								</span>
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="" label={m.field_parent_none()}
									>{m.field_parent_none()}</Select.Item
								>
								{#each parentOptions as option (option.id)}
									<Select.Item value={option.id} label={option.title || m.task_untitled()}>
										{option.title || m.task_untitled()}
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					{/if}
				</dd>
			</dl>

			<section class="flex flex-col gap-1.5">
				<h3 class="text-sm text-muted-foreground">{m.field_note()}</h3>
				<NoteEditor
					note={task.note}
					tasks={ws.plan.tasks}
					selfId={task.id}
					onCommit={(note) => updateTask(ws, task.id, { note })}
				/>
			</section>

			<section class="flex flex-col gap-1.5">
				<h3 class="flex items-center gap-2 text-sm text-muted-foreground">
					{m.field_dependencies()}
					<ReadyDot count={ready} />
				</h3>
				<DependencyPicker {task} />
			</section>

			<Dialog.Footer class="mt-2 sm:justify-between">
				<Button
					variant="ghost"
					class="text-destructive hover:text-destructive"
					onclick={() => (confirmDelete = true)}
				>
					{m.task_delete()}
				</Button>
				<Button onclick={close} data-testid="dialog-ok">{m.action_ok()}</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root bind:open={confirmDelete}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.task_delete_title({ task: titleText })}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.task_delete_body({
					subtasks: impact?.subtasks ?? 0,
					dependents: impact?.dependents ?? 0
				})}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.action_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action class={buttonVariants({ variant: 'destructive' })} onclick={deleteTask}>
				{m.action_delete()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

{#if pendingMove}
	<MoveConflictDialog
		open
		taskTitle={titleText}
		conflicts={pendingMove.conflicts}
		onConfirm={confirmMove}
		onCancel={() => (pendingMove = null)}
	/>
{/if}
