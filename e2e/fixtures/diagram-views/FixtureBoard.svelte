<script lang="ts">
	import type { DiagramViewProps } from '#lib/components/diagram/view-contract.ts';
	import FixtureView from './FixtureView.svelte';

	let props: DiagramViewProps = $props();
</script>

<FixtureView {...props} layout="board" />
