<script lang="ts">
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import SunMoonIcon from '@lucide/svelte/icons/sun-moon';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, locales, type Locale } from '#lib/paraglide/runtime.js';
	import { getLanguageReload } from '#lib/state/language-reload.svelte.js';

	const labels: Record<Locale, () => string> = {
		en: m.ui_language_en,
		de: m.ui_language_de,
		'zh-TW': m.ui_language_zh_tw,
		ja: m.ui_language_ja
	};
	const reload = getLanguageReload();
	// The language of this page. It changes only with the reload.
	const current = getLocale();
	let menuOpen = $state(false);

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
	<DropdownMenu.Trigger
		class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
		aria-label={m.settings()}
		title={m.settings()}
		data-testid="settings-menu"
	>
		<SettingsIcon aria-hidden="true" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="min-w-44">
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
