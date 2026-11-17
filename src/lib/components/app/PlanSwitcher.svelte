<!-- Plans holds the plan list, creation, import and backup actions. Actions close the menu first. A reopen settles the pending action. -->
<script lang="ts">
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import CheckIcon from '@lucide/svelte/icons/check';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { downloadText } from '#lib/browser/download.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.ts';
	import { todayISO } from '#lib/domain/date.ts';
	import { backupFileName, serializeFile, toBackupFile } from '#lib/domain/io.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { nameOf } from '#lib/plan-name.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import AdaptiveMenu from './AdaptiveMenu.svelte';
	import type { MenuAction } from './menu-action.ts';
	import ImportFlow from './ImportFlow.svelte';

	const ws = getWorkspace();
	let trigger = $state<HTMLButtonElement | null>(null);
	let importer = $state<ImportFlow | null>(null);

	const actions: MenuAction[] = [
		{
			label: m.plan_new,
			icon: PlusIcon,
			testId: 'plans-new',
			handler: () => {
				ws.createPlan();
			}
		},
		{
			label: m.plans_import,
			icon: DownloadIcon,
			testId: 'plans-import',
			handler: () => importer?.choose(),
			sync: true
		},
		{
			label: m.plans_backup,
			shortLabel: m.plans_backup_short,
			icon: UploadIcon,
			testId: 'plans-backup',
			handler: backUpAll
		}
	];

	function backUpAll() {
		downloadText(backupFileName(todayISO()), serializeFile(toBackupFile(ws.allPlans())));
	}
</script>

{#snippet triggerLabel()}
	<span class="truncate">{nameOf(ws.plan.heading)}</span>
	<ChevronsUpDownIcon class="size-4 opacity-60" aria-hidden="true" />
{/snippet}

{#snippet switcherButton(props: Record<string, unknown>)}
	<Button
		{...props}
		bind:ref={trigger}
		variant="ghost"
		size="sm"
		class="max-w-64 min-w-0 shrink justify-between gap-2"
		style="transition-duration: {motionDuration(100)}ms"
		aria-label={m.plan_switcher_label()}
		data-testid="plan-switcher"
	>
		{@render triggerLabel()}
	</Button>
{/snippet}

<AdaptiveMenu
	{trigger}
	title={m.plan_switcher_label()}
	testId="plans-sheet"
	align="start"
	contentClass="w-72 p-1.5"
	triggerButton={switcherButton}
>
	{#snippet sheet({ act, run })}
		<ul aria-label={m.plan_switcher_label()} class="mb-4 flex flex-col">
			{#each ws.plans as plan (plan.id)}
				<li>
					<button
						type="button"
						aria-current={plan.id === ws.plan.id ? 'true' : undefined}
						class="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
						onclick={() => act(() => ws.switchTo(plan.id))}
						onkeydown={(event) => {
							if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
							event.preventDefault();
							const rows = event.currentTarget.closest('ul')?.querySelectorAll('button');
							if (!rows) return;
							const index = Array.from(rows).indexOf(event.currentTarget);
							const step = event.key === 'ArrowDown' ? 1 : -1;
							rows[(index + step + rows.length) % rows.length]?.focus();
						}}
					>
						<span class="truncate">{nameOf(plan.heading)}</span>
						{#if plan.id === ws.plan.id}
							<CheckIcon
								class="size-4 shrink-0"
								aria-hidden="true"
								data-testid="plan-current-mark"
							/>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
		<div class="grid grid-cols-3 gap-2 border-t pt-4">
			{#each actions as action (action.testId)}
				<Button
					variant="outline"
					class="h-auto min-h-11 flex-col py-3 whitespace-normal"
					style="transition-duration: {motionDuration(100)}ms"
					data-testid={action.testId}
					aria-label={action.label()}
					onclick={() => run(action)}
					><action.icon aria-hidden="true" />{(action.shortLabel ?? action.label)()}</Button
				>
			{/each}
		</div>
	{/snippet}
	{#snippet dropdown({ act, run })}
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
				onSelect={() => run(action)}
				><action.icon aria-hidden="true" />{action.label()}</DropdownMenu.Item
			>
		{/each}
	{/snippet}
</AdaptiveMenu>

<ImportFlow bind:this={importer} returnFocus={trigger} />
