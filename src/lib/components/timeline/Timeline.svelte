<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '#lib/components/ui/button/index.js';
	import { stageColorVar, bandTintVar } from '#lib/components/plan/colors.js';
	import { orderedMilestones } from '#lib/domain/derive.js';
	import { formatDate, formatRangeDisplay, intlLocale } from '#lib/domain/format.js';
	import type { Band, Milestone } from '#lib/domain/schema.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import BandDialog from '#lib/components/timeline/BandDialog.svelte';
	import MilestoneDialog from '#lib/components/timeline/MilestoneDialog.svelte';
	import Gantt from '#lib/components/timeline/Gantt.svelte';
	const ws = getWorkspace();
	let milestone = $state<Milestone | null | undefined>(undefined);
	let band = $state<Band | null | undefined>(undefined);
	const milestones = $derived(orderedMilestones(ws.plan.milestones));
	const locale = $derived(intlLocale(getLocale()));
</script>

<div class="space-y-3 text-sm">
	<Gantt onBand={(item) => (band = item)} onMilestone={(item) => (milestone = item)} />
	<ul class="flex flex-wrap gap-x-5 gap-y-2" aria-label={m.legend_stages()}>
		{#each ws.plan.stages as stage, i (stage.id)}
			<li class="flex items-center gap-2">
				<span class="size-2.5 rounded-sm" style:background={stageColorVar(stage.color)}
				></span>{stage.title || m.stage_title_placeholder({ n: i + 1 })}
			</li>
		{/each}
	</ul>
	<div
		class="flex flex-wrap items-center gap-2"
		aria-label={m.legend_milestones()}
		data-testid="milestone-legend"
	>
		<span class="font-medium">{m.legend_milestones()}</span>
		{#each milestones as item (item.milestone.id)}
			{@const text = `${item.label} ${item.milestone.title} (${formatDate(item.milestone.date, locale)})`}
			<button
				type="button"
				class="rounded px-2 py-1 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring print:hidden"
				onclick={() => (milestone = item.milestone)}>{text}</button
			>
			<span class="hidden print:inline">{text}</span>
		{/each}
		<Button
			size="icon-sm"
			variant="outline"
			class="print:hidden"
			aria-label={m.milestone_add()}
			onclick={() => (milestone = null)}><PlusIcon aria-hidden="true" /></Button
		>
	</div>
	<div
		class="flex flex-wrap items-center gap-2"
		aria-label={m.legend_bands()}
		data-testid="band-legend"
	>
		<span class="font-medium">{m.legend_bands()}</span>
		{#each ws.plan.bands as item (item.id)}
			{@const text = `${item.title} (${formatRangeDisplay(item.start, item.end, locale)})`}
			<button
				type="button"
				class="rounded px-2 py-1 text-left focus-visible:outline-2 focus-visible:outline-ring print:hidden"
				style:background={bandTintVar(item.color)}
				onclick={() => (band = item)}>{text}</button
			>
			<span class="hidden print:inline">{text}</span>
		{/each}
		<Button
			size="icon-sm"
			variant="outline"
			class="print:hidden"
			aria-label={m.band_add()}
			onclick={() => (band = null)}><PlusIcon aria-hidden="true" /></Button
		>
	</div>
</div>
{#if milestone !== undefined}<MilestoneDialog
		entry={milestone ?? undefined}
		onClose={() => (milestone = undefined)}
	/>{/if}
{#if band !== undefined}<BandDialog
		entry={band ?? undefined}
		onClose={() => (band = undefined)}
	/>{/if}
