<!--
	The preview: a read-only, full-screen view of the sheets. It has a paper size control and a Print button.
	It is a modal dialog. Esc closes it. The focus goes back to the Preview button.
	The preview has no motion. In print, only the sheets show.
-->
<script lang="ts">
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import XIcon from '@lucide/svelte/icons/x';
	import { onMount } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { PAPER_SIZES, type PaperSize } from '#lib/domain/schema.js';
	import { m } from '#lib/paraglide/messages.js';
	import { setPaper } from '#lib/state/commands.js';
	import { getPreview } from '#lib/state/preview.svelte.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import { cn } from '#lib/utils.js';
	import Sheets from './Sheets.svelte';

	const ws = getWorkspace();
	const preview = getPreview();

	const LABELS: Record<PaperSize, () => string> = {
		a4: m.paper_a4,
		letter: m.paper_letter
	};

	let dialog = $state<HTMLElement | null>(null);

	onMount(() => dialog?.focus());

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
		event.preventDefault();
		preview.hide();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div
	bind:this={dialog}
	role="dialog"
	aria-modal="true"
	aria-label={m.preview_title()}
	aria-describedby="preview-hint"
	tabindex="-1"
	class="fixed inset-0 z-50 flex flex-col bg-neutral-200 text-neutral-900 outline-none print:static print:block print:bg-white"
	data-testid="preview"
>
	<div
		class="flex flex-wrap items-center gap-3 border-b border-neutral-300 bg-white px-4 py-2 print:hidden"
	>
		<h2 class="text-sm font-semibold">{m.preview_title()}</h2>
		<p id="preview-hint" class="sr-only">{m.preview_hint()}</p>
		<div
			role="radiogroup"
			aria-label={m.preview_paper()}
			class="ml-auto flex items-center gap-1 rounded-md border border-neutral-300 p-0.5"
		>
			{#each PAPER_SIZES as size (size)}
				<button
					type="button"
					role="radio"
					aria-checked={ws.plan.paper === size}
					class={cn(
						'rounded px-2.5 py-1 text-xs focus-visible:outline-2 focus-visible:outline-neutral-500',
						ws.plan.paper === size
							? 'bg-neutral-900 text-white'
							: 'text-neutral-700 hover:bg-neutral-100'
					)}
					onclick={() => setPaper(ws, size)}
					data-testid="paper-{size}"
				>
					{LABELS[size]()}
				</button>
			{/each}
		</div>
		<Button size="sm" onclick={() => window.print()} data-testid="preview-print">
			<PrinterIcon aria-hidden="true" />{m.action_print()}
		</Button>
		<Button size="sm" variant="outline" onclick={() => preview.hide()} data-testid="preview-close">
			<XIcon aria-hidden="true" />{m.preview_close()}
		</Button>
	</div>
	<div class="min-h-0 flex-1 overflow-auto print:overflow-visible">
		<div
			class="mx-auto flex w-max min-w-full justify-center p-6 print:block print:w-auto print:p-0"
		>
			<Sheets screen={true} />
		</div>
	</div>
</div>
