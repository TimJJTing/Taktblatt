<script lang="ts">
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { isComposing } from '#lib/browser/keyboard.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { updatePlan } from '#lib/state/commands.js';
	import { getViewer } from '#lib/state/viewer.svelte.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';

	const ws = getWorkspace();
	const viewer = getViewer();
	let menuOpen = $state(false);
	let confirmOpen = $state(false);
	let renameOpen = $state(false);
	let renameValue = $state('');

	function startRename() {
		renameValue = ws.plan.heading;
		renameOpen = true;
	}

	/** An empty name keeps the previous name. */
	function commitRename() {
		renameOpen = false;
		const heading = renameValue.trim();
		if (heading && heading !== ws.plan.heading) updatePlan(ws, { heading });
	}

	function choose(id: string) {
		// Close the menu first. The plan change re-renders the trigger.
		menuOpen = false;
		ws.switchTo(id);
	}

	const nameOf = (heading: string) => heading.trim() || m.untitled_plan();

	function deleteActive() {
		confirmOpen = false;
		const deleted = ws.deletePlan(ws.plan.id);
		if (!deleted) return;
		// Undo puts back the expanded rows too.
		const expanded = viewer.expandedIds(deleted.plan.id);
		viewer.forgetPlan(deleted.plan.id);
		toast(m.plan_deleted(), {
			description: nameOf(deleted.plan.heading),
			duration: 10_000,
			action: {
				label: m.action_undo(),
				onClick: () => {
					ws.restorePlan(deleted);
					viewer.restorePlan(deleted.plan.id, expanded);
				}
			}
		});
	}
</script>

<DropdownMenu.Root bind:open={menuOpen}>
	<DropdownMenu.Trigger
		class={buttonVariants({
			variant: 'ghost',
			size: 'sm',
			class: 'max-w-64 min-w-0 shrink justify-between gap-2'
		})}
		aria-label={m.plan_switcher_label()}
		data-testid="plan-switcher"
	>
		<span class="truncate">{nameOf(ws.plan.heading)}</span>
		<ChevronsUpDownIcon class="opacity-60" aria-hidden="true" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" class="w-72">
		<DropdownMenu.Label>{m.plan_switcher_label()}</DropdownMenu.Label>
		<DropdownMenu.RadioGroup value={ws.plan.id} onValueChange={choose}>
			{#each ws.plans as plan (plan.id)}
				<DropdownMenu.RadioItem value={plan.id}>
					<span class="truncate">{nameOf(plan.heading)}</span>
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
		<DropdownMenu.Separator />
		<DropdownMenu.Item onSelect={() => ws.createPlan()}>
			<PlusIcon aria-hidden="true" />{m.plan_new()}
		</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={startRename}>
			<PencilIcon aria-hidden="true" />{m.plan_rename()}
		</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={() => ws.duplicatePlan(m.plan_copy_suffix())}>
			<CopyIcon aria-hidden="true" />{m.plan_duplicate()}
		</DropdownMenu.Item>
		<DropdownMenu.Item variant="destructive" onSelect={() => (confirmOpen = true)}>
			<Trash2Icon aria-hidden="true" />{m.plan_delete()}
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.plan_delete_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.plan_delete_body({ name: nameOf(ws.plan.heading) })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.action_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action class={buttonVariants({ variant: 'destructive' })} onclick={deleteActive}>
				{m.action_delete()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<Dialog.Root bind:open={renameOpen}>
	<Dialog.Content
		class="sm:max-w-sm"
		data-testid="plan-rename-dialog"
		onEscapeKeydown={(event) => {
			event.preventDefault();
			if (!isComposing(event)) renameOpen = false;
		}}
	>
		<form
			class="flex flex-col gap-4"
			onsubmit={(event) => {
				event.preventDefault();
				commitRename();
			}}
		>
			<Dialog.Header>
				<Dialog.Title>{m.plan_rename_title()}</Dialog.Title>
				<Dialog.Description class="sr-only">{m.plan_rename_label()}</Dialog.Description>
			</Dialog.Header>
			<Input
				bind:value={renameValue}
				aria-label={m.plan_rename_label()}
				placeholder={m.untitled_plan()}
				data-testid="plan-rename-input"
				onkeydown={(event) => {
					// Enter in an IME composition confirms the text. It must not submit.
					if (event.key === 'Enter' && isComposing(event)) event.preventDefault();
				}}
			/>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (renameOpen = false)}>
					{m.action_cancel()}
				</Button>
				<Button type="submit" data-testid="plan-rename-ok">{m.action_rename()}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
