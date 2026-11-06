<!-- The shared destructive confirmation. Callers supply the text and delete action. -->
<script lang="ts">
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.ts';
	import { m } from '#lib/paraglide/messages.js';

	let {
		open = $bindable(false),
		title,
		body,
		onConfirm
	}: {
		open?: boolean;
		title: string;
		body: string;
		onConfirm: () => void;
	} = $props();
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
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
