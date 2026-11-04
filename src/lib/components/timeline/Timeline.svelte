<!--
	The timeline section: the Gantt chart and three legends (stages, milestones, bands).
	A milestone or band in the chart or in a legend opens its dialog. The "+" buttons add a new one.
	Dates use the document language of the plan.
-->
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '#lib/components/ui/button/index.js';
	import { stageColorVar, bandTintVar } from '#lib/components/plan/colors.js';
	import { orderedMilestones } from '#lib/domain/derive.js';
	import { formatDate, formatRangeDisplay, intlLocale } from '#lib/domain/format.js';
	import type { Band, Milestone } from '#lib/domain/schema.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import BandDialog from './BandDialog.svelte';
	import Gantt from './Gantt.svelte';
	import MilestoneDialog from './MilestoneDialog.svelte';

	const ws = getWorkspace();
	let milestone = $state<Milestone | null | undefined>(undefined);
	let band = $state<Band | null | undefined>(undefined);
	const milestones = $derived(orderedMilestones(ws.plan.milestones));
	const locale = $derived(intlLocale(ws.plan.locale));
	const row = 'flex flex-wrap items-center gap-x-3 gap-y-2';
	const legend = 'flex flex-wrap items-center gap-x-4 gap-y-2';
	const entryButton =
		'flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring print:hidden';
</script>

{#snippet swatch(background: string)}
	<span class="size-2.5 shrink-0 rounded-sm" style:background aria-hidden="true"></span>
{/snippet}

<div class="space-y-3 text-sm">
	<Gantt onBand={(item) => (band = item)} onMilestone={(item) => (milestone = item)} />
	<div class={row}>
		<span class="font-medium" aria-hidden="true">{m.legend_stages()}</span>
		<ul class={legend} aria-label={m.legend_stages()} data-testid="stage-legend">
			{#each ws.plan.stages as stage, i (stage.id)}
				<li class="flex items-center gap-2">
					{@render swatch(stageColorVar(stage.color))}{stage.title ||
						m.stage_title_placeholder({ n: i + 1 })}
				</li>
			{/each}
		</ul>
	</div>
	<div class={row}>
		<span class="font-medium" aria-hidden="true">{m.legend_milestones()}</span>
		<ul class={legend} aria-label={m.legend_milestones()} data-testid="milestone-legend">
			{#each milestones as item (item.milestone.id)}
				{@const text = `${item.label} ${item.milestone.title} (${formatDate(item.milestone.date, locale)})`}
				<li>
					<button type="button" class={entryButton} onclick={() => (milestone = item.milestone)}
						>{text}</button
					>
					<span class="hidden print:inline">{text}</span>
				</li>
			{/each}
			<li class="print:hidden">
				<Button
					size="icon-sm"
					variant="outline"
					aria-label={m.milestone_add()}
					onclick={() => (milestone = null)}><PlusIcon aria-hidden="true" /></Button
				>
			</li>
		</ul>
	</div>
	<div class={row}>
		<span class="font-medium" aria-hidden="true">{m.legend_bands()}</span>
		<ul class={legend} aria-label={m.legend_bands()} data-testid="band-legend">
			{#each ws.plan.bands as item (item.id)}
				{@const text = `${item.title} (${formatRangeDisplay(item.start, item.end, locale)})`}
				<li>
					<button type="button" class={entryButton} onclick={() => (band = item)}
						>{@render swatch(bandTintVar(item.color))}{text}</button
					>
					<span class="hidden items-center gap-2 print:flex"
						>{@render swatch(bandTintVar(item.color))}{text}</span
					>
				</li>
			{/each}
			<li class="print:hidden">
				<Button
					size="icon-sm"
					variant="outline"
					aria-label={m.band_add()}
					onclick={() => (band = null)}><PlusIcon aria-hidden="true" /></Button
				>
			</li>
		</ul>
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
