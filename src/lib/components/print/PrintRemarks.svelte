<!--
	The remark sections on paper: rows of two sections. The paginator splits between rows only.
-->
<script lang="ts">
	import type { RemarksSegment } from '#lib/domain/print-model.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		segment: RemarksSegment;
		from: number;
		to: number;
		first: boolean;
	}

	let { segment, from, to, first }: Props = $props();
</script>

{#if first}
	<h2
		data-part="lead"
		class="pb-1.5 text-[10px] font-semibold tracking-wider text-paper-ink uppercase"
	>
		{m.section_remarks()}
	</h2>
{/if}
{#each segment.rows.slice(from, to) as sections, i (from + i)}
	<div data-item={from + i} class="grid grid-cols-2 gap-3 pb-3">
		{#each sections as section (section.id)}
			<section class="min-w-0 border border-paper-rule p-2.5" data-testid="sheet-remark">
				<h3 class="text-[11px] font-semibold text-paper-ink">
					{section.title || m.remark_untitled()}
				</h3>
				{#if section.bullets.length > 0}
					<ul
						class="mt-1 list-disc space-y-0.5 pl-4 text-[10px] whitespace-pre-wrap text-paper-ink-2"
					>
						{#each section.bullets as bullet, b (b)}<li>{bullet}</li>{/each}
					</ul>
				{/if}
			</section>
		{/each}
	</div>
{/each}
