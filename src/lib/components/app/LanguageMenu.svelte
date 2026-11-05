<script lang="ts">
	import LanguagesIcon from '@lucide/svelte/icons/languages';
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

	function choose(value: string) {
		// Close the menu first. The question may open a dialog.
		menuOpen = false;
		reload.choose(value as Locale);
	}
</script>

<DropdownMenu.Root bind:open={menuOpen}>
	<DropdownMenu.Trigger
		class={buttonVariants({ variant: 'ghost', size: 'sm', class: 'max-sm:px-2' })}
		aria-label={m.ui_language()}
	>
		<LanguagesIcon aria-hidden="true" />
		<span class="max-sm:sr-only">{labels[current]()}</span>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.RadioGroup value={current} onValueChange={choose}>
			{#each locales as locale (locale)}
				<DropdownMenu.RadioItem value={locale} lang={locale}
					>{labels[locale]()}</DropdownMenu.RadioItem
				>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
