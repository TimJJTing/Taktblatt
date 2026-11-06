<!--
	The ready light: a small green dot. It fades in with one soft pulse.
	When it is off, it renders nothing. Set `reserve` in rows: then it keeps an empty slot,
	so that titles stay aligned. Refer to docs/spec.md, section 3.4.
-->
<script lang="ts">
	import { scale } from 'svelte/transition';
	import Hint from '#lib/components/app/Hint.svelte';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/** The number of effective dependencies. 0 means off. */
		count: number;
		/** Static output for print: no transition, no animation. */
		still?: boolean;
		/** Keep the slot when the light is off, so that the next element does not move. */
		reserve?: boolean;
	}

	let { count, still = false, reserve = false }: Props = $props();
	const label = $derived(m.ready_label({ count }));
</script>

{#snippet light()}
	{#if count > 0}
		{#if still}
			<span
				class="ready-dot inline-block size-2 shrink-0 rounded-full bg-[#2E9D5B]"
				role="img"
				aria-label={label}
			></span>
		{:else}
			<!-- The transition is on this wrapper. A local transition inside the Hint does not play. -->
			<span
				class="inline-flex shrink-0"
				transition:scale={{ duration: motionDuration(220), start: 0.3 }}
			>
				<Hint text={label} focusable={false}>
					{#snippet child({ props })}
						<span
							{...props}
							class="ready-dot inline-block size-2 shrink-0 rounded-full bg-ready motion-safe:animate-[ready-pulse_900ms_ease-out_1]"
							style:animation-duration={`${motionDuration(900)}ms`}
							role="img"
							aria-label={label}
							data-testid="ready-dot"
						></span>
					{/snippet}
				</Hint>
			</span>
		{/if}
	{/if}
{/snippet}

{#if reserve}
	<span class="flex size-2 shrink-0">{@render light()}</span>
{:else}
	{@render light()}
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
