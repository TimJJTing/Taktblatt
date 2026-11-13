<!--
	A test-only paper renderer for scene segments. The first fragment has a title (lead).
	Each fragment repeats its column header. Each item is one task row.
-->
<script lang="ts">
	import type { DiagramPaperProps } from '#lib/components/diagram/view-contract.ts';
	import type { FixtureTask } from './tasks.ts';

	let { segment, from, to, first }: DiagramPaperProps = $props();
	const data = $derived(segment.data as { title: string });
	const items = $derived(segment.items as FixtureTask[]);
</script>

<div
	data-testid="sheet-fixture"
	data-diagram={segment.diagram}
	data-orientation={segment.orientation}
>
	{#if first}
		<h2 data-part="lead" class="pb-1 text-xs font-semibold">{data.title}</h2>
	{/if}
	<p data-part="repeat" class="border-b text-[9px] uppercase" data-testid="sheet-fixture-repeat">
		{data.title}
	</p>
	{#each items.slice(from, to) as task, i (task.id)}
		<p data-item={from + i} class="py-2" data-testid="sheet-fixture-item">{task.title}</p>
	{/each}
</div>
