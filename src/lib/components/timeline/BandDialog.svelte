<!--
	The band dialog: add or edit one band.
	An outside click saves an edit. Esc and Cancel discard the changes.
	An outside click on a new band does not add it. Delete asks for confirmation.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { isComposing } from '#lib/browser/keyboard.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import type { Band } from '#lib/domain/schema.js';
	import { BAND_TINT_KEYS } from '#lib/domain/palette.js';
	import { colorName } from '#lib/components/plan/colors.js';
	import DateRangeField from '#lib/components/edit/DateRangeField.svelte';
	import { formatRangeDisplay } from '#lib/domain/format.js';
	import { uiIntl } from '#lib/ui-language.js';
	import { m } from '#lib/paraglide/messages.js';
	import { addBand, updateBand, removeBand } from '#lib/state/commands.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import { cn } from '#lib/utils.js';
	let { entry, onClose }: { entry?: Band; onClose: () => void } = $props();
	const ws = getWorkspace();
	const initial = untrack(() => entry);
	let title = $state(initial?.title ?? '');
	let start = $state(initial?.start ?? ws.plan.range.start);
	let end = $state(initial?.end ?? ws.plan.range.end);
	let color = $state(initial?.color ?? 'gray');
	const valid = $derived(start <= end);
	let confirmDelete = $state(false);
	let open = $state(true);
	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		if (!isComposing(event)) close(true);
	}
	function close(commit: boolean) {
		if (commit) {
			if (!valid) return;
			const payload = { title, start, end, color };
			if (entry) updateBand(ws, entry.id, payload);
			else addBand(ws, payload);
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
		showCloseButton={false}
		data-testid="band-dialog"
		onEscapeKeydown={(event) => {
			event.preventDefault();
			if (!isComposing(event)) close(false);
		}}
	>
		<Dialog.Header
			><Dialog.Title>{entry ? m.band_edit() : m.band_add()}</Dialog.Title><Dialog.Description
				>{m.band_dialog_help()}</Dialog.Description
			></Dialog.Header
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
			<div class="grid gap-1 text-sm">
				<span>{m.field_range()}</span>
				<DateRangeField
					{start}
					{end}
					label={m.field_range()}
					allowEmpty={false}
					onCommit={(range) => {
						if (range.start && range.end) {
							start = range.start;
							end = range.end;
						}
					}}
				>
					{#snippet trigger({ props })}<Button {...props} variant="outline"
							>{formatRangeDisplay(start, end, uiIntl())}</Button
						>{/snippet}
				</DateRangeField>
			</div>
			<div class="grid gap-1 text-sm">
				<span>{m.field_tint()}</span>
				<Select.Root type="single" bind:value={color}>
					<Select.Trigger class="w-full" aria-label={m.field_tint()} data-testid="band-tint">
						{colorName(color)}
					</Select.Trigger>
					<Select.Content>
						{#each BAND_TINT_KEYS as value (value)}
							<Select.Item {value} label={colorName(value)}>{colorName(value)}</Select.Item>
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
						onclick={() => (confirmDelete = true)}>{m.band_delete()}</Button
					>
				{/if}
				<div class="flex flex-col-reverse gap-2 sm:flex-row">
					<Button type="button" variant="outline" onclick={() => close(false)}
						>{m.action_cancel()}</Button
					>
					<Button type="submit" disabled={!valid} data-testid="band-ok">{m.action_ok()}</Button>
				</div>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
<AlertDialog.Root bind:open={confirmDelete}>
	<AlertDialog.Content>
		<AlertDialog.Header
			><AlertDialog.Title>{m.band_delete_title()}</AlertDialog.Title><AlertDialog.Description
				>{m.timeline_delete_body({
					title: entry?.title || m.band_untitled()
				})}</AlertDialog.Description
			></AlertDialog.Header
		>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.action_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action
				class={buttonVariants({ variant: 'destructive' })}
				onclick={() => {
					if (entry) removeBand(ws, entry.id);
					close(false);
				}}>{m.action_delete()}</AlertDialog.Action
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
