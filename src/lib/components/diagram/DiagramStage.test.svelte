<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import * as Tooltip from '#lib/components/ui/tooltip/index.ts';
	import { setEditing, EditingState } from '#lib/state/editing.svelte.ts';
	import { setViewer, type ViewerState } from '#lib/state/viewer.svelte.ts';
	import { setWorkspace, type Workspace } from '#lib/state/workspace.svelte.ts';
	import DiagramStage from './DiagramStage.svelte';
	import DiagramViewSwitch from './DiagramViewSwitch.svelte';
	import { setViewRegistry, type ViewRegistry } from './view-registry.ts';

	let {
		workspace,
		viewer,
		registry,
		editing = new EditingState()
	}: {
		workspace: Workspace;
		viewer: ViewerState;
		registry: ViewRegistry;
		editing?: EditingState;
	} = $props();
	setWorkspace(untrack(() => workspace));
	setViewer(untrack(() => viewer));
	setEditing(untrack(() => editing));
	setViewRegistry(untrack(() => registry));
	onMount(() => editing.routeFocus.attach(workspace));
</script>

<Tooltip.Provider>
	<div style="width: 1000px">
		<button type="button" data-testid="outside">Outside</button>
		<DiagramViewSwitch controls="stage-under-test" />
		<DiagramStage
			id="stage-under-test"
			todayDate="2027-01-10"
			onBand={() => {}}
			onMilestone={() => {}}
			onReveal={() => {}}
		/>
	</div>
</Tooltip.Provider>
