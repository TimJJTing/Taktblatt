<!--
	One dependency line: a thin elbow path from the end of the predecessor to the start of the dependent.
	The end points move with a tween when rows come in or go out. The line fades in and out.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { fade } from 'svelte/transition';
	import type { DependencyLine } from '#lib/domain/gantt.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { elbowPath, rowCenterY, ROW_MOTION_MS } from './gantt-layout.ts';

	interface Props {
		line: DependencyLine;
		/** Whether the visible predecessor row is done or canceled. */
		muted: boolean;
		/** The width of the timeline area in pixels. */
		width: number;
		/** The id of the arrow marker. */
		marker: string;
	}

	let { line, muted, width, marker }: Props = $props();

	const ends = (l: DependencyLine) => ({
		x0: l.x0,
		y0: rowCenterY(l.row0),
		x1: l.x1,
		y1: rowCenterY(l.row1)
	});

	const pos = new Tween(untrack(() => ends(line)));
	$effect(() => {
		pos.set(ends(line), { duration: motionDuration(ROW_MOTION_MS), easing: cubicOut });
	});

	const d = $derived(
		elbowPath(pos.current.x0 * width, pos.current.y0, pos.current.x1 * width, pos.current.y1)
	);
</script>

<path
	{d}
	class={line.cycle ? 'text-destructive' : muted ? 'opacity-40' : undefined}
	data-cycle={line.cycle ? 'true' : undefined}
	fill="none"
	stroke="currentColor"
	stroke-width="1.25"
	marker-end="url(#{marker})"
	data-testid="gantt-dependency"
	data-from={line.fromId}
	data-to={line.toId}
	transition:fade={{ duration: motionDuration(180) }}
/>
