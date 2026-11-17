<!--
	The stage overview on paper: rows of three cards. Cards in a row have the same height.
	The description has at most three lines. An empty description does not show.
-->
<script lang="ts">
	import { stagePaperColor } from '#lib/components/plan/colors.ts';
	import { formatMonthSpan } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import type { CardsSegment } from '#lib/domain/print-model.ts';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		segment: CardsSegment;
		from: number;
		to: number;
		first: boolean;
	}

	let { segment, from, to, first }: Props = $props();
	const intl = uiIntl();
</script>

{#if first}
	<h2
		data-part="lead"
		class="pb-1.5 text-[10px] font-semibold tracking-wider text-paper-ink uppercase"
	>
		{m.section_stage_overview()}
	</h2>
{/if}
{#each segment.rows.slice(from, to) as cards, i (from + i)}
	<div data-item={from + i} class="grid grid-cols-3 gap-3 pb-3">
		{#each cards as card (card.stage.id)}
			{@const label = m.stage_label({ n: card.number })}
			<article
				class="min-w-0 border border-t-[3px] border-paper-rule p-2.5"
				style:border-top-color={stagePaperColor(card.stage.color)}
				data-testid="sheet-stage-card"
			>
				<p class="text-[9px] font-medium tracking-wide text-paper-ink-3 uppercase tabular-nums">
					{card.span
						? m.label_qualifier({
								name: label,
								qualifier: formatMonthSpan(card.span.start, card.span.end, intl)
							})
						: label}
				</p>
				<h3 class="mt-1 text-[13px] leading-snug font-semibold text-paper-ink">
					{card.stage.title || m.stage_title_placeholder({ n: card.number })}
				</h3>
				{#if card.stage.description}
					<p class="mt-1 line-clamp-3 text-[10px] whitespace-pre-wrap text-paper-ink-2">
						{card.stage.description}
					</p>
				{/if}
				{#if card.deliverables.length > 0}
					<ul class="mt-1.5 list-disc space-y-0.5 pl-4 text-[10px] text-paper-ink-2">
						{#each card.deliverables as deliverable, d (d)}<li>{deliverable}</li>{/each}
					</ul>
				{/if}
			</article>
		{/each}
	</div>
{/each}
