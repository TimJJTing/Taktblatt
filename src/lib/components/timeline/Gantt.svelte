<!--
	The Gantt chart of the plan. Refer to docs/spec.md, section 5.4.
	A label column and a timeline area. The timeline area has a minimum width, so the chart scrolls
	horizontally on a phone. Bands, the today line and the dependency lines are behind the bars.
	The pin keeps the chart below the app header. The chart then has its own vertical scroll.
-->
<script lang="ts">
	import PinIcon from '@lucide/svelte/icons/pin';
	import { untrack } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { innerHeight } from 'svelte/reactivity/window';
	import { appHeader } from '#lib/components/app/app-layout.svelte.js';
	import { Toggle } from '#lib/components/ui/toggle/index.js';
	import { bandFill, bandTintVar, stageColorVar } from '#lib/components/plan/colors.js';
	import { todayISO } from '#lib/domain/date.js';
	import { formatDate, formatMonth, formatRangeDisplay } from '#lib/domain/format.js';
	import { uiIntl } from '#lib/ui-language.js';
	import {
		dependencyLines,
		ganttRows,
		monthTicks,
		todayX,
		visibleBands,
		visibleMilestones
	} from '#lib/domain/gantt.js';
	import type { Band, Milestone } from '#lib/domain/schema.js';
	import { motionDuration } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getEditing } from '#lib/state/editing.svelte.js';
	import { getViewer } from '#lib/state/viewer.svelte.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import { cn } from '#lib/utils.js';
	import GanttLine from './GanttLine.svelte';
	import GanttRow from './GanttRow.svelte';
	import {
		HEADER_HEIGHT,
		heightLimits,
		LABEL_WIDTH,
		MILESTONE_ROW_HEIGHT,
		pinnedHeight,
		ROW_HEIGHT,
		ROW_MOTION_MS,
		TIMELINE_MIN_WIDTH
	} from './gantt-layout.js';
	import { MILESTONE_SYMBOLS } from './milestone-symbols.js';

	interface Props {
		onBand: (band: Band) => void;
		onMilestone: (milestone: Milestone) => void;
	}

	let { onBand, onMilestone }: Props = $props();

	const ws = getWorkspace();
	const viewer = getViewer();
	const editing = getEditing();

	const MARKER_ID = 'gantt-arrow';

	const win = $derived(ws.plan.range);
	const locale = uiIntl();
	const colors = $derived(new Map(ws.plan.stages.map((s) => [s.id, stageColorVar(s.color)])));
	const rows = $derived(
		ganttRows(
			ws.index,
			ws.plan.stages.map((s) => s.id),
			(id) => viewer.isExpanded(ws.plan.id, id),
			win
		)
	);
	const lines = $derived(dependencyLines(ws.index, rows));
	const ticks = $derived(monthTicks(win));
	// Today changes at local midnight. A hidden tab can miss the timer, so check again when it shows.
	let todayDate = $state(todayISO());
	$effect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const refresh = () => {
			todayDate = todayISO();
			clearTimeout(timer);
			const now = new Date();
			const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
			timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 1000);
		};
		const onVisibility = () => {
			if (document.visibilityState === 'visible') refresh();
		};
		refresh();
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
	const today = $derived(todayX(win, todayDate));
	const bands = $derived(visibleBands(win, ws.plan.bands));
	const milestones = $derived(visibleMilestones(win, ws.plan.milestones));

	const bodyHeight = new Tween(untrack(() => rows.length * ROW_HEIGHT));
	$effect(() => {
		bodyHeight.set(rows.length * ROW_HEIGHT, {
			duration: motionDuration(ROW_MOTION_MS),
			easing: cubicOut
		});
	});

	let timelineWidth = $state(TIMELINE_MIN_WIDTH);
	let slot = $state<HTMLDivElement | null>(null);
	let scroller = $state<HTMLDivElement | null>(null);
	let boxHeight = $state(0);

	// Pin. The app header is sticky. Its height is the top offset of the pinned chart.
	const headerHeight = $derived(appHeader.height);
	let stuck = $state(false);
	let slotBox = $state({ left: 0, width: 0 });
	const viewport = $derived(innerHeight.current ?? 800);
	const limits = $derived(heightLimits(viewport));
	const height = $derived(pinnedHeight(viewer.ganttHeight, viewport));
	const percent = (px: number) => Math.round((px / viewport) * 100);

	// While pinned, share the chart height. Anchor jumps then stop below the chart.
	const pinnedOffset = $derived(viewer.ganttPinned ? boxHeight || height : 0);
	$effect(() => {
		const root = document.documentElement;
		if (pinnedOffset === 0) {
			root.style.removeProperty('--gantt-pinned-h');
			return;
		}
		root.style.setProperty('--gantt-pinned-h', `${pinnedOffset}px`);
		return () => root.style.removeProperty('--gantt-pinned-h');
	});

	function updateStuck() {
		if (!slot) return;
		const rect = slot.getBoundingClientRect();
		stuck = viewer.ganttPinned && rect.top < headerHeight;
		slotBox = { left: rect.left, width: rect.width };
	}

	$effect(() => {
		void [viewer.ganttPinned, headerHeight, slot];
		untrack(updateStuck);
	});

	function setHeight(px: number) {
		const clamped = Math.min(limits.max, Math.max(limits.min, px));
		viewer.setGanttHeight(clamped / viewport);
	}

	function onSeparatorKey(event: KeyboardEvent) {
		const step = viewport * 0.02;
		const page = viewport * 0.1;
		const next: Record<string, number> = {
			ArrowDown: height + step,
			ArrowUp: height - step,
			PageDown: height + page,
			PageUp: height - page,
			Home: limits.min,
			End: limits.max
		};
		if (!(event.key in next)) return;
		event.preventDefault();
		setHeight(next[event.key]);
	}

	let drag: { y: number; height: number } | null = null;
	function onSeparatorDown(event: PointerEvent) {
		if (event.button !== 0) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		drag = { y: event.clientY, height };
		event.preventDefault();
	}
	function onSeparatorMove(event: PointerEvent) {
		if (drag) setHeight(drag.height + event.clientY - drag.y);
	}
	function onSeparatorUp() {
		drag = null;
	}

	const scrollBehavior = (): ScrollBehavior => (motionDuration(1) === 0 ? 'instant' : 'smooth');

	// Linked highlight. Remember the id that the Gantt set, so the pinned chart does not scroll for it.
	let ownHighlight: string | null = null;
	function onHighlight(id: string, on: boolean) {
		if (on) {
			ownHighlight = id;
			editing.highlightId = id;
		} else if (editing.highlightId === id) {
			editing.highlightId = null;
			ownHighlight = null;
		}
	}

	$effect(() => {
		const id = editing.highlightId;
		if (!viewer.ganttPinned || id === null || id === ownHighlight) return;
		untrack(() => showInChart(id));
	});

	/** Scrolls the pinned chart (not the window) so that the row of the task is visible. */
	function showInChart(id: string) {
		const row = scroller?.querySelector<HTMLElement>(
			`[data-testid="gantt-row"][data-task-id="${CSS.escape(id)}"]`
		);
		if (!scroller || !row) return;
		const view = scroller.getBoundingClientRect();
		const rect = row.getBoundingClientRect();
		const top = view.top + HEADER_HEIGHT;
		const delta =
			rect.top < top ? rect.top - top : rect.bottom > view.bottom ? rect.bottom - view.bottom : 0;
		if (delta !== 0) scroller.scrollBy({ top: delta, behavior: scrollBehavior() });
	}

	/** Scrolls to the table row of the task and flashes it one time. */
	function jump(id: string) {
		const row = document.querySelector<HTMLElement>(`tr[data-task-id="${CSS.escape(id)}"]`);
		if (!row) return;
		const behavior = scrollBehavior();
		if (viewer.ganttPinned) {
			// The same offset as the scroll-mt-anchor class: header, pinned chart and 1rem.
			const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
			const offset = headerHeight + pinnedOffset + rem;
			window.scrollTo({ top: row.getBoundingClientRect().top + window.scrollY - offset, behavior });
		} else {
			row.scrollIntoView({ block: 'center', behavior });
		}
		editing.flash(id);
	}
