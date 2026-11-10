<!-- This plan holds the actions on the open plan, followed by Theme and Language. Actions close the menu first. A reopen settles the pending action. -->
<script lang="ts">
	import CopyIcon from '@lucide/svelte/icons/copy';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import { mergeProps, RadioGroup } from 'bits-ui';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { onDestroy, untrack } from 'svelte';
	import { coarsePointer } from './app-layout.svelte.ts';
	import { toast } from 'svelte-sonner';
	import { downloadText } from '#lib/browser/download.ts';
	import { isComposing } from '#lib/browser/keyboard.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { todayISO } from '#lib/domain/date.ts';
	import { exportFileName, serializeFile, toPlanFile } from '#lib/domain/io.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, locales, type Locale } from '#lib/paraglide/runtime.js';
	import { updatePlan } from '#lib/state/commands.ts';
	import { getLanguageReload } from '#lib/state/language-reload.svelte.ts';
	import { getPreview } from '#lib/state/preview.svelte.ts';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import BottomSheet from './BottomSheet.svelte';
	import DeleteConfirm from './DeleteConfirm.svelte';
	import Hint from './Hint.svelte';
	import LanguageReloadDialog from './LanguageReloadDialog.svelte';
	import { cn } from '#lib/utils.ts';
	import { createMenuHandoff } from './menu-handoff.ts';

	const labels: Record<Locale, () => string> = {
		en: m.ui_language_en,
		de: m.ui_language_de,
		'zh-TW': m.ui_language_zh_tw,
		ja: m.ui_language_ja
	};
	const themes = [
		{ value: 'light', label: m.theme_light, icon: SunIcon },
		{ value: 'dark', label: m.theme_dark, icon: MoonIcon },
		{ value: 'system', label: m.theme_system, icon: MonitorIcon }
	] as const;
	const ws = getWorkspace();
	const viewer = getViewer();
	const preview = getPreview();
	const reload = getLanguageReload();
	const current = getLocale();
	let menuOpen = $state(false);
	let trigger = $state<HTMLButtonElement | null>(null);
	let handoff = $state(false);
	let confirmOpen = $state(false);
	let renameOpen = $state(false);
	let renameValue = $state('');
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
			label: m.menu_print,
			icon: PrinterIcon,
			testId: 'menu-print',
			handler: () => preview.show(() => trigger),
			destructive: false,
			hint: m.menu_print_hint
		},
		{
			label: m.export_plan,
			icon: UploadIcon,
			testId: 'menu-export-plan',
			handler: exportPlan,
			destructive: false,
			hint: m.menu_export_hint
		},
		{
			label: m.plan_rename,
			icon: PencilIcon,
			testId: 'menu-rename',
			handler: startRename,
			destructive: false
		},
		{
			label: m.plan_duplicate,
			icon: CopyIcon,
			testId: 'menu-duplicate',
			handler: () => {
				ws.duplicatePlan(m.plan_copy_suffix());
			},
			destructive: false
		},
		{
			label: m.plan_delete,
			icon: Trash2Icon,
			testId: 'menu-delete',
			handler: () => {
				confirmOpen = true;
			},
			destructive: true
		}
	];

	function exportPlan() {
		const plan = ws.activePlan();
		downloadText(exportFileName(plan.heading, todayISO()), serializeFile(toPlanFile(plan)));
	}

	// The theme choices form one switch: a track with one thumb that slides to the selected choice.
	const themeTrack = 'relative grid grid-cols-3 rounded-lg bg-muted p-0.5';
	const themeIndex = $derived(
		Math.max(
			0,
			themes.findIndex((theme) => theme.value === userPrefersMode.current)
		)
	);

	function chooseTheme(value: string) {
		if (value === 'light' || value === 'dark' || value === 'system') setMode(value);
	}

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

{#snippet menuButton(props: Record<string, unknown> = {})}
	<Button
		{...props}
		bind:ref={trigger}
		variant="ghost"
		size="icon-sm"
		style="transition-duration: {motionDuration(100)}ms"
		aria-label={m.menu()}
		data-testid="app-menu"
	>
		<EllipsisIcon aria-hidden="true" />
	</Button>
{/snippet}

{#snippet themeThumb()}
	<span
		aria-hidden="true"
		class="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc((100%-0.25rem)/3)] rounded-md bg-background shadow-sm ring-1 ring-foreground/10 ease-out"
		style="transform: translateX({themeIndex * 100}%); transition: transform {motionDuration(
			150
		)}ms"
	></span>
{/snippet}

