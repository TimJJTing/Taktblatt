<!--
	The plan footer: note, version and date on the left. A note and the page number on the right.
	The plan stores each field one time. The date comes from the user.
-->
<script lang="ts">
	import DateField from '#lib/components/edit/DateField.svelte';
	import InlineText from '#lib/components/edit/InlineText.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { formatDate } from '#lib/domain/format.js';
	import { uiIntl } from '#lib/domain/locale.js';
	import { m } from '#lib/paraglide/messages.js';
	import { updateFooter } from '#lib/state/commands.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';

	const ws = getWorkspace();
	const footer = $derived(ws.plan.footer);
	const dateText = $derived(footer.date ? formatDate(footer.date, uiIntl()) : '');
</script>

<footer class="mx-auto max-w-6xl px-4 pl-8 text-xs text-muted-foreground">
	<div class="flex items-baseline justify-between gap-4 border-t py-3">
		<div class="flex min-w-0 flex-wrap items-baseline gap-x-1">
			<InlineText
				value={footer.note}
				label={m.footer_note()}
				placeholder={m.footer_note_placeholder()}
				class="w-auto"
				onCommit={(note) => updateFooter(ws, { note })}
				testId="footer-note"
			/>
			<span aria-hidden="true">·</span>
			<InlineText
				value={footer.version}
				label={m.footer_version()}
				placeholder={m.footer_version()}
				class="w-auto"
				onCommit={(version) => updateFooter(ws, { version })}
				testId="footer-version"
			/>
			<span aria-hidden="true">·</span>
			<DateField
				date={footer.date}
				label={m.footer_date()}
				showToday
				onCommit={(date) => updateFooter(ws, { date })}
			>
				{#snippet trigger({ props })}
					<Button
						{...props}
						variant="ghost"
						size="sm"
						class="h-6 px-1.5 text-xs"
						data-testid="footer-date"
						>{#if dateText}{dateText}{:else}<span class="text-muted-foreground/70"
								>{m.footer_date_placeholder()}</span
							>{/if}</Button
					>
				{/snippet}
			</DateField>
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
			<!-- The page number "n / N" shows on the sheets only (spec section 7). The workspace slot stays empty. -->
			<span data-page-number></span>
		</div>
	</div>
</footer>
