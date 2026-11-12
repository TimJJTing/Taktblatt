<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import * as Tooltip from '#lib/components/ui/tooltip/index.ts';
	import { setWorkspace, type Workspace } from '#lib/state/workspace.svelte.ts';
	import { setViewer, ViewerState } from '#lib/state/viewer.svelte.ts';
	import { setEditing, EditingState } from '#lib/state/editing.svelte.ts';
	import { MemoryStorage } from '#lib/state/memory-storage.ts';
	import Gantt from './Gantt.svelte';

	let {
		workspace,
		editing = new EditingState(),
		viewer: suppliedViewer
	}: {
		workspace: Workspace;
		editing?: EditingState;
		viewer?: ViewerState;
	} = $props();
	setWorkspace(untrack(() => workspace));
	const viewer = untrack(() => suppliedViewer ?? new ViewerState(new MemoryStorage()));
	untrack(() => {
		if (!suppliedViewer) viewer.toggleExpanded(workspace.plan.id, 'parent');
	});
	setViewer(viewer);
	setEditing(untrack(() => editing));
	onMount(() => editing.routeFocus.attach(workspace));
</script>

<Tooltip.Provider>
	<div style="width: 1000px">
		<Gantt todayDate="2027-01-10" onBand={() => {}} onMilestone={() => {}} onReveal={() => {}} />
	</div>
</Tooltip.Provider>
