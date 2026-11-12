<script lang="ts">
	import { untrack } from 'svelte';
	import * as Tooltip from '#lib/components/ui/tooltip/index.ts';
	import { setWorkspace, type Workspace } from '#lib/state/workspace.svelte.ts';
	import { setViewer, ViewerState } from '#lib/state/viewer.svelte.ts';
	import { setEditing, EditingState } from '#lib/state/editing.svelte.ts';
	import { MemoryStorage } from '#lib/state/memory-storage.ts';
	import Gantt from './Gantt.svelte';

	let { workspace }: { workspace: Workspace } = $props();
	setWorkspace(untrack(() => workspace));
	const viewer = new ViewerState(new MemoryStorage());
	untrack(() => viewer.toggleExpanded(workspace.plan.id, 'parent'));
	setViewer(viewer);
	setEditing(new EditingState());
</script>

<Tooltip.Provider>
	<div style="width: 1000px">
		<Gantt todayDate="2027-01-10" onBand={() => {}} onMilestone={() => {}} onReveal={() => {}} />
	</div>
</Tooltip.Provider>
