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
	import { formatRangeDisplay, intlLocale } from '#lib/domain/format.js';
	import { motionDuration } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { addBand, updateBand, removeBand } from '#lib/state/commands.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
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
		if (!next && !confirmDelete) close(true);
	}}
>
	<Dialog.Content
		class="print:hidden"
		showCloseButton={false}
		style={`animation-duration: ${motionDuration(100)}ms; transition-duration: ${motionDuration(100)}ms`}
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
					locale={getLocale()}
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
							>{formatRangeDisplay(start, end, intlLocale(getLocale()))}</Button
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
			<Dialog.Footer>
				{#if entry}<Button
						type="button"
						variant="destructive"
						onclick={() => (confirmDelete = true)}>{m.action_delete()}</Button
					>{/if}
				<Button type="button" variant="outline" onclick={() => close(false)}
					>{m.action_cancel()}</Button
				>
				<Button type="submit" disabled={!valid}>{m.date_done()}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
<AlertDialog.Root bind:open={confirmDelete}>
	<AlertDialog.Content
		class="print:hidden"
		style={`animation-duration: ${motionDuration(100)}ms; transition-duration: ${motionDuration(100)}ms`}
	>
		<AlertDialog.Header
			><AlertDialog.Title>{m.band_delete_title()}</AlertDialog.Title><AlertDialog.Description
				>{m.timeline_delete_body({ title: entry?.title ?? '' })}</AlertDialog.Description
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
