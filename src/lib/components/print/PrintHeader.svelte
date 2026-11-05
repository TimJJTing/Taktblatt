<!--
	The header block of the first sheet: subheading, heading, plan range and objective.
	Empty parts do not show. Labels and dates use the UI language.
-->
<script lang="ts">
	import { formatRangeDisplay } from '#lib/domain/format.js';
	import { uiIntl } from '#lib/domain/locale.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';

	const ws = getWorkspace();
	const plan = $derived(ws.plan);
	const range = $derived(formatRangeDisplay(plan.range.start, plan.range.end, uiIntl()));
</script>

<div data-item="0" class="pb-1">
	{#if plan.subheading}
		<p class="text-[10px] tracking-wider whitespace-pre-wrap text-paper-ink-3 uppercase">
			{plan.subheading}
		</p>
	{/if}
	<h1 class="line-clamp-2 text-[24px] leading-tight font-semibold text-paper-ink">
		{plan.heading || m.untitled_plan()}
	</h1>
	<p class="mt-1 text-[11px] text-paper-ink-2">{range}</p>
	{#if plan.objective}
		<p class="mt-2 text-[11px] whitespace-pre-wrap text-paper-ink">
			<span class="font-medium">{m.field_objective()}</span>
			{plan.objective}
		</p>
	{/if}
</div>
