<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import * as Tooltip from '#lib/components/ui/tooltip/index.ts';
	import TaskDialog from '#lib/components/task/TaskDialog.svelte';
	import { setWorkspace, type Workspace } from '#lib/state/workspace.svelte.ts';
	import { setViewer, type ViewerState } from '#lib/state/viewer.svelte.ts';
	import { setEditing, type EditingState } from '#lib/state/editing.svelte.ts';
	import RouteMap from './RouteMap.svelte';

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
	onMount(() => editing.routeFocus.attach(workspace));
</script>

<Tooltip.Provider>
	<div style="width:1000px;height:600px">
		<div role="radiogroup" aria-label="Diagram view">
			<button role="radio" aria-checked="true" data-testid="diagram-view-route-map"
				>Route map</button
			>
		</div>
		<RouteMap todayDate="2027-01-10" onBand={() => {}} onMilestone={() => {}} onReveal={() => {}} />
	</div>
	<TaskDialog />
</Tooltip.Provider>
