<!--
	The question before a reload for a language change. It shows when the reload would drop the undo
	history or the draft of an open dialog. Two cases: the person chose a language here, or another tab did.
	Refer to ADR 9.
-->
<script lang="ts">
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.ts';
	import { buttonVariants } from '#lib/components/ui/button/index.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getLanguageReload } from '#lib/state/language-reload.svelte.ts';

	const reload = getLanguageReload();
	const otherTab = $derived(reload.kind === 'other-tab');
</script>

<AlertDialog.Root open={reload.open} onOpenChange={(open) => !open && reload.cancel()}>
	<!-- The question can come while another dialog is open (another tab changed the language). It must stay above. -->
	<AlertDialog.Content class="z-[60]" overlayClass="z-[60]" data-testid="language-reload-dialog">
		<AlertDialog.Header>
			<AlertDialog.Title>
				{otherTab ? m.ui_language_other_tab_title() : m.ui_language_reload_title()}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{otherTab ? m.ui_language_other_tab_body() : m.ui_language_reload_body()}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel data-testid="language-reload-cancel">
				{otherTab ? m.ui_language_other_tab_later() : m.action_cancel()}
			</AlertDialog.Cancel>
			<AlertDialog.Action
				class={buttonVariants({ variant: 'destructive' })}
				data-testid="language-reload-confirm"
				onclick={() => reload.confirm()}
			>
				{otherTab ? m.ui_language_other_tab_reload() : m.ui_language_reload_confirm()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
