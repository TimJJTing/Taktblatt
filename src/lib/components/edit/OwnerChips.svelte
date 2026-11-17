<!--
	Owner names as chips. Shows "+N" when there are more than `max` names.
	The chips have no hint. The parent shows `ownerListHint` in its own Hint, because the chips are
	often inside a trigger button.
-->
<script lang="ts" module>
	import { joinList } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	/** The default number of chips. */
	export const OWNER_CHIPS_MAX = 2;

	/** The full owner list when the chips hide names, else an empty string. */
	export function ownerListHint(owners: readonly string[], max = OWNER_CHIPS_MAX): string {
		return owners.length > max ? joinList(owners, uiIntl()) : '';
	}
</script>

<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';

	let { owners, max = OWNER_CHIPS_MAX }: { owners: readonly string[]; max?: number } = $props();
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
			class="inline-block rounded-full bg-muted px-2 text-xs leading-5 text-foreground/80 tabular-nums"
		>
			{m.owner_more({ count: hidden })}
		</span>
	{/if}
</span>
