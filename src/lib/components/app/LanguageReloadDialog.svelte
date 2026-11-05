<!--
	The question before a reload for a language change. It shows when the reload would drop the undo
	history or text that is not committed. Two cases: the person chose a language here, or another tab did.
	Refer to ADR 9.
-->
<script lang="ts">
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLanguageReload } from '#lib/state/language-reload.svelte.js';

	const reload = getLanguageReload();
	const otherTab = $derived(reload.pending?.kind === 'other-tab');
</script>

<AlertDialog.Root open={reload.pending !== null} onOpenChange={(open) => !open && reload.cancel()}>
	<AlertDialog.Content data-testid="language-reload-dialog">
		<AlertDialog.Header>
			<AlertDialog.Title>
				{otherTab ? m.language_other_tab_title() : m.language_switch_title()}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{otherTab ? m.language_other_tab_body() : m.language_switch_body()}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel data-testid="language-reload-cancel">
				{otherTab ? m.language_other_tab_cancel() : m.action_cancel()}
			</AlertDialog.Cancel>
			<AlertDialog.Action
				class={buttonVariants({ variant: 'destructive' })}
				data-testid="language-reload-confirm"
				onclick={() => reload.confirm()}
			>
				{otherTab ? m.language_other_tab_confirm() : m.language_switch_confirm()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
