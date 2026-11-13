<!--
	The print host. It owns the preview and prints the sheets.
	Print (Cmd/Ctrl+P or the Print button of the preview) always prints the paginated sheets, never the workspace.
	The Print button of the preview and Cmd/Ctrl+P render the sheets first (`PreviewState.print`). `beforeprint` is the
	fallback for other ways to print. The host removes the sheets on `afterprint`.
	It sets the page size of the print: `@page { size: <paper>; margin: 0 }`, and a named
	landscape page rule for landscape diagram sheets.
-->
<script lang="ts">
	import { getPreview } from '#lib/state/preview.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { PAPER } from './print-layout.ts';
	import PreviewDialog from './PreviewDialog.svelte';
	import Sheets from './Sheets.svelte';

	const ws = getWorkspace();
	const preview = getPreview();

	// The value comes from a fixed list. It is safe in a style element.
	// A landscape diagram uses the named page rule on the same paper size (ADR 20).
	const pageRule = $derived(
		`<style>@page { size: ${PAPER[ws.plan.paper].css}; margin: 0 } ` +
			`@page taktblatt-landscape { size: ${PAPER[ws.plan.paper].css} landscape; margin: 0 }</style>`
	);

	// Fallback for a print that starts outside the app (browser menu): render in the event.
	function beforePrint() {
		if (!preview.printing) preview.renderSheets();
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
		<!-- A render error must not show the error page. A print without sheets is the worst case. -->
		<svelte:boundary
			onerror={(error) => {
				console.error(error);
				preview.printing = false;
			}}
		>
			<Sheets screen={false} />
		</svelte:boundary>
	{/if}
</div>
