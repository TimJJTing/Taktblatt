<!--
	The remark sections at the end of the plan: two sections for each row.
	Sections can be reordered with the drag handle (also with the keyboard).
	A "+" line after the last section adds a section. Its title starts in edit mode.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { flip } from 'svelte/animate';
	import { dragHandleZone, type DndEvent } from 'svelte-dnd-action';
	import AddLine from '#lib/components/edit/AddLine.svelte';
	import type { RemarkSection as Section } from '#lib/domain/schema.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { addRemarkSection, reorderRemarks } from '#lib/state/commands.ts';
	import { getEditing } from '#lib/state/editing.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import RemarkSection from './RemarkSection.svelte';

	const ws = getWorkspace();
	const editing = getEditing();
	const flipDuration = $derived(motionDuration(250));

	/** A local copy while a drag runs. svelte-dnd-action changes it during the drag. */
	let dragItems = $state<Section[] | null>(null);
	const items = $derived(dragItems ?? ws.plan.remarks);

	function onConsider(event: CustomEvent<DndEvent<Section>>) {
		dragItems = event.detail.items;
	}

	let addLine = $state<HTMLElement | null>(null);

	/** A new section went away: put the focus on the "Add remark section" line. */
	async function focusAddLine() {
		await tick();
		if (document.activeElement && document.activeElement !== document.body) return;
		addLine?.querySelector('button')?.focus();
	}

	function onFinalize(event: CustomEvent<DndEvent<Section>>) {
		const ids = event.detail.items.map((s) => s.id);
		dragItems = null;
		reorderRemarks(ws, ids);
	}
</script>

<div
	class="grid grid-cols-1 gap-4 sm:grid-cols-2"
	use:dragHandleZone={{ items, flipDurationMs: flipDuration, type: 'remark', dropTargetStyle: {} }}
	onconsider={onConsider}
	onfinalize={onFinalize}
>
	{#each items as section (section.id)}
		<div animate:flip={{ duration: flipDuration }}>
			<RemarkSection {section} onDiscarded={focusAddLine} />
		</div>
	{/each}
</div>
<div bind:this={addLine} class="group/gap py-3">
	<AddLine
		label={m.remark_section_add()}
		size="lg"
		onAdd={() => (editing.newRemarkSectionId = addRemarkSection(ws))}
		class="opacity-40 group-focus-within/gap:opacity-100 group-hover/gap:opacity-100 [@media(hover:none)]:opacity-100"
		testId="add-remark-section"
	/>
</div>
