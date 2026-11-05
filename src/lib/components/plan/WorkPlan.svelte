<!--
	The work plan: all stages, with "+" lines to add a stage between stages and after the last stage.
	Stages can be reordered with the drag handle (also with the keyboard).
-->
<script lang="ts">
	import { flip } from 'svelte/animate';
	import { dragHandleZone, type DndEvent } from 'svelte-dnd-action';
	import AddLine from '#lib/components/edit/AddLine.svelte';
	import { uiIntl } from '#lib/domain/locale.js';
	import { allOwners } from '#lib/domain/owners.js';
	import type { Stage } from '#lib/domain/schema.js';
	import { motionDuration } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';
	import { addStage, reorderStages } from '#lib/state/commands.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import StageSection from './StageSection.svelte';

	const ws = getWorkspace();
	const flipDuration = $derived(motionDuration(250));
	const ownerSuggestions = $derived(
		allOwners(
			ws.plan.tasks.map((t) => t.owners),
			uiIntl()
		)
	);

	/** A local copy while a drag runs. svelte-dnd-action changes it during the drag. */
	let dragItems = $state<Stage[] | null>(null);
	const items = $derived(dragItems ?? ws.plan.stages);

	function onConsider(event: CustomEvent<DndEvent<Stage>>) {
		dragItems = event.detail.items;
	}

	function onFinalize(event: CustomEvent<DndEvent<Stage>>) {
		const ids = event.detail.items.map((s) => s.id);
		dragItems = null;
		reorderStages(ws, ids);
	}
</script>

<div
	class="flex flex-col"
	use:dragHandleZone={{ items, flipDurationMs: flipDuration, type: 'stage', dropTargetStyle: {} }}
	onconsider={onConsider}
	onfinalize={onFinalize}
>
	{#each items as stage, i (stage.id)}
		<div animate:flip={{ duration: flipDuration }} class="flex flex-col">
			<div class="group/gap pt-4 pb-1">
				<AddLine
					label={m.stage_add()}
					size="lg"
					onAdd={() => addStage(ws, i)}
					class="opacity-0 group-focus-within/gap:opacity-100 group-hover/gap:opacity-100"
					testId="add-stage-before"
				/>
			</div>
			<StageSection {stage} number={i + 1} {ownerSuggestions} />
		</div>
	{/each}
</div>
<div class="group/gap py-3">
	<AddLine
		label={m.stage_add()}
		size="lg"
		onAdd={() => addStage(ws, ws.plan.stages.length)}
		class="opacity-40 group-focus-within/gap:opacity-100 group-hover/gap:opacity-100 [@media(hover:none)]:opacity-100"
		testId="add-stage"
	/>
</div>
