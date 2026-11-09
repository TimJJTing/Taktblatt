<!--
	The plan footer: note, version and date on the left. A note on the right.
	The plan stores each field one time. The date comes from the user.
-->
<script lang="ts">
	import Hint from '#lib/components/app/Hint.svelte';
	import DateField from '#lib/components/edit/DateField.svelte';
	import InlineText from '#lib/components/edit/InlineText.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { formatDate } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { updateFooter } from '#lib/state/commands.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';

	const ws = getWorkspace();
	const footer = $derived(ws.plan.footer);
	const dateText = $derived(footer.date ? formatDate(footer.date, uiIntl()) : '');
</script>

<div
	role="group"
	aria-label={m.sheet_footer()}
	class="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2 text-xs text-muted-foreground"
>
	<Hint text={m.sheet_footer_hint()}>
		{#snippet child({ props })}
			<span {...props} class="text-xs font-semibold tracking-wide uppercase"
				>{m.sheet_footer()}</span
			>
		{/snippet}
	</Hint>
	<div class="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
		<div class="flex min-w-0 flex-wrap items-baseline gap-x-1">
			<InlineText
				value={footer.note}
				label={m.footer_note()}
				placeholder={m.footer_note_placeholder()}
				class="w-auto"
				onCommit={(note) => updateFooter(ws, { note })}
				testId="footer-note"
			/>
			<span aria-hidden="true">{m.footer_separator().trim()}</span>
			<InlineText
				value={footer.version}
				label={m.footer_version()}
				placeholder={m.footer_version()}
				class="w-auto"
				onCommit={(version) => updateFooter(ws, { version })}
				testId="footer-version"
			/>
			<span aria-hidden="true">{m.footer_separator().trim()}</span>
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
		<div class="ml-auto flex min-w-0 items-baseline gap-2">
			<InlineText
				value={footer.right}
				label={m.footer_right()}
				placeholder={m.footer_right_placeholder()}
				class="w-auto text-right"
				onCommit={(right) => updateFooter(ws, { right })}
				testId="footer-right"
			/>
		</div>
	</div>
</div>
