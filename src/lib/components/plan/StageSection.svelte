<!--
	One stage in the work plan: header, table of tasks and subtasks, and the "+" lines.
	Tasks sort by start date. The reorder is animated (FLIP).
-->
<script lang="ts">
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { fade } from 'svelte/transition';
	import { dragHandle } from 'svelte-dnd-action';
	import AddLine from '#lib/components/edit/AddLine.svelte';
	import AnimatedNumber from '#lib/components/edit/AnimatedNumber.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { stageDeleteImpact } from '#lib/domain/dependencies.js';
	import { effectiveValues, stageProgress, stageSpan } from '#lib/domain/derive.js';
	import { formatMonthSpan, intlLocale } from '#lib/domain/format.js';
	import { type Stage, type Task } from '#lib/domain/schema.js';
	import { motionDuration } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		addTask,
		moveStage,
		removeStage,
		discardNewTask,
		updateStage
	} from '#lib/state/commands.js';
	import { FLASH_MS, getEditing } from '#lib/state/editing.svelte.js';
	import { getViewer } from '#lib/state/viewer.svelte.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import { cn } from '#lib/utils.js';
	import StageColorPicker from './StageColorPicker.svelte';
	import StageTitle from './StageTitle.svelte';
	import TaskRow from './TaskRow.svelte';
	import { stageColorVar } from './colors.js';

	interface Props {
		stage: Stage;
		number: number;
		ownerSuggestions: readonly string[];
	}

	let { stage, number, ownerSuggestions }: Props = $props();

	const ws = getWorkspace();
	const viewer = getViewer();
	const editing = getEditing();

	const tasks = $derived(ws.index.stageTasks.get(stage.id) ?? []);
	const progress = $derived(stageProgress(ws.index, stage.id));
	// Let the message place the animated done count in the locale's word order.
	const progressText = $derived(
		m.stage_progress({ done: '{done}', total: progress.total }).split('{done}')
	);
	const span = $derived(stageSpan(ws.index, stage.id));
	const months = $derived(
		span ? formatMonthSpan(span.start, span.end, intlLocale(ws.plan.locale)) : ''
	);
	const position = $derived(ws.plan.stages.findIndex((s) => s.id === stage.id));
	const otherColors = $derived(ws.plan.stages.filter((s) => s.id !== stage.id).map((s) => s.color));
	const stageName = $derived(stage.title || m.stage_title_placeholder({ n: number }));
	const flipDuration = $derived(motionDuration(280));

	let confirmDelete = $state(false);
	const impact = $derived(confirmDelete ? stageDeleteImpact(ws.plan, stage.id) : null);

	function discardIfEmpty(task: Task) {
		discardNewTask(ws, task.id);
	}

	function newTask(parentId: string | null) {
		if (parentId) viewer.setExpanded(ws.plan.id, parentId, true);
		editing.newTaskId = addTask(ws, stage.id, { parentId });
	}
</script>

<section
	class="group/stage scroll-mt-anchor"
	aria-labelledby="stage-{stage.id}-title"
	data-testid="stage"
	data-stage-id={stage.id}
