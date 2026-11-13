<script lang="ts">
	import { untrack } from 'svelte';
	import { setViewRegistry, type ViewRegistry } from '#lib/components/diagram/view-registry.ts';
	import { PreviewState, setPreview } from '#lib/state/preview.svelte.ts';
	import { setViewer, type ViewerState } from '#lib/state/viewer.svelte.ts';
	import { setWorkspace, type Workspace } from '#lib/state/workspace.svelte.ts';
	import PreviewDialog from './PreviewDialog.svelte';

	let {
		workspace,
		viewer,
		registry
	}: { workspace: Workspace; viewer: ViewerState; registry: ViewRegistry } = $props();
	setWorkspace(untrack(() => workspace));
	setViewer(untrack(() => viewer));
	setViewRegistry(untrack(() => registry));
	setPreview(new PreviewState());
</script>

<PreviewDialog />
