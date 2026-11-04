<!-- Owner names as chips. Shows "+N" when there are more than `max` names. -->
<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';

	let { owners, max = 2 }: { owners: readonly string[]; max?: number } = $props();
	const shown = $derived(owners.slice(0, max));
	const hidden = $derived(owners.length - shown.length);
</script>

<span class="flex min-w-0 flex-wrap items-center gap-1">
	{#each shown as owner (owner)}
		<span
			class="inline-block max-w-28 truncate rounded-full bg-muted px-2 text-xs leading-5 text-foreground/80"
		>
			{owner}
		</span>
	{/each}
	{#if hidden > 0}
		<span
			class="inline-block rounded-full bg-muted px-2 text-xs leading-5 text-foreground/80"
			title={owners.slice(max).join(', ')}
		>
			{m.owner_more({ count: hidden })}
		</span>
	{/if}
</span>