>
	<header class="flex items-center gap-2 pb-2">
		<!-- Not a <button>: svelte-dnd-action ignores keyboard drag on elements with a "disabled" property. -->
		<div
			use:dragHandle
			role="button"
			tabindex="0"
			class="-ml-6 flex size-5 cursor-grab items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-focus-within/stage:opacity-100 group-hover/stage:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing [@media(hover:none)]:opacity-100"
			aria-label={m.stage_drag()}
		>
			<GripVerticalIcon class="size-4" aria-hidden="true" />
		</div>
		<StageColorPicker
			value={stage.color}
			used={otherColors}
			onChange={(color) => updateStage(ws, stage.id, { color })}
		/>
		<h3
			id="stage-{stage.id}-title"
			class="flex min-w-0 items-baseline gap-1 text-base font-semibold"
		>
			<span class="shrink-0">{m.stage_label({ n: number })} ·</span>
			<span class="min-w-0">
				<StageTitle {stage} {number} />
			</span>
			{#if months}
				<span
					class="shrink-0 font-normal text-muted-foreground"
					transition:fade={{ duration: motionDuration(150) }}>({months})</span
				>
			{/if}
		</h3>
		<span
			class="ml-auto text-xs whitespace-nowrap text-muted-foreground"
			data-testid="stage-progress"
		>
			<span aria-hidden="true">
				{progressText[0]}<AnimatedNumber value={progress.done} />{progressText[1]}
			</span>
			<span class="sr-only">{m.stage_progress({ done: progress.done, total: progress.total })}</span
			>
		</span>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
				aria-label={m.stage_menu()}
				data-testid="stage-menu"
			>
				<EllipsisVerticalIcon aria-hidden="true" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item disabled={position === 0} onSelect={() => moveStage(ws, stage.id, -1)}>
					{m.action_move_up()}
				</DropdownMenu.Item>
				<DropdownMenu.Item
					disabled={position === ws.plan.stages.length - 1}
					onSelect={() => moveStage(ws, stage.id, 1)}
				>
					{m.action_move_down()}
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item variant="destructive" onSelect={() => (confirmDelete = true)}>
					{m.stage_delete()}
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</header>

	<!-- On a phone the table scrolls sideways. From 768 px all columns fit. -->
	<div class="relative overflow-x-auto">
		<table class="w-full min-w-[640px] table-fixed border-collapse text-sm" aria-label={stageName}>
			<colgroup>
				<col class="w-8" />
				<col />
				<col class="w-[26%]" />
				<col class="w-24" />
				<col class="w-36" />
				<col class="w-9" />
			</colgroup>
			<thead>
				<tr
					class="border-b text-left text-xs text-muted-foreground"
					style="border-top: 2px solid {stageColorVar(stage.color)}"
				>
					<th class="py-1.5 pl-1 font-medium"><span class="sr-only">{m.column_done()}</span></th>
					<th class="px-1.5 py-1.5 font-medium">{m.column_task()}</th>
					<th class="px-1.5 py-1.5 font-medium">{m.column_deliverable()}</th>
					<th class="px-1.5 py-1.5 font-medium">{m.column_target()}</th>
					<th class="px-1.5 py-1.5 font-medium">{m.column_owner()}</th>
					<th class="py-1.5"><span class="sr-only">{m.column_more()}</span></th>
				</tr>
			</thead>
			{#each tasks as task (task.id)}
				{@const children = ws.index.children.get(task.id) ?? []}
				{@const expanded = viewer.isExpanded(ws.plan.id, task.id)}
				<tbody
					class="group/task relative"
					animate:flip={{ duration: flipDuration, easing: cubicOut }}
				>
					{#each [task, ...(expanded ? children : [])] as rowTask (rowTask.id)}
						{@const eff = effectiveValues(rowTask, ws.index.children.get(rowTask.id) ?? [])}
						<tr
							data-grid-row
							data-task-id={rowTask.id}
							class={cn(
								'border-b transition-colors',
								rowTask.parentId !== null ? 'border-border/50' : 'border-border',
								eff.done === 'done' && 'text-muted-foreground',
								editing.highlightId === rowTask.id && 'bg-accent/60',
								editing.flashId === rowTask.id && 'row-flash'
							)}
							style:transition-duration="{motionDuration(300)}ms"
							style:animation-duration={editing.flashId === rowTask.id
								? `${motionDuration(FLASH_MS)}ms`
								: undefined}
							onpointerenter={() => (editing.highlightId = rowTask.id)}
							onpointerleave={() =>
								editing.highlightId === rowTask.id && (editing.highlightId = null)}
							onfocusin={() => (editing.highlightId = rowTask.id)}
							animate:flip={{ duration: flipDuration, easing: cubicOut }}
							data-testid="task-row"
						>
							<TaskRow task={rowTask} {ownerSuggestions} onTitleDone={discardIfEmpty} />
						</tr>
					{/each}
					<tr aria-hidden="false" class="h-0">
						<td colspan="6" class="relative h-0 p-0">
							<AddLine
								label={m.subtask_add({ task: task.title || m.task_untitled() })}
								indent={56}
								onAdd={() => newTask(task.id)}
								class="absolute inset-x-0 -top-2.5 z-10 opacity-0 group-focus-within/task:opacity-100 group-hover/task:opacity-100"
								testId="add-subtask"
							/>
						</td>
					</tr>
				</tbody>
			{/each}
			<tbody>
				{#if tasks.length === 0}
					<tr>
						<td colspan="6" class="px-1.5 py-2 text-sm text-muted-foreground">{m.stage_empty()}</td>
					</tr>
				{/if}
				<tr>
					<td colspan="6" class="px-0 pt-3 pb-1">
						<AddLine
							label={m.task_add({ stage: stageName })}
							indent={32}
							onAdd={() => newTask(null)}
							class="opacity-0 group-focus-within/stage:opacity-100 group-hover/stage:opacity-100 [@media(hover:none)]:opacity-100"
							testId="add-task"
						/>
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</section>

<AlertDialog.Root bind:open={confirmDelete}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.stage_delete_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{stageName}. {m.stage_delete_body({
					tasks: impact?.tasks ?? 0,
					dependents: impact?.dependents ?? 0
				})}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.action_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action
				class={buttonVariants({ variant: 'destructive' })}
				onclick={() => {
					confirmDelete = false;
					removeStage(ws, stage.id);
				}}
			>
				{m.action_delete()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
