<!--
	One stage in the work plan: header, table of tasks and subtasks, and the "+" lines.
	Tasks sort by start date. The reorder is animated (FLIP).
-->
<script lang="ts">
	import { overlayScrollbar } from '#lib/components/app/overlay-scrollbar.ts';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { fade } from 'svelte/transition';
	import { dragHandle } from 'svelte-dnd-action';
	import AddLine from '#lib/components/edit/AddLine.svelte';
	import AnimatedNumber from '#lib/components/edit/AnimatedNumber.svelte';
	import DeleteConfirm from '#lib/components/app/DeleteConfirm.svelte';
	import { buttonVariants } from '#lib/components/ui/button/index.ts';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.ts';
	import { stageDeleteImpact } from '#lib/domain/dependencies.ts';
	import { stageProgress, stageSpan } from '#lib/domain/derive.ts';
	import { formatMonthSpan } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import { type Stage, type Task } from '#lib/domain/schema.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import {
		addTask,
		moveStage,
		removeStage,
		discardNewTask,
		updateStage
	} from '#lib/state/commands.ts';
	import { FLASH_MS, getEditing } from '#lib/state/editing.svelte.ts';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { cn } from '#lib/utils.ts';
	import StageColorPicker from './StageColorPicker.svelte';
	import StageTitle from './StageTitle.svelte';
	import TaskRow from './TaskRow.svelte';
	import { stageColorVar } from './colors.ts';

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
	// Keep both animated counts in the message's word order.
	const progressLabel = $derived(
		progress.inProgress > 0 ? m.stage_progress_in_progress(progress) : m.stage_progress(progress)
	);
	const progressText = $derived(
		(progress.inProgress > 0
			? m.stage_progress_in_progress({
					done: '{done}',
					inProgress: '{inProgress}',
					total: progress.total
				})
			: m.stage_progress({ done: '{done}', total: progress.total })
		).split(/(\{done\}|\{inProgress\})/)
	);
	const span = $derived(stageSpan(ws.index, stage.id));
	const months = $derived(span ? formatMonthSpan(span.start, span.end, uiIntl()) : '');
	const position = $derived(ws.plan.stages.findIndex((s) => s.id === stage.id));
	const otherColors = $derived(ws.plan.stages.filter((s) => s.id !== stage.id).map((s) => s.color));
	// The sentinel {stageName} is a placeholder qualifier.
	// Split here to put StageTitle before or after the label, as the translation requires.
	const stageLabelParts = $derived(
		m
			.label_qualifier({ name: m.stage_label({ n: number }), qualifier: '{stageName}' })
			.split('{stageName}')
	);
	const stageName = $derived(stage.title || m.stage_title_placeholder({ n: number }));
	const flipDuration = $derived(motionDuration(280));
	let headerHeight = $state(0);
	let columnHeaderHeight = $state(0);

	// The band (top) and the bottom line are inset shadows, because a border does not stick with its cell.
	// From 640 px up, the table does not scroll, so the cells stick below the stage header.
	// Below that, the wrapper scrolls sideways and a cell cannot stick. A separate band sticks instead.
	// In forced-colors mode shadows are removed, so borders take over.
	const headCell =
		'z-20 bg-background pt-2 pb-[7px] font-medium shadow-[inset_0_-1px_0_var(--border)] @min-[640px]:sticky @min-[640px]:top-[calc(var(--gantt-pinned-h,0px)-var(--pane-padding,0px)+var(--stage-header-h))] @min-[640px]:shadow-[inset_0_2px_0_var(--stage-band),inset_0_-1px_0_var(--border)] forced-colors:border-t-2 forced-colors:border-b';

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
	class="group/stage @container"
	aria-labelledby="stage-{stage.id}-title"
	data-testid="stage"
	data-motion={motionDuration(1) > 0}
	data-stage-id={stage.id}
	style:--stage-header-h="{headerHeight}px"
	style:--stage-columns-h="{columnHeaderHeight}px"
