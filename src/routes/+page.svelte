<script lang="ts">
	import LanguageMenu from '#lib/components/app/LanguageMenu.svelte';
	import { m } from '#lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{m.app_name()}</title>
</svelte:head>

<header
	class="sticky top-0 z-30 flex h-12 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur"
>
	<span class="font-semibold">{m.app_name()}</span>
	<span class="text-sm text-muted-foreground">{m.app_tagline()}</span>
	<div class="ml-auto"><LanguageMenu /></div>
</header>

<main class="mx-auto max-w-6xl px-4 py-8"></main>
