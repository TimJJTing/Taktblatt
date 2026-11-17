<!--
	Moves a timeline item to its new x position with a tween when the plan range changes.
	It uses the same duration and easing as the marks in GanttRow.
	`x0` is the start and `x1` the end, as fractions of the timeline width. Omit `x1` for a point.
	The child snippet gets the current values.
-->
<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';

	interface Props {
		x0: number;
		x1?: number;
		child: Snippet<[{ x0: number; x1: number }]>;
	}

	let { x0, x1, child }: Props = $props();

	const x = new GeometryTween(untrack(() => ({ x0, x1: x1 ?? x0 })));
	$effect(() => {
		x.set({ x0, x1: x1 ?? x0 });
	});
</script>

{@render child(x.current)}
