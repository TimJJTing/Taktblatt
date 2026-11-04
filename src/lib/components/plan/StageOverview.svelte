<script lang="ts">
	import InlineText from '#lib/components/edit/InlineText.svelte';
	import { stageDeliverables, stageSpan } from '#lib/domain/derive.js';
	import { formatMonthSpan, intlLocale } from '#lib/domain/format.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { updateStage } from '#lib/state/commands.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import StageTitle from '#lib/components/plan/StageTitle.svelte';
	import { stageColorVar } from './colors.js';
	const ws = getWorkspace();
</script>

<div class="grid grid-cols-1 gap-4 md:grid-cols-3 print:grid-cols-3">
	{#each ws.plan.stages as stage, i (stage.id)}
		{@const span = stageSpan(ws.index, stage.id)}
		<article
			class="min-w-0 rounded-lg border p-4"
			data-testid="stage-card"
			style:border-top-color={stageColorVar(stage.color)}
		>
			<p class="mb-2 text-xs font-medium uppercase">
				{m.stage_label({ n: i + 1 })}{#if span}
					· {formatMonthSpan(span.start, span.end, intlLocale(getLocale()))}{/if}
			</p>
			<h3 class="mb-2 text-lg font-semibold">
				<StageTitle {stage} number={i + 1} testId="overview-stage-title" />
			</h3>
			<div class="text-sm print:line-clamp-3" class:print:hidden={!stage.description}>
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