</script>

<svelte:window onscroll={updateStuck} onresize={updateStuck} />

<div bind:this={slot} style:height={stuck ? `${boxHeight}px` : undefined}>
	<div
		bind:offsetHeight={boxHeight}
		role="group"
		aria-label={m.gantt_label()}
		class={cn(
			'rounded-md border bg-background [--gantt-label-width:128px] sm:[--gantt-label-width:192px]',
			viewer.ganttPinned && 'flex h-(--gantt-height) flex-col',
			stuck &&
				'fixed top-(--gantt-top) left-(--gantt-left) z-30 w-(--gantt-width) rounded-t-none shadow-md'
		)}
		style:--gantt-height="{height}px"
		style:--gantt-top="{headerHeight}px"
		style:--gantt-left="{slotBox.left}px"
		style:--gantt-width="{slotBox.width}px"
		data-testid="gantt"
		data-pinned={viewer.ganttPinned || undefined}
	>
		<div
			bind:this={scroller}
			class={cn(
				'overflow-x-auto',
				viewer.ganttPinned ? 'min-h-0 flex-1 overflow-y-auto' : 'overflow-y-hidden'
			)}
			data-testid="gantt-scroller"
		>
			<div class="relative" style:min-width="calc({LABEL_WIDTH} + {TIMELINE_MIN_WIDTH}px)">
				<div class="sticky top-0 z-20 flex border-b bg-background" style:height="{HEADER_HEIGHT}px">
					<div
						class="sticky left-0 z-10 flex w-(--gantt-label-width) shrink-0 items-center border-r bg-background px-1"
					>
						<Toggle
							size="sm"
							class="h-6 min-w-6 px-1.5"
							aria-label={m.gantt_pin()}
							title={m.gantt_pin()}
							pressed={viewer.ganttPinned}
							onPressedChange={(value) => viewer.setGanttPinned(value)}
							data-testid="gantt-pin"
						>
							<PinIcon aria-hidden="true" class={cn(viewer.ganttPinned && 'fill-current')} />
						</Toggle>
					</div>
					<div class="relative flex-1 text-xs text-muted-foreground">
						{#each ticks as t (t.month)}
							<div
								class="absolute inset-y-0 flex items-center overflow-hidden border-l px-1 whitespace-nowrap first:border-l-0"
								style:left="{t.x0 * 100}%"
								style:width="{(t.x1 - t.x0) * 100}%"
							>
								<span class="truncate">{formatMonth(t.month, locale)}</span>
							</div>
						{/each}
					</div>
				</div>

				<div
					class="pointer-events-none relative z-[1] flex"
					style:height="{MILESTONE_ROW_HEIGHT}px"
				>
					<div
						class="sticky left-0 z-10 flex w-(--gantt-label-width) shrink-0 items-center border-r bg-background px-2 text-xs text-muted-foreground"
					>
						{m.legend_milestones()}
					</div>
					<div class="relative flex-1">
						{#each milestones as item (item.milestone.id)}
							{@const Symbol = MILESTONE_SYMBOLS[item.milestone.symbol]}
							<button
								type="button"
								class="pointer-events-auto absolute top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-sm pr-1 text-xs font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
								style:left="calc({item.x * 100}% - 7px)"
								aria-label={m.gantt_milestone({
									label: item.label,
									title: item.milestone.title,
									date: formatDate(item.milestone.date, locale)
								})}
								title="{item.label} {item.milestone.title}"
								onclick={() => onMilestone(item.milestone)}
								data-testid="gantt-milestone"
							>
								<Symbol class="size-3.5 fill-current" />{item.label}
							</button>
						{/each}
					</div>
				</div>

				<div class="pointer-events-none relative z-[1]" style:height="{bodyHeight.current}px">
					{#each rows as row (row.id)}
						<GanttRow
							{row}
							color={colors.get(row.stageId) ?? 'currentColor'}
							highlighted={editing.highlightId === row.id}
							onJump={jump}
							{onHighlight}
						/>
					{/each}
				</div>

				<div
					class="absolute right-0 bottom-0 left-(--gantt-label-width) z-0"
					style:top="{HEADER_HEIGHT}px"
					bind:clientWidth={timelineWidth}
				>
					{#each ticks.slice(1) as t (t.month)}
						<div
							class="absolute inset-y-0 border-l border-border/60"
							style:left="{t.x0 * 100}%"
						></div>
					{/each}
					{#each bands as item (item.band.id)}
						{@const name = m.gantt_band({
							title: item.band.title,
							range: formatRangeDisplay(item.band.start, item.band.end, locale)
						})}
						<button
							type="button"
							class="absolute inset-y-0 overflow-hidden text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
							style:left="{item.x0 * 100}%"
							style:width="{(item.x1 - item.x0) * 100}%"
							style:background={bandFill(bandTintVar(item.band.color))}
							aria-label={name}
							title={name}
							onclick={() => onBand(item.band)}
							data-testid="gantt-band"
						>
							<span
								class="absolute bottom-0.5 left-1 max-w-full truncate pr-1 text-[10px] text-muted-foreground"
								aria-hidden="true">{item.band.title}</span
							>
						</button>
					{/each}
					{#if today !== null}
						<div
							class="pointer-events-none absolute inset-y-0 border-l border-dashed border-foreground/60"
							style:left="{today * 100}%"
							data-testid="gantt-today"
						>
							<span
								class="absolute top-0.5 left-1 rounded-sm bg-background/80 px-0.5 text-[10px] leading-tight font-medium"
								>{m.gantt_today()}</span
							>
						</div>
					{/if}
					<svg
						class="pointer-events-none absolute inset-0 size-full overflow-visible text-muted-foreground"
						aria-hidden="true"
					>
						<defs>
							<marker
								id={MARKER_ID}
								viewBox="0 0 6 6"
								refX="5"
								refY="3"
								markerWidth="6"
								markerHeight="6"
								orient="auto"
							>
								<path d="M 0 0 L 6 3 L 0 6 z" fill="currentColor" />
							</marker>
						</defs>
						{#each lines as line (line.key)}
							{@const done = rows[line.row0].done === 'done'}
							<GanttLine {line} {done} width={timelineWidth} marker={MARKER_ID} />
						{/each}
					</svg>
				</div>
			</div>
		</div>
		{#if viewer.ganttPinned}
			<!-- A focusable separator is a widget (WAI-ARIA window splitter). -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
			<div
				role="separator"
				aria-orientation="horizontal"
				aria-label={m.gantt_resize()}
				aria-valuenow={percent(height)}
				aria-valuemin={percent(limits.min)}
				aria-valuemax={percent(limits.max)}
				aria-valuetext="{percent(height)} %"
				tabindex="0"
				class="flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center border-t hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
				onkeydown={onSeparatorKey}
				onpointerdown={onSeparatorDown}
				onpointermove={onSeparatorMove}
				onpointerup={onSeparatorUp}
				onpointercancel={onSeparatorUp}
				data-testid="gantt-resize"
			>
				<span class="h-1 w-10 rounded-full bg-border" aria-hidden="true"></span>
			</div>
		{/if}
	</div>
</div>
