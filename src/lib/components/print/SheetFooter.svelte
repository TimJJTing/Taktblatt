<!--
	The footer of a sheet: note, version and date on the left. A note and the page number on the right.
	Empty parts do not show. The page number "n / N" comes from the paginator.
-->
<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { formatDate } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import type { Plan } from '#lib/domain/schema.ts';

	interface Props {
		footer: Plan['footer'];
		number: number;
		total: number;
	}

	let { footer, number, total }: Props = $props();

	const left = $derived(
		[footer.note, footer.version, footer.date ? formatDate(footer.date, uiIntl()) : '']
			.filter((part) => part !== '')
			.join(m.footer_separator())
	);
</script>

<div
	class="flex items-baseline justify-between gap-4 border-t border-paper-rule pt-1.5 text-[9px] text-paper-ink-3"
	data-testid="sheet-footer"
>
	<span class="min-w-0 break-words" data-testid="sheet-footer-left">{left}</span>
	<span class="flex shrink-0 items-baseline gap-2">
		{#if footer.right}<span data-testid="sheet-footer-right">{footer.right}</span>{/if}
		<span class="tabular-nums" data-testid="page-number">{m.sheet_page({ number, total })}</span>
	</span>
</div>
