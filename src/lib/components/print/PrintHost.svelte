<!--
	The print host. It owns the preview and prints the sheets.
	Print (Cmd/Ctrl+P or the Print button) always prints the paginated sheets, never the workspace.
	When the preview is not open, the host renders the sheets on `beforeprint` and removes them on `afterprint`.
	It sets the page size of the print: `@page { size: <paper>; margin: 0 }`.
-->
<script lang="ts">
	import { flushSync } from 'svelte';
	import { getPreview } from '#lib/state/preview.svelte.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import { PAPER } from './print-layout.js';
	import PreviewDialog from './PreviewDialog.svelte';
	import Sheets from './Sheets.svelte';

	const ws = getWorkspace();
	const preview = getPreview();

	// The value comes from a fixed list. It is safe in a style element.
	const pageRule = $derived(
		`<style>@page { size: ${PAPER[ws.plan.paper].css}; margin: 0 }</style>`
	);

	function beforePrint() {
		// An inline field in edit mode holds the new text in a draft. Blur commits it.
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		flushSync();
		if (preview.open) return;
		preview.printing = true;
		// The browser lays out the page right after this event. Render and measure now.
		// The first flush renders the hidden blocks. The next flushes measure and render the sheets.
		flushSync();
		flushSync();
	}

	function afterPrint() {
		preview.printing = false;
	}

	// Some browsers do not send `afterprint`. The end of the print media is the second signal.
	$effect(() => {
		const query = window.matchMedia('print');
		const onChange = (event: MediaQueryListEvent) => {
			if (!event.matches) preview.printing = false;
		};
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	});
</script>

<svelte:window onbeforeprint={beforePrint} onafterprint={afterPrint} />

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html pageRule}
</svelte:head>

<!-- Print hides every other element of the body (src/routes/layout.css). This root stays. -->
<div data-print-host class="contents">
	{#if preview.open}
		<PreviewDialog />
	{:else if preview.printing}
		<Sheets screen={false} />
	{/if}
</div>
