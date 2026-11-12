<script lang="ts">
	import type { DependencyLine } from '#lib/domain/gantt.ts';
	import type { EdgeGeom } from '#lib/scene/types.ts';
	import GanttLine from './GanttLine.svelte';

	let {
		line,
		width = 600,
		muted = false,
		strokeWidth = 2
	}: {
		line: DependencyLine & EdgeGeom;
		width?: number;
		muted?: boolean;
		strokeWidth?: number;
	} = $props();
	// The legacy marker prop only keeps the fixture compatible before 3c lands.
	const lineProps = $derived({ line, width, muted, strokeWidth, marker: 'obsolete-arrow' });
</script>

<svg aria-hidden="true" {width} height="300">
	<GanttLine {...lineProps} />
</svg>
