<!--
	The ready light: a small green dot. It renders nothing when it is off.
	It fades in with one soft pulse. Refer to docs/spec.md, section 3.4.
-->
<script lang="ts">
	import { scale } from 'svelte/transition';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/** The number of effective dependencies. 0 means off. */
		count: number;
		/** The label language. The default is the UI language. */
		locale?: 'en' | 'de' | 'zh-TW' | 'ja';
		/** Static output for print: no transition, no animation. */
		still?: boolean;
	}

	let { count, locale, still = false }: Props = $props();
	const label = $derived(m.ready_label({ count }, locale ? { locale } : undefined));
</script>

{#if count > 0}
	{#if still}
		<span
			class="ready-dot inline-block size-2 shrink-0 rounded-full bg-[#2E9D5B]"
			role="img"
			aria-label={label}
		></span>
	{:else}
		<span
			class="ready-dot inline-block size-2 shrink-0 rounded-full bg-ready motion-safe:animate-[ready-pulse_900ms_ease-out_1]"
			role="img"
			aria-label={label}
			title={label}
			transition:scale={{ duration: 220, start: 0.3 }}
			data-testid="ready-dot"
		></span>
	{/if}
{/if}

<style>
	@keyframes -global-ready-pulse {
		0% {
			box-shadow: 0 0 0 0 color-mix(in oklab, var(--ready) 70%, transparent);
		}
		100% {
			box-shadow: 0 0 0 6px color-mix(in oklab, var(--ready) 0%, transparent);
		}
	}
</style>
