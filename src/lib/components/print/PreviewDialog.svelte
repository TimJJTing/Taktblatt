<!--
	The preview: a read-only, full-screen view of the sheets. It has a paper size control and a Print button.
	It is a modal dialog. Esc closes it. The focus goes back to the Preview button.
	The preview has no motion. In print, only the sheets show.

	This dialog is hand-made, not a bits-ui dialog. A bits-ui dialog is a portal with a focus trap.
	Print hides portals, and the sheets must stay in the normal flow of the page to print.
	The workspace behind the dialog is inert (src/routes/+page.svelte).
-->
<script lang="ts">
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import XIcon from '@lucide/svelte/icons/x';
	import { onMount } from 'svelte';
	import { isComposing } from '#lib/browser/keyboard.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { PAPER_SIZES, type PaperSize } from '#lib/domain/schema.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { updatePlan } from '#lib/state/commands.ts';
	import { getPreview } from '#lib/state/preview.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { cn } from '#lib/utils.ts';
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
		if (event.key !== 'Escape' || event.defaultPrevented || isComposing(event)) return;
		event.preventDefault();
		preview.hide();
	}

	let group = $state<HTMLDivElement | null>(null);

	/** Arrow keys, Home and End select and focus a paper size, like the stage color picker. */
	function onPaperKeydown(event: KeyboardEvent, size: PaperSize) {
		if (isComposing(event)) return;
		const index = PAPER_SIZES.indexOf(size);
		const last = PAPER_SIZES.length - 1;
		let next: number;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				next = index === last ? 0 : index + 1;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				next = index === 0 ? last : index - 1;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = last;
				break;
			default:
				return;
		}
		event.preventDefault();
		updatePlan(ws, { paper: PAPER_SIZES[next] });
		group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
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
	class="fixed inset-0 z-50 flex flex-col bg-muted text-foreground outline-none print:static print:block print:bg-paper"
	data-testid="preview"
>
	<div class="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-2 print:hidden">
		<h2 class="text-sm font-semibold">{m.preview_title()}</h2>
		<p id="preview-hint" class="sr-only">{m.preview_hint()}</p>
		<div
			bind:this={group}
			role="radiogroup"
			aria-label={m.preview_paper()}
			class="ml-auto flex items-center gap-1 rounded-md border p-0.5"
		>
			{#each PAPER_SIZES as size (size)}
				<button
					type="button"
					role="radio"
					aria-checked={ws.plan.paper === size}
					tabindex={ws.plan.paper === size ? 0 : -1}
					class={cn(
						'rounded px-2.5 py-1 text-xs focus-visible:outline-2 focus-visible:outline-ring',
						ws.plan.paper === size
							? 'bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:bg-accent hover:text-foreground'
					)}
					onclick={() => updatePlan(ws, { paper: size })}
					onkeydown={(event) => onPaperKeydown(event, size)}
					data-testid="paper-{size}"
				>
					{LABELS[size]()}
				</button>
			{/each}
		</div>
		<Button size="sm" onclick={() => preview.print()} data-testid="preview-print">
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
