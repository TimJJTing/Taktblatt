<!--
	The paper sheets of the plan. Preview and print use this component (ADR 1, ADR 2).

	How it works:
	1. The print model lists the blocks of the plan (src/lib/domain/print-model.ts).
	2. A hidden copy of all blocks is rendered off-screen. The component measures each part of it.
	3. The paginator (src/lib/domain/paginate.ts) puts the measured blocks on sheets.
	4. The component renders the sheets with the same block components.

	The selected diagrams (viewer `printDiagrams`) come from the view registry, in print order (ADR 20).
	A landscape diagram is measured in a landscape sheet and prints on landscape sheets.

	The measurement runs again when the plan, the expand state, the selection or the paper size changes,
	and when the fonts finish loading. The measurement is synchronous after the first render,
	so a print that starts in the `beforeprint` event gets the sheets before the browser lays out the page.
	The sheets have fixed sizes. They show the current expand state. They have no controls and no motion.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { todayISO } from '#lib/domain/date.ts';
	import {
		buildPrintModel,
		itemCount,
		printToday,
		type DiagramOrientation,
		type PrintModelInput,
		type Segment
	} from '#lib/domain/print-model.ts';
	import { paginate, type Sheet, type SegmentInput } from '#lib/domain/paginate.ts';
	import { getViewRegistry } from '#lib/components/diagram/view-registry.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { createGanttPaperCache, type GanttPaperLayout } from '#lib/scene/gantt-fragment.ts';
	import { PAPER, SHEET_SAFETY } from './print-layout.ts';
	import SegmentView from './SegmentView.svelte';
	import SheetFooter from './SheetFooter.svelte';

	interface Props {
		/** True when the sheets show on the screen (preview). False when they show in print only. */
		screen: boolean;
	}

	let { screen }: Props = $props();

	const ws = getWorkspace();
	const viewer = getViewer();

	const registry = getViewRegistry();

	const paper = $derived(ws.plan.paper);
	const model = $derived.by(() => {
		const input: PrintModelInput = {
			plan: ws.plan,
			index: ws.index,
			isExpanded: (id) => viewer.isExpanded(ws.plan.id, id),
			today: printToday(ws.plan, todayISO())
		};
		const diagrams = registry.views
			.filter((view) => viewer.printDiagrams.includes(view.id))
			.map((view) => ({
				id: view.id,
				orientation: view.paper.orientation,
				segments: view.paper.segments(input)
			}));
		return buildPrintModel({ ...input, diagrams });
	});
	const orientationOf = (segment: Segment): DiagramOrientation => segment.orientation ?? 'portrait';
	const landscape = $derived(model.some((segment) => orientationOf(segment) === 'landscape'));
	const orientations = $derived<DiagramOrientation[]>(
		landscape ? ['portrait', 'landscape'] : ['portrait']
	);

	interface Layout {
		model: Segment[];
		sheets: Sheet[];
		/** The width of the sheet content in pixels, for each orientation. */
		width: Record<DiagramOrientation, number>;
		paper: Map<number, GanttPaperLayout>;
	}

	const paperCache = createGanttPaperCache();

	let measurer = $state<HTMLElement | null>(null);
	let layout = $state.raw<Layout | null>(null);

	/** The height of a part (lead, repeat header, extra block) of a segment. */
	function partHeight(segment: Element, name: string): number {
		const part = segment.querySelector(`[data-part="${name}"]`);
		return part ? Math.ceil(part.getBoundingClientRect().height) : 0;
	}

	function measure(): void {
		const content = (orientation: DiagramOrientation) =>
			measurer?.querySelector<HTMLElement>(`[data-measure-content="${orientation}"]`) ?? null;
		const portrait = content('portrait');
		const wide = content('landscape');
		if (!portrait) return;
		const box = portrait.getBoundingClientRect();
		const wideBox = wide?.getBoundingClientRect() ?? box;
		// A hidden ancestor gives a zero size. Keep the last layout then.
		if (box.height === 0 || box.width === 0) return;
		const segments = model;
		const width = { portrait: box.width, landscape: wideBox.width };
		const inputs: SegmentInput[] = segments.map((segment, i) => {
			const element = (content(orientationOf(segment)) ?? portrait).querySelector(
				`[data-segment="${i}"]`
			);
			const heights = element
				? Array.from(element.querySelectorAll('[data-item]')).map((item) =>
						Math.ceil(item.getBoundingClientRect().height)
					)
				: [];
			const count = itemCount(segment);
			// The block components and the model must agree. Pad or cut, so the pagination stays valid.
			while (heights.length < count) heights.push(heights.at(-1) ?? 0);
			heights.length = count;
			return {
				id: segment.id,
				lead: element ? partHeight(element, 'lead') : 0,
				repeat: element ? partHeight(element, 'repeat') : 0,
				extra: element ? partHeight(element, 'extra') : 0,
				items: heights,
				keep: segment.keep,
				gap: segment.gap,
				breakBefore: segment.breakBefore,
				orientation: orientationOf(segment)
			};
		});
		const contentHeight = {
			portrait: Math.floor(box.height) - SHEET_SAFETY,
			landscape: Math.floor(wideBox.height) - SHEET_SAFETY
		};
		const paperLayouts = new Map(
			segments.flatMap((segment, i) =>
				segment.kind === 'gantt'
					? [
							[
								i,
								paperCache.get(segment.rows, segment.lines, width[orientationOf(segment)])
							] as const
						]
					: []
			)
		);
		layout = {
			model: segments,
			sheets: paginate(contentHeight, inputs),
			width,
			paper: paperLayouts
		};
	}

	// Measure after each render of the hidden blocks. The effect reads the model and the paper size.
	$effect(() => {
		void model;
		void paper;
		void landscape;
		if (!measurer) return;
		untrack(measure);
	});

	// The fonts change the heights. Measure again when they are ready.
	$effect(() => {
		if (!measurer) return;
		const fonts = document.fonts;
		const again = () => untrack(measure);
		void fonts.ready.then(again);
		fonts.addEventListener('loadingdone', again);
		return () => fonts.removeEventListener('loadingdone', again);
	});
