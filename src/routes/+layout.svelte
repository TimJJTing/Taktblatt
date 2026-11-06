<script lang="ts">
	import { mode, ModeWatcher } from 'mode-watcher';
	import { Toaster } from '#lib/components/ui/sonner/index.ts';
	import * as Tooltip from '#lib/components/ui/tooltip/index.ts';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { KEYS } from '#lib/state/storage.ts';
	import { THEME_COLORS } from '#lib/theme.ts';
	import type { LayoutProps } from './$types';
	import './layout.css';

	let { children }: LayoutProps = $props();

	$effect(() => {
		document.documentElement.lang = getLocale();
	});

	// The startup script in app.html owns the only theme-color tag. ModeWatcher would add a
	// second tag after the start, so the layout keeps this tag current instead.
	$effect(() => {
		const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
		if (meta && mode.current) meta.content = THEME_COLORS[mode.current];
	});
</script>

<ModeWatcher defaultMode="system" modeStorageKey={KEYS.theme} disableTransitions />
<Toaster position="bottom-center" />
<Tooltip.Provider delayDuration={300}>
	{@render children()}
</Tooltip.Provider>
