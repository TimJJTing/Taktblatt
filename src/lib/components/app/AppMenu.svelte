<!--
	The app menu: the last button in the app header. Its icon is an ellipsis.
	It contains Print, Import and an Export submenu, then the Theme and Language choices.
	Print opens the preview. The print dialog opens only from the Print button of the preview
	or from Cmd/Ctrl+P.
	Export writes the active plan or all plans to a JSON file. The file contains plan data only.
-->
<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import SunMoonIcon from '@lucide/svelte/icons/sun-moon';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { mergeProps } from 'bits-ui';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { downloadText } from '#lib/browser/download.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.ts';
	import { todayISO } from '#lib/domain/date.ts';
	import {
		backupFileName,
		exportFileName,
		serializeFile,
		toBackupFile,
		toPlanFile
	} from '#lib/domain/io.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, locales, type Locale } from '#lib/paraglide/runtime.js';
	import { getLanguageReload } from '#lib/state/language-reload.svelte.ts';
	import { getPreview } from '#lib/state/preview.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import Hint from './Hint.svelte';
	import ImportFlow from './ImportFlow.svelte';

	const labels: Record<Locale, () => string> = {
		en: m.ui_language_en,
		de: m.ui_language_de,
		'zh-TW': m.ui_language_zh_tw,
		ja: m.ui_language_ja
	};
	const ws = getWorkspace();
	const preview = getPreview();
	const reload = getLanguageReload();
	// The language of this page. It changes only with the reload.
	const current = getLocale();
	let menuOpen = $state(false);
	let trigger = $state<HTMLButtonElement | null>(null);
	let importer = $state<ImportFlow | null>(null);

	function openPreview() {
		// The focus goes back to the menu button when the preview closes.
		preview.show(trigger);
	}

	function exportPlan() {
		const plan = ws.activePlan();
		downloadText(exportFileName(plan.heading, todayISO()), serializeFile(toPlanFile(plan)));
	}

	function exportAll() {
		downloadText(backupFileName(todayISO()), serializeFile(toBackupFile(ws.allPlans())));
	}

	function chooseTheme(value: string) {
		if (value === 'light' || value === 'dark' || value === 'system') setMode(value);
	}

	function chooseLanguage(value: string) {
		// Close the menu first. The question may open a dialog.
		menuOpen = false;
		reload.choose(value as Locale);
	}
</script>

<DropdownMenu.Root bind:open={menuOpen}>
	<Hint text={m.menu()}>
		{#snippet child({ props: tooltipProps })}
			<DropdownMenu.Trigger>
				{#snippet child({ props: menuProps })}
					<Button
						{...mergeProps(tooltipProps, menuProps)}
						bind:ref={trigger}
						variant="ghost"
						size="icon-sm"
						aria-label={m.menu()}
						data-testid="app-menu"
					>
						<EllipsisIcon aria-hidden="true" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
		{/snippet}
	</Hint>
	<DropdownMenu.Content align="end" class="min-w-44">
		<DropdownMenu.Item onSelect={openPreview} data-testid="menu-print">
			<PrinterIcon aria-hidden="true" />{m.action_print()}
		</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={() => importer?.choose()} data-testid="menu-import">
			<DownloadIcon aria-hidden="true" />{m.action_import()}
		</DropdownMenu.Item>
		<DropdownMenu.Sub>
			<DropdownMenu.SubTrigger data-testid="menu-export">
				<UploadIcon aria-hidden="true" />{m.action_export()}
			</DropdownMenu.SubTrigger>
			<DropdownMenu.SubContent>
				<DropdownMenu.Item onSelect={exportPlan} data-testid="menu-export-plan">
					{m.export_plan()}
				</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={exportAll} data-testid="menu-export-all">
					{m.export_all()}
				</DropdownMenu.Item>
			</DropdownMenu.SubContent>
		</DropdownMenu.Sub>
		<DropdownMenu.Separator />
		<DropdownMenu.Label class="flex items-center gap-1.5">
			<SunMoonIcon class="size-3.5" aria-hidden="true" />
			{m.theme()}
		</DropdownMenu.Label>
		<DropdownMenu.RadioGroup
			value={userPrefersMode.current}
			onValueChange={chooseTheme}
			aria-label={m.theme()}
		>
			<DropdownMenu.RadioItem value="light" closeOnSelect>{m.theme_light()}</DropdownMenu.RadioItem>
			<DropdownMenu.RadioItem value="dark" closeOnSelect>{m.theme_dark()}</DropdownMenu.RadioItem>
			<DropdownMenu.RadioItem value="system" closeOnSelect
				>{m.theme_system()}</DropdownMenu.RadioItem
			>
		</DropdownMenu.RadioGroup>
		<DropdownMenu.Separator />
		<DropdownMenu.Label class="flex items-center gap-1.5">
			<LanguagesIcon class="size-3.5" aria-hidden="true" />
			{m.ui_language()}
		</DropdownMenu.Label>
		<DropdownMenu.RadioGroup
			value={current}
			onValueChange={chooseLanguage}
			aria-label={m.ui_language()}
		>
			{#each locales as locale (locale)}
				<DropdownMenu.RadioItem value={locale} lang={locale}
					>{labels[locale]()}</DropdownMenu.RadioItem
				>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
<ImportFlow bind:this={importer} />
