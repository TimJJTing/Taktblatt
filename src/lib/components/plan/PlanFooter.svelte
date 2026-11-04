<!--
	The plan footer: note, version and date on the left. A note and the page number on the right.
	The plan stores each field one time. Empty parts do not print. The date comes from the user.
-->
<script lang="ts">
	import DateField from '#lib/components/edit/DateField.svelte';
	import InlineText from '#lib/components/edit/InlineText.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { formatDate, intlLocale } from '#lib/domain/format.js';
	import { m } from '#lib/paraglide/messages.js';
	import { updateFooter } from '#lib/state/commands.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import { cn } from '#lib/utils.js';

	const ws = getWorkspace();
	const footer = $derived(ws.plan.footer);
	const dateText = $derived(footer.date ? formatDate(footer.date, intlLocale(ws.plan.locale)) : '');
	const hasNote = $derived(!!footer.note);
	const hasVersion = $derived(!!footer.version);
	const isEmpty = $derived(!hasNote && !hasVersion && !footer.date && !footer.right);
</script>

<footer
	class={cn(
		'mx-auto flex max-w-6xl items-baseline justify-between gap-4 border-t px-4 py-3 pl-8 text-xs text-muted-foreground',
		isEmpty && 'print:hidden'
	)}
>
	<div class="flex min-w-0 flex-wrap items-baseline gap-x-1">
		<InlineText
			value={footer.note}
			label={m.footer_note()}
			placeholder={m.footer_note_placeholder()}
			class="w-auto"
			onCommit={(note) => updateFooter(ws, { note })}
			testId="footer-note"
		/>
		<span aria-hidden="true" class:print:hidden={!(hasNote && hasVersion)}>·</span>
		<InlineText
			value={footer.version}
			label={m.footer_version()}
			placeholder={m.footer_version()}
			class="w-auto"
			onCommit={(version) => updateFooter(ws, { version })}
			testId="footer-version"
		/>
		<span aria-hidden="true" class:print:hidden={!(footer.date && (hasNote || hasVersion))}>·</span>
		<DateField
			date={footer.date}
			locale={ws.plan.locale}
			label={m.footer_date()}
			showToday
			onCommit={(date) => updateFooter(ws, { date })}
		>
			{#snippet trigger({ props })}
				<Button
					{...props}
					variant="ghost"
					size="sm"
					class="h-6 px-1.5 text-xs print:hidden"
					data-testid="footer-date"
					>{#if dateText}{dateText}{:else}<span class="text-muted-foreground/70"
							>{m.footer_date_placeholder()}</span
						>{/if}</Button
				>
			{/snippet}
		</DateField>
		{#if dateText}<span class="hidden print:inline">{dateText}</span>{/if}
	</div>
	<div class="flex min-w-0 items-baseline gap-2">
		<InlineText
			value={footer.right}
			label={m.footer_right()}
			placeholder={m.footer_right_placeholder()}
			class="w-auto text-right"
			onCommit={(right) => updateFooter(ws, { right })}
			testId="footer-right"
		/>
		<!-- The paginator (spec section 7) supplies the page number "n / N". Until then, the slot is empty. -->
		<span data-page-number></span>
	</div>
</footer>
