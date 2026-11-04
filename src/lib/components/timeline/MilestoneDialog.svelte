<!--
	The milestone dialog: add or edit one milestone.
	An outside click saves an edit. Esc and Cancel discard the changes.
	An outside click on a new milestone does not add it. Delete asks for confirmation.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { isComposing } from '#lib/browser/keyboard.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import DateField from '#lib/components/edit/DateField.svelte';
	import { MILESTONE_SYMBOLS, type Milestone } from '#lib/domain/schema.js';
	import { formatDate, intlLocale } from '#lib/domain/format.js';
	import { m } from '#lib/paraglide/messages.js';
	import { addMilestone, updateMilestone, removeMilestone } from '#lib/state/commands.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import { cn } from '#lib/utils.js';
	let { entry, onClose }: { entry?: Milestone; onClose: () => void } = $props();
	const ws = getWorkspace();
	const initial = untrack(() => entry);
	let title = $state(initial?.title ?? '');
	let description = $state(initial?.description ?? '');
	let symbol = $state(initial?.symbol ?? 'diamond');
	let date = $state(initial?.date ?? ws.plan.range.start);
	const symbolNames = {
		diamond: m.symbol_diamond,
		flag: m.symbol_flag,
		star: m.symbol_star,
		circle: m.symbol_circle
	};
	let confirmDelete = $state(false);
	let open = $state(true);
	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		if (!isComposing(event)) close(true);
	}
	function close(commit: boolean) {
		if (commit) {
			const payload = { title, description, date, symbol };
			if (entry) updateMilestone(ws, entry.id, payload);
			else addMilestone(ws, payload);
		}
		open = false;
		onClose();
	}
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		// An outside click saves an edit. It does not add a new entry.
		if (!next && !confirmDelete) close(entry !== undefined);
	}}
>
	<Dialog.Content
		class="print:hidden"
		showCloseButton={false}
		data-testid="milestone-dialog"
		onEscapeKeydown={(event) => {
			event.preventDefault();
			if (!isComposing(event)) close(false);
		}}
	>
		<Dialog.Header
			><Dialog.Title>{entry ? m.milestone_edit() : m.milestone_add()}</Dialog.Title
			><Dialog.Description>{m.milestone_dialog_help()}</Dialog.Description></Dialog.Header
		>
		<form
			class="grid gap-4"
			onsubmit={(event) => {
				event.preventDefault();
				close(true);
			}}
		>
			<label class="grid gap-1 text-sm"
				>{m.field_title()}<Input bind:value={title} onkeydown={onKeydown} /></label
			>
			<label class="grid gap-1 text-sm"
				>{m.field_description()}<Textarea bind:value={description} /></label
			>
			<div class="grid gap-1 text-sm">
				<span>{m.field_date()}</span>
				<DateField
					{date}
					locale={ws.plan.locale}
					label={m.field_date()}
					allowEmpty={false}
					onCommit={(next) => {
						if (next) date = next;
					}}
				>
					{#snippet trigger({ props })}<Button
							{...props}
							variant="outline"
							data-testid="milestone-date">{formatDate(date, intlLocale(ws.plan.locale))}</Button
						>{/snippet}
				</DateField>
			</div>
			<div class="grid gap-1 text-sm">
				<span>{m.field_symbol()}</span>
				<Select.Root type="single" bind:value={symbol}>
					<Select.Trigger
						class="w-full"
						aria-label={m.field_symbol()}
						data-testid="milestone-symbol"
					>
						{symbolNames[symbol]()}
					</Select.Trigger>
					<Select.Content>
						{#each MILESTONE_SYMBOLS as value (value)}
							<Select.Item {value} label={symbolNames[value]()}>{symbolNames[value]()}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<Dialog.Footer class={cn(entry && 'sm:justify-between')}>
				{#if entry}
					<Button
						type="button"
						variant="ghost"
						class="text-destructive hover:text-destructive"
						onclick={() => (confirmDelete = true)}>{m.milestone_delete()}</Button
					>
				{/if}
				<div class="flex flex-col-reverse gap-2 sm:flex-row">
					<Button type="button" variant="outline" onclick={() => close(false)}
						>{m.action_cancel()}</Button
					>
					<Button type="submit" data-testid="milestone-ok">{m.action_ok()}</Button>
				</div>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
<AlertDialog.Root bind:open={confirmDelete}>
	<AlertDialog.Content class="print:hidden">
		<AlertDialog.Header
			><AlertDialog.Title>{m.milestone_delete_title()}</AlertDialog.Title><AlertDialog.Description
				>{m.timeline_delete_body({
					title: entry?.title || m.milestone_untitled()
				})}</AlertDialog.Description
			></AlertDialog.Header
		>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.action_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action
				class={buttonVariants({ variant: 'destructive' })}
				onclick={() => {
					if (entry) removeMilestone(ws, entry.id);
					close(false);
				}}>{m.action_delete()}</AlertDialog.Action
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
