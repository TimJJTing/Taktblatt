<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { KEYS } from '#lib/state/storage.js';
	import type { LayoutProps } from './$types';
	import './layout.css';

	let { children }: LayoutProps = $props();

	$effect(() => {
		document.documentElement.lang = getLocale();
	});
</script>

<ModeWatcher
	defaultMode="system"
	modeStorageKey={KEYS.theme}
	themeColors={{ light: '#ffffff', dark: '#0e0f13' }}
	disableTransitions
/>
<Toaster position="bottom-center" />
<Tooltip.Provider delayDuration={300}>
	{@render children()}
</Tooltip.Provider>
