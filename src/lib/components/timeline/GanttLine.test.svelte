<script lang="ts">
	import type { EdgeGeom } from '#lib/scene/types.ts';
	import GanttLine from './GanttLine.svelte';

	let {
		line,
		width = 600,
		muted = false,
		strokeWidth = 2
	}: {
		line: EdgeGeom;
		width?: number;
		muted?: boolean;
		strokeWidth?: number;
	} = $props();
	const lineProps = $derived({ line, width, muted, strokeWidth });
</script>

<svg aria-hidden="true" {width} height="300">
	<GanttLine {...lineProps} />
</svg>
