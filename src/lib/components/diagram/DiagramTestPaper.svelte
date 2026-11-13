<!--
	A test-only paper renderer for scene segments (ADR 20). The first fragment has a title.
	Each fragment repeats a header. Each item is one task row.
-->
<script lang="ts">
	import type { Task } from '#lib/domain/schema.ts';
	import type { DiagramPaperProps } from './view-contract.ts';

	let { segment, from, to, first }: DiagramPaperProps = $props();
	const items = $derived(segment.items as Task[]);
</script>

<div data-testid="test-paper" data-diagram={segment.diagram}>
	{#if first}
		<h2 data-part="lead" class="text-xs font-semibold">{segment.diagram}</h2>
	{/if}
	<p data-part="repeat" class="border-b text-[9px]">{segment.diagram}</p>
	{#each items.slice(from, to) as task, i (task.id)}
		<p data-item={from + i} class="py-2">{task.title}</p>
	{/each}
</div>
