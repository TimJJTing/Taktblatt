<!--
	The stage overview: one card for each stage with its number, months, title, description and deliverables.
	Title and description save on blur. The months and the deliverables come from the tasks.
	Dates use the UI language.
-->
<script lang="ts">
	import InlineText from '#lib/components/edit/InlineText.svelte';
	import { stageDeliverables, stageSpan } from '#lib/domain/derive.ts';
	import { formatMonthSpan } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { updateStage } from '#lib/state/commands.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { stageColorVar } from './colors.ts';
	import StageTitle from './StageTitle.svelte';
	const ws = getWorkspace();
</script>

<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
	{#each ws.plan.stages as stage, i (stage.id)}
		{@const span = stageSpan(ws.index, stage.id)}
		{@const label = m.stage_label({ n: i + 1 })}
		<article
			class="min-w-0 rounded-lg border p-4"
			data-testid="stage-card"
			style:border-top-color={stageColorVar(stage.color)}
		>
			<p class="mb-2 text-xs font-medium uppercase" data-testid="stage-card-label">
				{span
					? m.label_qualifier({
							name: label,
							qualifier: formatMonthSpan(span.start, span.end, uiIntl())
						})
					: label}
			</p>
			<h3 class="mb-2 text-lg font-semibold">
				<StageTitle {stage} number={i + 1} testId="overview-stage-title" />
			</h3>
			<div class="text-sm">
				<InlineText
					value={stage.description}
					label={m.field_description()}
					placeholder={m.description_placeholder()}
					multiline
					onCommit={(description) => updateStage(ws, stage.id, { description })}
					testId="stage-description"
				/>
			</div>
			<ul class="mt-3 list-disc space-y-1 pl-5 text-sm">
				{#each stageDeliverables(ws.index, stage.id) as deliverable, index (index)}<li>
						{deliverable}
					</li>{/each}
			</ul>
		</article>
	{/each}
</div>