</script>

<div
	bind:this={measurer}
	class="sheet-measurer"
	aria-hidden="true"
	inert
	data-sheet-measurer
	style:--sheet-w={PAPER[paper].width}
	style:--sheet-h={PAPER[paper].height}
>
	{#each orientations as orientation (orientation)}
		<div class="sheet" data-orientation={orientation}>
			<div class="sheet-content" data-measure-content={orientation}>
				{#each model as segment, i (segment.id)}
					{#if orientationOf(segment) === orientation}
						<div data-segment={i}>
							<SegmentView {segment} from={0} to={itemCount(segment)} first={true} width={0} />
						</div>
					{/if}
				{/each}
			</div>
			<div class="sheet-footer"></div>
		</div>
	{/each}
</div>

<div
	class="sheet-list"
	class:sheet-list-screen={screen}
	class:sheet-list-print={!screen}
	style:--sheet-w={PAPER[paper].width}
	style:--sheet-h={PAPER[paper].height}
	data-testid="sheets"
	data-paper={paper}
	data-sheet-count={layout?.sheets.length}
	role="group"
	aria-label={m.preview_sheets()}
>
	{#if layout}
		{@const current = layout}
		{#each current.sheets as sheet (sheet.number)}
			<section
				class="sheet"
				aria-label={m.preview_sheet({ n: sheet.number, total: current.sheets.length })}
				data-testid="sheet"
				data-sheet-number={sheet.number}
				data-orientation={sheet.orientation}
			>
				<div class="sheet-content">
					{#each sheet.fragments as fragment (`${fragment.segment}-${fragment.from}`)}
						<div
							style:margin-top={fragment.gap > 0 ? `${fragment.gap}px` : undefined}
							data-fragment={fragment.id}
						>
							<SegmentView
								segment={current.model[fragment.segment]}
								from={fragment.from}
								to={fragment.to}
								first={fragment.first}
								width={current.width[sheet.orientation]}
								paper={current.paper.get(fragment.segment)}
							/>
						</div>
					{/each}
				</div>
				<div class="sheet-footer">
					<SheetFooter
						footer={ws.plan.footer}
						number={sheet.number}
						total={current.sheets.length}
					/>
				</div>
			</section>
		{/each}
	{/if}
</div>

<style>
	.sheet {
		box-sizing: border-box;
		width: var(--sheet-w);
		height: var(--sheet-h);
		padding: 14mm 15mm 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--color-paper);
		color: var(--color-paper-ink);
		color-scheme: light;
		/* Keep information fills when print background graphics are off. */
		-webkit-print-color-adjust: exact;
		print-color-adjust: exact;
		font-family: var(--font-sans);
		font-size: 11px;
		line-height: 1.35;
	}
	/* A landscape sheet swaps the sides of the same paper size. */
	.sheet[data-orientation='landscape'] {
		width: var(--sheet-h);
		height: var(--sheet-w);
	}
	.sheet-content {
		flex: 1 1 0;
		min-height: 0;
		display: flow-root;
	}
	.sheet-footer {
		flex: none;
		height: 14mm;
	}
	/* The measurer has a real layout but nobody sees it. */
	.sheet-measurer {
		position: fixed;
		top: 0;
		left: -100000px;
		visibility: hidden;
		pointer-events: none;
	}
	.sheet-list {
		flex-direction: column;
		align-items: center;
		gap: 16px;
	}
	.sheet-list-screen {
		display: flex;
	}
	.sheet-list-print {
		display: none;
	}
	.sheet-list-screen .sheet {
		flex: none;
	}
	/* The shadow is for the screen only. Print from the preview and direct print look the same. */
	@media screen {
		.sheet-list-screen .sheet {
			box-shadow: 0 1px 4px rgb(0 0 0 / 0.25);
		}
	}
	@media print {
		.sheet-measurer {
			display: none;
		}
		.sheet-list {
			display: block;
		}
		.sheet {
			break-after: page;
			break-inside: avoid;
			/* A little less than the page. This avoids an empty page from a rounding error. */
			height: calc(var(--sheet-h) - 0.3mm);
		}
		.sheet[data-orientation='landscape'] {
			page: taktblatt-landscape;
			height: calc(var(--sheet-w) - 0.3mm);
		}
		.sheet:last-child {
			break-after: auto;
		}
	}
</style>
