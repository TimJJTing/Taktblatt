<script lang="ts">
	import { untrack } from 'svelte';
	import * as Tooltip from '#lib/components/ui/tooltip/index.ts';
	import { setWorkspace, type Workspace } from '#lib/state/workspace.svelte.ts';
	import { setViewer, ViewerState } from '#lib/state/viewer.svelte.ts';
	import { setEditing, EditingState } from '#lib/state/editing.svelte.ts';
	import { MemoryStorage } from '#lib/state/memory-storage.ts';
	import StageSection from './StageSection.svelte';

	let { workspace }: { workspace: Workspace } = $props();
	setWorkspace(untrack(() => workspace));
	setViewer(new ViewerState(new MemoryStorage()));
	setEditing(new EditingState());
</script>

<Tooltip.Provider>
	<StageSection stage={workspace.plan.stages[0]} number={1} ownerSuggestions={[]} />
</Tooltip.Provider>
