<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import DiagramStage from '#lib/components/diagram/DiagramStage.svelte';
	import DiagramViewSwitch from '#lib/components/diagram/DiagramViewSwitch.svelte';
	import { createViewRegistry, setViewRegistry } from '#lib/components/diagram/view-registry.ts';
	import { view as ganttView } from '#lib/components/timeline/diagram-view.ts';
	import * as Tooltip from '#lib/components/ui/tooltip/index.ts';
	import TaskDialog from '#lib/components/task/TaskDialog.svelte';
	import { setWorkspace, type Workspace } from '#lib/state/workspace.svelte.ts';
	import { setViewer, type ViewerState } from '#lib/state/viewer.svelte.ts';
	import { setEditing, type EditingState } from '#lib/state/editing.svelte.ts';
	import { view as routeMapView } from './diagram-view.ts';

	let {
		workspace,
		viewer,
		editing
	}: {
		workspace: Workspace;
		viewer: ViewerState;
		editing: EditingState;
	} = $props();
	setWorkspace(untrack(() => workspace));
	setViewer(untrack(() => viewer));
	setEditing(untrack(() => editing));
	setViewRegistry(createViewRegistry([ganttView, routeMapView]));
	onMount(() => editing.routeFocus.attach(workspace));
</script>

<Tooltip.Provider>
	<div class="flex flex-col" style="width:1000px;height:600px">
		<DiagramViewSwitch controls="route-map-stage" />
		<DiagramStage
			id="route-map-stage"
			todayDate="2027-01-10"
			onBand={() => {}}
			onMilestone={() => {}}
			onReveal={() => {}}
		/>
	</div>
	<TaskDialog />
</Tooltip.Provider>
