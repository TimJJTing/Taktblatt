<!-- The shared destructive confirmation. Callers supply the text and delete action. -->
<script lang="ts">
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.ts';
	import { m } from '#lib/paraglide/messages.js';

	let {
		open = $bindable(false),
		title,
		body,
		onConfirm,
		returnFocus
	}: {
		open?: boolean;
		title: string;
		body: string;
		onConfirm: () => void;
		returnFocus?: HTMLButtonElement | null;
	} = $props();
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content
		onCloseAutoFocus={(event) => {
			if (returnFocus) {
				event.preventDefault();
				returnFocus.focus();
			}
		}}
	>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{body}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.action_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={onConfirm}>
				{m.action_delete()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
