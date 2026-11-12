<script lang="ts">
	import { untrack } from 'svelte';
	import * as Tooltip from '#lib/components/ui/tooltip/index.ts';
	import { setWorkspace, type Workspace } from '#lib/state/workspace.svelte.ts';
	import { setViewer, ViewerState } from '#lib/state/viewer.svelte.ts';
	import { setEditing, EditingState } from '#lib/state/editing.svelte.ts';
	import { MemoryStorage } from '#lib/state/memory-storage.ts';
	import Gantt from '#lib/components/timeline/Gantt.svelte';
	import StageSection from './StageSection.svelte';

	let {
		workspace,
		editing = new EditingState(),
		viewer: suppliedViewer,
		withGantt = false
	}: {
		workspace: Workspace;
		editing?: EditingState;
		viewer?: ViewerState;
		withGantt?: boolean;
	} = $props();
	setWorkspace(untrack(() => workspace));
	setViewer(untrack(() => suppliedViewer ?? new ViewerState(new MemoryStorage())));
	setEditing(untrack(() => editing));
</script>

<Tooltip.Provider>
	{#if withGantt}<div style="width:1000px">
			<Gantt todayDate="2027-01-10" onBand={() => {}} onMilestone={() => {}} onReveal={() => {}} />
		</div>{/if}
	<button data-testid="outside-row">Outside row</button>
	<StageSection stage={workspace.plan.stages[0]} number={1} ownerSuggestions={[]} />
</Tooltip.Provider>
