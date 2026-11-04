<!--
	One fragment of a print segment: a block, or some items of a block.
	The paginator measures it off-screen with all items. The sheets show it with the items of one sheet.
	Both use this component, so the heights match.
-->
<script lang="ts">
	import type { Segment } from '#lib/domain/print-model.js';
	import type { Locale } from '#lib/domain/schema.js';
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
		locale: Locale;
		/** The width of the sheet content in pixels. 0 while the paginator measures. */
		width: number;
		/** A key that is unique for the fragment. */
		uid: string;
	}

	let { segment, from, to, first, locale, width, uid }: Props = $props();
</script>

{#if segment.kind === 'header'}
	<PrintHeader {locale} />
{:else if segment.kind === 'gantt'}
	<PrintGantt {segment} {from} {to} {first} {locale} {width} {uid} />
{:else if segment.kind === 'legend'}
	<PrintLegend {segment} {locale} />
{:else if segment.kind === 'cards'}
	<PrintCards {segment} {from} {to} {first} {locale} />
{:else if segment.kind === 'stage'}
	<PrintStage {segment} {from} {to} {first} {locale} />
{:else}
	<PrintRemarks {segment} {from} {to} {first} {locale} />
{/if}
