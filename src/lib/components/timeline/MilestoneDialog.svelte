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
	import { motionDuration } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { addMilestone, updateMilestone, removeMilestone } from '#lib/state/commands.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
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
					locale={getLocale()}
					label={m.field_date()}
					allowEmpty={false}
					onCommit={(next) => {
						if (next) date = next;
					}}
				>
					{#snippet trigger({ props })}<Button
							{...props}
							variant="outline"
							data-testid="milestone-date">{formatDate(date, intlLocale(getLocale()))}</Button
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
			<Dialog.Footer>
				{#if entry}<Button
						type="button"
						variant="destructive"
						onclick={() => (confirmDelete = true)}>{m.action_delete()}</Button
					>{/if}
				<Button type="button" variant="outline" onclick={() => close(false)}
					>{m.action_cancel()}</Button
				>
				<Button type="submit">{m.date_done()}</Button>
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
			><AlertDialog.Title>{m.milestone_delete_title()}</AlertDialog.Title><AlertDialog.Description
				>{m.timeline_delete_body({ title: entry?.title ?? '' })}</AlertDialog.Description
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