>
	<header
		bind:offsetHeight={headerHeight}
		class="sticky top-[calc(var(--gantt-pinned-h,0px)-var(--pane-padding,0px))] z-25 flex flex-wrap items-center gap-x-2 gap-y-1 bg-background pb-2"
	>
		<!-- Not a <button>: svelte-dnd-action ignores keyboard drag on elements with a "disabled" property. -->
		<div
			use:dragHandle
			role="button"
			tabindex="0"
			class="-ml-6 flex size-5 cursor-grab items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-focus-within/stage:opacity-100 group-hover/stage:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing [@media(hover:none)]:opacity-100"
			style:transition-duration={`${motionDuration(150)}ms`}
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
			<span class="flex min-w-0 items-baseline">
				<span class="shrink-0 whitespace-pre">{stageLabelParts[0]}</span>
				<span class="min-w-0"><StageTitle {stage} {number} /></span>
				{#if stageLabelParts[1]}<span class="shrink-0 whitespace-pre">{stageLabelParts[1]}</span
					>{/if}
			</span>
			{#if months}
				<span
					class="shrink-0 font-normal text-muted-foreground"
					transition:fade={{ duration: motionDuration(150) }}
					>{m.parenthetical({ text: months })}</span
				>
			{/if}
		</h3>
		<span
			class="ml-auto text-xs whitespace-nowrap text-muted-foreground"
			data-testid="stage-progress"
		>
			<span aria-hidden="true">
				{#each progressText as part, i (i)}
					{#if part === '{done}'}<AnimatedNumber value={progress.done} />
					{:else if part === '{inProgress}'}<AnimatedNumber value={progress.inProgress} />
					{:else}{part}{/if}
				{/each}
			</span>
			<span class="sr-only">{progressLabel}</span>
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

	<!-- Below 640 px only: the band sticks here, because the header cells cannot stick in the scrolling wrapper. -->
	<div
		aria-hidden="true"
		data-testid="stage-band"
		class="sticky top-[calc(var(--gantt-pinned-h,0px)-var(--pane-padding,0px)+var(--stage-header-h))] z-20 h-0.5 @min-[640px]:hidden"
		style="background: {stageColorVar(stage.color)}"
	></div>
	<!-- The table is at least 640 px wide (min-w-[640px]). A narrower wrapper scrolls the table sideways.
		Keep the 640 px of the wrapper, the table and the header cells (@min-[640px]) the same.
		The section is the container for the pinned "+" buttons. A wider wrapper does not scroll,
		so the header cells can stick below the stage header.
		The wrapper scrolls only sideways. The bottom padding holds the "+" line, and the negative
		margin keeps the layout. A vertical wheel or swipe on the table scrolls the group. -->
	<div
		use:overlayScrollbar={{ axis: 'x' }}
		class="relative @max-[640px]:-mb-2.5 @max-[640px]:overflow-x-auto @max-[640px]:overflow-y-hidden @max-[640px]:pb-2.5"
	>
		<table
			class="w-full min-w-[640px] table-fixed border-collapse text-sm [--stage-sticky-columns-h:2px] @min-[640px]:[--stage-sticky-columns-h:var(--stage-columns-h)]"
			aria-label={stageName}
		>
			<colgroup>
				<col class="w-8" />
				<col />
				<col class="w-[26%]" />
				<col class="w-24" />
				<col class="w-36" />
				<col class="w-9" />
			</colgroup>
			<thead bind:offsetHeight={columnHeaderHeight}>
				<tr
					class="text-left text-xs text-muted-foreground"
					style="--stage-band: {stageColorVar(stage.color)}"
				>
					<th class={cn(headCell, 'pl-1')}><span class="sr-only">{m.column_status()}</span></th>
					<th class={cn(headCell, 'px-1.5')}>{m.column_task()}</th>
					<th class={cn(headCell, 'px-1.5')}>{m.column_deliverable()}</th>
					<th class={cn(headCell, 'px-1.5')}>{m.column_target()}</th>
					<th class={cn(headCell, 'px-1.5')}>{m.column_owner()}</th>
					<th class={headCell}><span class="sr-only">{m.column_more()}</span></th>
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
						{@const taskState = ws.index.state.get(rowTask.id)!}
						<tr
							data-grid-row
							data-task-id={rowTask.id}
							class={cn(
								'border-b transition-colors',
								rowTask.parentId !== null ? 'border-border/50' : 'border-border',
								taskState.finished && 'text-muted-foreground',
								editing.highlightId === rowTask.id && 'bg-accent/60',
								editing.flashId === rowTask.id && 'row-flash'
							)}
							style:transition-duration={`${motionDuration(300)}ms`}
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
								pinned
								size="sm"
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
			</tbody>
		</table>
	</div>
	<!-- Outside the table, so the "+" is at the center of the visible width. Both "+" buttons share one axis.
		Directly under the table, so the line belongs to this stage and not to the gap to the next stage.
		The top padding clears the strip of the last "add subtask" line. -->
	<div class="pt-2.5 pb-1">
		<AddLine
			label={m.task_add({ stage: stageName })}
			indent={32}
			onAdd={() => newTask(null)}
			class="opacity-0 group-focus-within/stage:opacity-100 group-hover/stage:opacity-100 [@media(hover:none)]:opacity-100"
			testId="add-task"
		/>
	</div>
</section>

<DeleteConfirm
	bind:open={confirmDelete}
	title={m.stage_delete_title()}
	body={m.stage_delete_body({
		name: stageName,
		tasks: impact?.tasks ?? 0,
		dependents: impact?.dependents ?? 0
	})}
	onConfirm={() => {
		confirmDelete = false;
		removeStage(ws, stage.id);
	}}
/>

<style>
	/* Sticky offsets follow Timeline motion. The global 0.01 ms fallback must not delay them. */
	section[data-motion='false'] > header,
	section[data-motion='false'] thead th,
	section[data-motion='false'] > [data-testid='stage-band'] {
		transition: none;
	}

	/* The scroller padding clears the pinned Timeline section. */
	table :global(:is(button, input, textarea, [tabindex])) {
		scroll-margin-top: calc(var(--stage-header-h) + var(--stage-sticky-columns-h));
	}
</style>
