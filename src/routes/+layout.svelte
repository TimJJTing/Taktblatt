<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import './layout.css';

	let { children }: LayoutProps = $props();

	$effect(() => {
		document.documentElement.lang = getLocale();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!-- The theme follows the system setting. -->
<ModeWatcher defaultMode="system" disableTransitions />
<Toaster position="bottom-center" />
<Tooltip.Provider delayDuration={300}>
	{@render children()}
</Tooltip.Provider>