{#if coarsePointer.current}
	<Hint text={m.menu()}>
		{#snippet child({ props })}
			{@render menuButton(
				mergeProps(props, {
					'aria-haspopup': 'dialog',
					'aria-expanded': menuOpen,
					onclick: () => {
						menuHandoff.reopen();
						menuOpen = true;
					}
				})
			)}
		{/snippet}
	</Hint>
	<BottomSheet
		bind:open={menuOpen}
		{trigger}
		{handoff}
		onOpenChangeComplete={(open) => {
			if (!menuOpen) menuHandoff.complete(open);
		}}
		title={m.menu_this_plan()}
		subtitle={nameOf(ws.plan.heading)}
		testId="menu-sheet"
	>
		<div class="grid grid-cols-2 gap-3 pb-3">
			{#each actions.filter((action) => action.hint) as action (action.testId)}
				<Button
					variant="outline"
					class="h-auto min-h-24 flex-col items-start p-3 text-left whitespace-normal"
					style="transition-duration: {motionDuration(100)}ms"
					data-testid={action.testId}
					onclick={() => act(action.handler)}
				>
					<action.icon class="mb-1 size-5" aria-hidden="true" />
					<span>{action.label()}</span>
					<span class="text-xs font-normal text-muted-foreground">{action.hint?.()}</span>
				</Button>
			{/each}
		</div>
		<div class="flex flex-col pb-3">
			{#each actions.filter((action) => !action.hint) as action (action.testId)}
				<Button
					variant="ghost"
					class={cn(
						'min-h-11 justify-start',
						action.destructive && 'text-destructive hover:text-destructive'
					)}
					style="transition-duration: {motionDuration(100)}ms"
					data-testid={action.testId}
					onclick={() => act(action.handler)}
					><action.icon aria-hidden="true" />{action.label()}</Button
				>
			{/each}
		</div>
		<div class="space-y-4 border-t pt-4">
			<div>
				<p class="mb-2 text-sm font-medium">{m.theme()}</p>
				<RadioGroup.Root
					value={userPrefersMode.current}
					onValueChange={chooseTheme}
					aria-label={m.theme()}
					orientation="horizontal"
					class={themeTrack}
				>
					{@render themeThumb()}
					{#each themes as theme (theme.value)}
						<RadioGroup.Item
							value={theme.value}
							class="relative flex min-h-11 items-center justify-center gap-2 rounded-md text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[state=checked]:text-foreground"
						>
							<theme.icon class="size-4" aria-hidden="true" />{theme.label()}
						</RadioGroup.Item>
					{/each}
				</RadioGroup.Root>
			</div>
			<label class="flex min-h-11 items-center justify-between gap-4 text-sm font-medium">
				<span>{m.ui_language()}</span>
				<select
					aria-label={m.ui_language()}
					value={current}
					onchange={(event) => {
						const value = event.currentTarget.value as Locale;
						act(() => reload.choose(value));
					}}
					class="min-h-11 min-w-0 rounded-md border bg-background px-3 text-sm font-normal"
				>
					{#each locales as locale (locale)}<option value={locale} lang={locale}
							>{labels[locale]()}</option
						>{/each}
				</select>
			</label>
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
		<Hint text={m.menu()}>
			{#snippet child({ props: tooltipProps })}
				<DropdownMenu.Trigger>
					{#snippet child({ props: menuProps })}
						{@render menuButton(mergeProps(tooltipProps, menuProps))}
					{/snippet}
				</DropdownMenu.Trigger>
			{/snippet}
		</Hint>
		<DropdownMenu.Content
			align="end"
			class="min-w-64 p-1.5"
			style="animation-duration: {motionDuration(100)}ms; transition-duration: {motionDuration(
				100
			)}ms"
			onCloseAutoFocus={(event) => {
				if (handoff) event.preventDefault();
			}}
		>
			<DropdownMenu.Label class="px-2.5 pt-2">{m.menu_this_plan()}</DropdownMenu.Label>
			{#each actions as action (action.testId)}
				<DropdownMenu.Item
					variant={action.destructive ? 'destructive' : 'default'}
					class="gap-2.5 px-2.5 py-2"
					onSelect={() => act(action.handler)}
					data-testid={action.testId}
					><action.icon aria-hidden="true" />{action.label()}</DropdownMenu.Item
				>
			{/each}
			<DropdownMenu.Separator class="-mx-1.5 my-1.5" />
			<DropdownMenu.Label class="px-2.5 pt-2">{m.theme()}</DropdownMenu.Label>
			<DropdownMenu.RadioGroup
				value={userPrefersMode.current}
				onValueChange={chooseTheme}
				aria-label={m.theme()}
				class={cn(themeTrack, 'mx-1.5 mt-1 mb-2')}
			>
				{@render themeThumb()}
				{#each themes as theme (theme.value)}
					<DropdownMenu.RadioItem
						value={theme.value}
						closeOnSelect
						aria-label={theme.label()}
						class="relative justify-center rounded-md py-1.5 pr-2 text-muted-foreground focus:bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[state=checked]:text-foreground [&>[data-slot=dropdown-menu-radio-item-indicator]]:hidden"
					>
						<theme.icon aria-hidden="true" />
					</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger data-testid="menu-language" class="gap-2.5 px-2.5 py-2"
					><LanguagesIcon aria-hidden="true" />{m.ui_language()}<span
						class="ml-auto text-muted-foreground">{labels[current]()}</span
					></DropdownMenu.SubTrigger
				>
				<DropdownMenu.SubContent
					style="animation-duration: {motionDuration(100)}ms; transition-duration: {motionDuration(
						100
					)}ms"
				>
					<DropdownMenu.RadioGroup value={current} aria-label={m.ui_language()}>
						{#each locales as locale (locale)}
							<DropdownMenu.RadioItem
								value={locale}
								lang={locale}
								closeOnSelect
								onSelect={() => act(() => reload.choose(locale))}
								>{labels[locale]()}</DropdownMenu.RadioItem
							>
						{/each}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}

<DeleteConfirm
	bind:open={confirmOpen}
	title={m.plan_delete_title()}
	body={m.plan_delete_body({ name: nameOf(ws.plan.heading) })}
	onConfirm={deleteActive}
	returnFocus={trigger}
/>

<Dialog.Root bind:open={renameOpen}>
	<Dialog.Content
		class="sm:max-w-sm"
		data-testid="plan-rename-dialog"
		onCloseAutoFocus={(event) => {
			event.preventDefault();
			trigger?.focus();
		}}
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

<LanguageReloadDialog returnFocus={() => trigger} />
