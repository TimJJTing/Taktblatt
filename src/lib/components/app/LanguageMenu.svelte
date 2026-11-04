<script lang="ts">
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, locales, setLocale, type Locale } from '#lib/paraglide/runtime.js';

	const labels: Record<Locale, () => string> = {
		en: m.ui_language_en,
		de: m.ui_language_de,
		'zh-TW': m.ui_language_zh_tw,
		ja: m.ui_language_ja
	};

	let current = $state(getLocale());

	function choose(value: string) {
		current = value as Locale;
		setLocale(current);
	}
</script>

<DropdownMenu.Root>
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
