<!--
	The header block of the first sheet: subheading, heading, plan range and objective.
	Empty parts do not show. Labels and dates use the document language.
-->
<script lang="ts">
	import { formatRangeDisplay, intlLocale } from '#lib/domain/format.js';
	import type { Locale } from '#lib/domain/schema.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';

	let { locale }: { locale: Locale } = $props();

	const ws = getWorkspace();
	const plan = $derived(ws.plan);
	const range = $derived(formatRangeDisplay(plan.range.start, plan.range.end, intlLocale(locale)));
</script>

<div data-item="0" class="pb-1">
	{#if plan.subheading}
		<p class="text-[10px] tracking-wider whitespace-pre-wrap text-paper-ink-3 uppercase">
			{plan.subheading}
		</p>
	{/if}
	<h1 class="line-clamp-2 text-[24px] leading-tight font-semibold text-paper-ink">
		{plan.heading || m.untitled_plan({}, { locale })}
	</h1>
	<p class="mt-1 text-[11px] text-paper-ink-2">{range}</p>
	{#if plan.objective}
		<p class="mt-2 text-[11px] whitespace-pre-wrap text-paper-ink">
			<span class="font-medium">{m.field_objective({}, { locale })}</span>
			{plan.objective}
		</p>
	{/if}
</div>
