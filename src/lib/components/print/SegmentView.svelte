<!--
	One fragment of a print segment: a block, or some items of a block.
	The paginator measures it off-screen with all items. The sheets show it with the items of one sheet.
	Both use this component, so the heights match.
	A scene segment delegates to the paper adapter of its registered view.
-->
<script lang="ts">
	import type { GanttPaperLayout } from '#lib/scene/gantt-fragment.ts';
	import type { Segment } from '#lib/domain/print-model.ts';
	import { getViewRegistry } from '#lib/components/diagram/view-registry.ts';
	import PrintCards from './PrintCards.svelte';
	import PrintGantt from './PrintGantt.svelte';
	import PrintHeader from './PrintHeader.svelte';
	import PrintLegend from './PrintLegend.svelte';
	import PrintRemarks from './PrintRemarks.svelte';
	import PrintStage from './PrintStage.svelte';

	interface Props {
		segment: Segment;
		from: number;
		to: number;
		first: boolean;
		/** The width of the sheet content in pixels. 0 while the paginator measures. */
		width: number;
		paper?: GanttPaperLayout;
	}

	let { segment, from, to, first, width, paper }: Props = $props();

	const registry = getViewRegistry();
	// A generic scene segment renders with the paper adapter of its view (ADR 20).
	const Paper = $derived(
		segment.kind === 'scene' ? registry.get(segment.diagram)?.paper.component : undefined
	);
	// A scene without a paper renderer prints nothing. Tell the developer of the view.
	$effect(() => {
		if (import.meta.env.DEV && segment.kind === 'scene' && !Paper) {
			console.error(
				`Diagram view "${segment.diagram}" printed scene "${segment.id}" without a paper renderer`
			);
		}
	});
</script>

{#if segment.kind === 'header'}
	<PrintHeader />
{:else if segment.kind === 'gantt'}
	<PrintGantt {segment} {from} {to} {first} {width} {paper} />
{:else if segment.kind === 'legend'}
	<PrintLegend {segment} />
{:else if segment.kind === 'cards'}
	<PrintCards {segment} {from} {to} {first} />
{:else if segment.kind === 'stage'}
	<PrintStage {segment} {from} {to} {first} />
{:else if segment.kind === 'remarks'}
	<PrintRemarks {segment} {from} {to} {first} />
{:else if Paper}
	<Paper {segment} {from} {to} {first} {width} />
{/if}
