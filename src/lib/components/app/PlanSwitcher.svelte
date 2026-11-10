<!-- Plans holds the plan list, creation, import and backup actions. Actions close the menu first. A reopen settles the pending action. -->
<script lang="ts">
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import CheckIcon from '@lucide/svelte/icons/check';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { RadioGroup } from 'bits-ui';
	import { onDestroy, untrack } from 'svelte';
	import { coarsePointer } from './app-layout.svelte.ts';
	import { downloadText } from '#lib/browser/download.ts';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.ts';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.ts';
	import { todayISO } from '#lib/domain/date.ts';
	import { backupFileName, serializeFile, toBackupFile } from '#lib/domain/io.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import BottomSheet from './BottomSheet.svelte';
	import ImportFlow from './ImportFlow.svelte';
	import { createMenuHandoff } from './menu-handoff.ts';

	const ws = getWorkspace();
	let menuOpen = $state(false);
	let trigger = $state<HTMLButtonElement | null>(null);
	let importer = $state<ImportFlow | null>(null);
	let handoff = $state(false);
	const nameOf = (heading: string) => heading.trim() || m.untitled_plan();

	const menuHandoff = createMenuHandoff({
		close: () => (menuOpen = false),
		focus: () => trigger?.focus(),
		setActive: (active) => (handoff = active)
	});
	const act = menuHandoff.act;
	onDestroy(menuHandoff.destroy);
	let previousCoarse = coarsePointer.current;
	$effect.pre(() => {
		const coarse = coarsePointer.current;
		if (coarse === previousCoarse) return;
		previousCoarse = coarse;
		// The old root cannot report close completion after its branch is removed.
		untrack(() => menuHandoff.complete(false));
	});

	const actions = [
		{
			label: m.plan_new,
			icon: PlusIcon,
			testId: 'plans-new',
			handler: () =>
				act(() => {
					ws.createPlan();
				}),
			destructive: false
		},
		{
			label: m.menu_import,
			icon: DownloadIcon,
			testId: 'plans-import',
			handler: importPlan,
			destructive: false
		},
		{
			label: m.plans_backup,
			shortLabel: m.plans_backup_short,
			icon: UploadIcon,
			testId: 'plans-backup',
			handler: () => act(backUpAll),
			destructive: false
		}
	];

	function importPlan() {
		menuHandoff.actSync(() => importer?.choose());
	}

	function backUpAll() {
		downloadText(backupFileName(todayISO()), serializeFile(toBackupFile(ws.allPlans())));
	}
</script>

{#snippet triggerLabel()}
	<span class="truncate">{nameOf(ws.plan.heading)}</span>
	<ChevronsUpDownIcon class="size-4 opacity-60" aria-hidden="true" />
{/snippet}

{#if coarsePointer.current}
	<Button
		bind:ref={trigger}
		variant="ghost"
		size="sm"
		class="max-w-64 min-w-0 shrink justify-between gap-2"
		style="transition-duration: {motionDuration(100)}ms"
		aria-label={m.plan_switcher_label()}
		aria-haspopup="dialog"
		aria-expanded={menuOpen}
		data-testid="plan-switcher"
		onclick={() => {
			menuHandoff.reopen();
			menuOpen = true;
		}}
	>
		{@render triggerLabel()}
	</Button>
	<BottomSheet
		bind:open={menuOpen}
		{trigger}
		{handoff}
		onOpenChangeComplete={(open) => {
			if (!menuOpen) menuHandoff.complete(open);
		}}
		title={m.plan_switcher_label()}
		testId="plans-sheet"
	>
		<RadioGroup.Root
			value={ws.plan.id}
			onValueChange={(id) => act(() => ws.switchTo(id))}
			aria-label={m.plan_switcher_label()}
			class="mb-4 flex flex-col"
		>
			{#each ws.plans as plan (plan.id)}
				<RadioGroup.Item
					value={plan.id}
					class="flex min-h-11 items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
				>
					<span class="truncate">{nameOf(plan.heading)}</span>
					{#if plan.id === ws.plan.id}<CheckIcon class="size-4 shrink-0" aria-hidden="true" />{/if}
				</RadioGroup.Item>
			{/each}
		</RadioGroup.Root>
		<div class="grid grid-cols-3 gap-2 border-t pt-4">
			{#each actions as action (action.testId)}
				<Button
					variant="outline"
					class="h-auto min-h-11 flex-col py-3 whitespace-normal"
					style="transition-duration: {motionDuration(100)}ms"
					data-testid={action.testId}
					aria-label={action.label()}
					onclick={action.handler}
					><action.icon aria-hidden="true" />{(action.shortLabel ?? action.label)()}</Button
				>
			{/each}
		</div>
	</BottomSheet>
{:else}
	<DropdownMenu.Root
		onOpenChangeComplete={(open) => {
			if (!menuOpen) menuHandoff.complete(open);
		}}
		bind:open={menuOpen}
		onOpenChange={(open) => {
			if (open) menuHandoff.reopen();
		}}
	>
		<DropdownMenu.Trigger
			bind:ref={trigger}
			class={buttonVariants({
				variant: 'ghost',
				size: 'sm',
				class: 'max-w-64 min-w-0 shrink justify-between gap-2'
			})}
			style="transition-duration: {motionDuration(100)}ms"
			aria-label={m.plan_switcher_label()}
			data-testid="plan-switcher"
		>
			{@render triggerLabel()}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content
			align="start"
			class="w-72 p-1.5"
			style="animation-duration: {motionDuration(100)}ms; transition-duration: {motionDuration(
				100
			)}ms"
			onCloseAutoFocus={(event) => {
				if (handoff) event.preventDefault();
			}}
		>
			<DropdownMenu.Label class="px-2.5 pt-2">{m.plan_switcher_label()}</DropdownMenu.Label>
			<DropdownMenu.RadioGroup value={ws.plan.id}>
				{#each ws.plans as plan (plan.id)}
					<DropdownMenu.RadioItem
						value={plan.id}
						class="py-2 pl-2.5"
						closeOnSelect
						onSelect={() => act(() => ws.switchTo(plan.id))}
						><span class="truncate">{nameOf(plan.heading)}</span></DropdownMenu.RadioItem
					>
				{/each}
			</DropdownMenu.RadioGroup>
			<DropdownMenu.Separator class="-mx-1.5 my-1.5" />
			{#each actions as action (action.testId)}
				<DropdownMenu.Item
					data-testid={action.testId}
					class="gap-2.5 px-2.5 py-2"
					onSelect={action.handler}
					><action.icon aria-hidden="true" />{action.label()}</DropdownMenu.Item
				>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}

<ImportFlow bind:this={importer} returnFocus={trigger} />
