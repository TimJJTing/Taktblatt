<!--
	One legend row of the timeline: stages, milestones or bands.
	It is static text. Entries have no buttons. Dates use the document language.
-->
<script lang="ts">
	import { bandPaperTint, bandFill, stagePaperColor } from '#lib/components/plan/colors.js';
	import { orderedMilestones } from '#lib/domain/derive.js';
	import { formatDate, formatRangeDisplay, intlLocale } from '#lib/domain/format.js';
	import type { LegendSegment } from '#lib/domain/print-model.js';
	import type { Locale } from '#lib/domain/schema.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';

	let { segment, locale }: { segment: LegendSegment; locale: Locale } = $props();

	const ws = getWorkspace();
	const intl = $derived(intlLocale(locale));
	const title = $derived(
		segment.which === 'stages'
			? m.legend_stages({}, { locale })
			: segment.which === 'milestones'
				? m.legend_milestones({}, { locale })
				: m.legend_bands({}, { locale })
	);
</script>

<div
	data-item="0"
	class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[10px] text-paper-ink"
>
	<span class="font-medium" aria-hidden="true">{title}</span>
	<ul class="flex flex-wrap gap-x-3 gap-y-0.5" aria-label={title}>
		{#if segment.which === 'stages'}
			{#each ws.plan.stages as stage, i (stage.id)}
				<li class="flex items-center gap-1.5">
					<span
						class="size-2 shrink-0 rounded-[1px]"
						style:background={stagePaperColor(stage.color)}
						aria-hidden="true"
					></span>{stage.title || m.stage_title_placeholder({ n: i + 1 }, { locale })}
				</li>
			{/each}
		{:else if segment.which === 'milestones'}
			{#each orderedMilestones(ws.plan.milestones) as item (item.milestone.id)}
				<li>{item.label} {item.milestone.title} ({formatDate(item.milestone.date, intl)})</li>
			{/each}
		{:else}
			{#each ws.plan.bands as band (band.id)}
				<li class="flex items-center gap-1.5">
					<span
						class="size-2 shrink-0 rounded-[1px] border border-paper-rule"
						style:background={bandFill(bandPaperTint(band.color))}
						aria-hidden="true"
					></span>{band.title} ({formatRangeDisplay(band.start, band.end, intl)})
				</li>
			{/each}
		{/if}
	</ul>
</div>
