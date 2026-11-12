<script lang="ts">
	import { untrack } from 'svelte';
	import { setWorkspace, type Workspace } from '#lib/state/workspace.svelte.ts';
	import { setViewer, type ViewerState } from '#lib/state/viewer.svelte.ts';
	import Sheets from './Sheets.svelte';

	let { workspace, viewer }: { workspace: Workspace; viewer: ViewerState } = $props();
	setWorkspace(untrack(() => workspace));
	setViewer(untrack(() => viewer));
</script>

<Sheets screen />
