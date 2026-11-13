<!--
	The Gantt chart of the plan. Refer to docs/spec.md, section 5.4.
	A label column and a timeline area. The timeline area has a minimum width, so the chart scrolls
	horizontally on a phone. Bands, the today line and the dependency lines are behind the bars.
	Timeline owns the pin and section height. The pinned chart has its own vertical scroll.
-->
<script lang="ts">
	import { overlayScrollbar } from '#lib/components/app/overlay-scrollbar.ts';
	import { mergeProps } from 'bits-ui';
	import { onMount, tick, untrack } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		isTimelinePinned,
		workspaceLayout,
		pinnedTimeline
	} from '#lib/components/app/app-layout.svelte.ts';
	import Hint from '#lib/components/app/Hint.svelte';
	import {
		bandFill,
		bandTintVar,
		stageColorVar,
		type RoutePaint
	} from '#lib/components/plan/colors.ts';
	import { isFinished } from '#lib/domain/derive.ts';
	import { effectiveDependencyGraph, routeFocusModel } from '#lib/domain/route.ts';
	import type { EdgeGeom, Junction } from '#lib/scene/types.ts';
	import { cn } from '#lib/utils.ts';
	import { formatDate, formatMonth, formatRangeDisplay } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import {
		dependencyLines,
		ganttRows,
		monthTicks,
		todayX,
		visibleBands,
		visibleMilestones
	} from '#lib/domain/gantt.ts';
	import { GEOMETRY_MOTION_MS, motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getEditing } from '#lib/state/editing.svelte.ts';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { ganttScene } from '#lib/scene/gantt-scene.ts';
	import { SCREEN_ROUTE_METRICS } from '#lib/scene/route-tracks.ts';
	import DiagramRing from '#lib/components/diagram/DiagramRing.svelte';
	import { diagramRouteTargets } from '#lib/components/diagram/diagram-layer.ts';
	import type { DiagramViewProps } from '#lib/components/diagram/view-contract.ts';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import GanttLine from './GanttLine.svelte';
	import GanttRow from './GanttRow.svelte';
	import TodayTag from './TodayTag.svelte';
	import GanttTween from './GanttTween.svelte';
	import {
		HEADER_HEIGHT,
		LABEL_WIDTH,
		MILESTONE_ROW_HEIGHT,
		ROW_HEIGHT,
		TIMELINE_MIN_WIDTH
	} from './gantt-layout.ts';
	import { MILESTONE_SYMBOLS } from './milestone-symbols.ts';

	let { todayDate, class: className, onBand, onMilestone, onReveal }: DiagramViewProps = $props();

	const ws = getWorkspace();
	const viewer = getViewer();
	const editing = getEditing();

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
	// An outgoing stage layer has no intended ids, so its targets stop taking route input.
	const routeTargets = diagramRouteTargets(() => rows.map((row) => row.id));
	const lines = $derived(dependencyLines(ws.index, rows));
	const graph = $derived(effectiveDependencyGraph(ws.index));
	const routeModel = $derived(routeFocusModel(graph, ws.index, rows, lines, editing.routeId));
	const routePaint = (lit: boolean): RoutePaint =>
		routeModel.active ? (lit ? 'lit' : 'off') : null;

	const ticks = $derived(monthTicks(win));
	const today = $derived(todayX(win, todayDate));
	const bands = $derived(visibleBands(win, ws.plan.bands));
	const milestones = $derived(visibleMilestones(win, ws.plan.milestones));
	let milestoneTweens = $state.raw(new Map<string, GeometryTween<number>>());
	const milestoneFractions = $derived(
		milestones.map((item) => milestoneTweens.get(item.milestone.id)?.current ?? item.x)
	);
	$effect(() => {
		const targets = milestones;
		// Only destination changes start tweens. Current positions drive drawing and tag placement.
		const previous = untrack(() => milestoneTweens);
		milestoneTweens = new Map(
			targets.map((item) => {
				const tween = previous.get(item.milestone.id) ?? new GeometryTween(item.x);
				tween.set(item.x);
				return [item.milestone.id, tween];
			})
		);
	});

	const todayPosition = new Tween(untrack(() => today ?? 0));
	let previousToday = untrack(() => today);
	$effect(() => {
		const target = today;
		const duration = motionDuration(GEOMETRY_MOTION_MS);
		untrack(() => {
			if (target !== null) {
				todayPosition.set(target, {
					duration: previousToday === null ? 0 : duration,
					easing: cubicOut
				});
			}
			previousToday = target;
		});
	});

	const bodyHeight = new GeometryTween(untrack(() => rows.length * ROW_HEIGHT));
	$effect(() => {
		bodyHeight.set(rows.length * ROW_HEIGHT);
	});

	let timelineWidth = $state(TIMELINE_MIN_WIDTH);
	const scene = $derived(
		ganttScene(rows, lines, {
			...SCREEN_ROUTE_METRICS(timelineWidth, rows.length),
			media: 'screen'
		})
	);
	const marks = $derived(new Map(scene.marks.map((m) => [m.id, m])));
	const sourceRows = $derived(new Map(rows.map((r) => [r.id, r])));
	const sortedEdges = $derived(
		[...scene.geometry.edges].sort(
			(a, b) =>
				Number(a.cycle) - Number(b.cycle) ||
				Number(isFinished(sourceRows.get(b.from)!.status)) -
					Number(isFinished(sourceRows.get(a.from)!.status)) ||
				a.key.localeCompare(b.key)
		)
	);
	const edgePoints = (line: EdgeGeom, width: number) =>
		line.points.map((p) => ({ x: p.x.f * width + p.x.px, y: p.y.px }));
	let edgeTweens = $state.raw(new Map<string, GeometryTween<{ x: number; y: number }[]>>());
	$effect(() => {
		const targets = scene.geometry.edges;
		const width = timelineWidth;
		const previous = untrack(() => edgeTweens);
		edgeTweens = new Map(
			targets.map((line) => {
				const points = edgePoints(line, width);
				const tween = previous.get(line.key) ?? new GeometryTween(points, width);
				tween.set(points, { width });
				return [line.key, tween];
			})
		);
	});
	const litEdges = $derived(
		sortedEdges.filter((line) => !line.cycle && routeModel.litLineKeys.has(line.key))
	);
	const firstCycle = $derived(sortedEdges.find((line) => line.cycle)?.key);
	const edgePath = (line: EdgeGeom) =>
		(edgeTweens.get(line.key)?.current ?? edgePoints(line, timelineWidth))
			.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`)
			.join(' ');
	const lineWidth = (line: EdgeGeom) =>
		sourceRows.get(line.from)!.level === 1 && sourceRows.get(line.to)!.level === 1 ? 1.5 : 2;
	const tapMembers = $derived.by(() => {
		const members = new SvelteMap<string, SvelteMap<string, string[]>>();
		for (const edge of scene.geometry.edges) {
			let sources = members.get(edge.trunk);
			if (!sources) members.set(edge.trunk, (sources = new SvelteMap()));
			let keys = sources.get(edge.from);
			if (!keys) sources.set(edge.from, (keys = []));
			keys.push(edge.key);
		}
		return members;
	});
	function junctionPaint(junction: Junction) {
		const members =
			junction.kind === 'tap'
				? (tapMembers.get(junction.trunk)?.get(junction.source!) ?? [])
				: (junction.edges ?? []);
		return routePaint(members.some((key) => routeModel.litLineKeys.has(key)));
	}
	const tapRoutes = $derived(
		new Map(
			scene.geometry.junctions
				.filter((j) => j.kind === 'tap')
				.flatMap((j) => {
					const paint = junctionPaint(j);
					return paint ? [[j.key, paint] as const] : [];
				})
		)
	);
	function routeFade(_node: Element, { casing = false } = {}) {
		return {
			duration: motionDuration(150),
			css: (t: number) =>
				`stroke: color-mix(in oklab, var(${casing ? '--route-ground' : '--route-ink'}) ${t * 100}%, transparent)`
		};
	}
	function measureTimeline(element: HTMLElement) {
		const measure = () => {
			const next = element.clientWidth;
			if (next !== timelineWidth) timelineWidth = next;
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return {
			destroy() {
				observer.disconnect();
			}
		};
	}
	let scroller = $state<HTMLDivElement | null>(null);

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

	let hoveredRow: HTMLElement | null = null;
	let hoverFrame: number | undefined;
	let hoverPoint = { x: 0, y: 0 };
	function setHoveredRow(row: HTMLElement | null) {
		if (row === hoveredRow) return;
		if (hoveredRow) {
			editing.routeFocus.hoverLeave(editing.routeFocus.tokenFor(hoveredRow));
			onHighlight(hoveredRow.dataset.routeTarget!, false);
		}
		hoveredRow = row;
		if (row) {
			editing.routeFocus.hoverEnter(row.dataset.routeTarget!, editing.routeFocus.tokenFor(row));
			onHighlight(row.dataset.routeTarget!, true);
		}
	}

	function updateChartHover(chart: HTMLElement) {
		if (!scroller) return;
		const view = scroller.getBoundingClientRect();
		const bounds = chart.getBoundingClientRect();
		let next: HTMLElement | null = null;
		// The sticky header can cover rows after a vertical scroll.
		if (
			hoverPoint.x >= view.left &&
			hoverPoint.x < view.right &&
			hoverPoint.y >=
				Math.max(view.top + HEADER_HEIGHT, bounds.top + HEADER_HEIGHT + MILESTONE_ROW_HEIGHT) &&
			hoverPoint.y < view.bottom
		) {
			// Read the animated row positions before updating highlight paint.
			for (const row of chart.querySelectorAll<HTMLElement>(
				'[data-route-target]:not([data-route-focus])'
			)) {
				if (!sourceRows.has(row.dataset.routeTarget!)) continue;
				const rect = row.getBoundingClientRect();
				if (
					hoverPoint.x >= rect.left &&
					hoverPoint.x < rect.right &&
					hoverPoint.y >= rect.top &&
					hoverPoint.y < rect.bottom
				) {
					next = row;
					break;
				}
			}
		}
		setHoveredRow(next);
	}

	function chartPointerMove(event: PointerEvent) {
		if (event.pointerType === 'touch') return;
		hoverPoint = { x: event.clientX, y: event.clientY };
		if (hoverFrame !== undefined) return;
		const chart = event.currentTarget as HTMLElement;
		hoverFrame = requestAnimationFrame(() => {
			hoverFrame = undefined;
			updateChartHover(chart);
		});
	}

	function chartPointerDown(event: PointerEvent) {
		if (event.pointerType === 'touch' || hoverFrame === undefined) return;
		// Apply pending hover before a chevron click clears its linked highlight.
		cancelAnimationFrame(hoverFrame);
		hoverFrame = undefined;
		hoverPoint = { x: event.clientX, y: event.clientY };
		updateChartHover(event.currentTarget as HTMLElement);
	}

	function clearChartHover() {
		if (hoverFrame !== undefined) cancelAnimationFrame(hoverFrame);
		hoverFrame = undefined;
		setHoveredRow(null);
	}
	function chartPointerLeave(event: PointerEvent) {
		if (event.pointerType !== 'touch') clearChartHover();
	}
	let hoverPlanId = untrack(() => ws.plan.id);
	$effect(() => {
		const planId = ws.plan.id;
		const currentRows = sourceRows;
		untrack(() => {
			if (
				planId !== hoverPlanId ||
				(hoveredRow && !currentRows.has(hoveredRow.dataset.routeTarget!))
			)
				clearChartHover();
			hoverPlanId = planId;
		});
	});
	onMount(() => clearChartHover);

	$effect(() => {
		const id = editing.highlightId;
		if (!isTimelinePinned(viewer) || id === null || id === ownHighlight) return;
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
		const next = Math.min(
			scroller.scrollHeight - scroller.clientHeight,
			Math.max(0, scroller.scrollTop + delta)
		);
		const moved = next - scroller.scrollTop;
		const behavior = scrollBehavior();
		if (moved !== 0) scroller.scrollTo({ top: next, behavior });

		// At a small section height, the body can clip the chart. Reveal the row in both views.
		onReveal({ top: rect.top - moved, bottom: rect.bottom - moved });
	}

	/** Scrolls to the table row of the task and flashes it one time. */
	async function jump(id: string) {
		if (!workspaceLayout.split && viewer.narrowTab !== 'work-plan') {
			viewer.setNarrowTab('work-plan');
			await tick();
			// The shell restores the tab scroll position after its layout update.
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		}
		const row = document.querySelector<HTMLElement>(`tr[data-task-id="${CSS.escape(id)}"]`);
		const scroller = document.querySelector<HTMLElement>(
			workspaceLayout.split ? '#work-pane' : '[data-testid="workspace-content"]'
		);
		if (!row || !scroller) return;
		const stage = row.closest('section[data-stage-id]');
		const stageHeight = stage?.querySelector('header')?.getBoundingClientRect().height ?? 0;
		const column = stage?.querySelector<HTMLElement>(
			stage.getBoundingClientRect().width >= 640 ? 'thead th' : '[data-testid="stage-band"]'
		);
		const columnHeight = column?.getBoundingClientRect().height ?? 0;
		const pinned = !workspaceLayout.split ? pinnedTimeline.height : 0;
		const offset = pinned + stageHeight + columnHeight + 16;
		scroller.scrollTo({
			top:
				scroller.scrollTop +
				row.getBoundingClientRect().top -
				scroller.getBoundingClientRect().top -
				offset,
			behavior: scrollBehavior()
		});
		editing.flash(id);
	}
</script>

{#snippet routeOverlays()}
	<g aria-hidden="true" class="route-overlays">
		{#each litEdges as line (line.key)}
			<path
				d={edgePath(line)}
				fill="none"
				stroke="var(--route-ground)"
				stroke-width="4"
				aria-hidden="true"
				data-overlay-for={line.key}
				data-route-layer="casing"
				transition:routeFade={{ casing: true }}
			/>
			<path
				d={edgePath(line)}
				fill="none"
				stroke="var(--route-ink)"
				stroke-width={lineWidth(line)}
				aria-hidden="true"
				data-overlay-for={line.key}
				data-route-layer="ink"
				transition:routeFade
			/>
		{/each}
	</g>
{/snippet}

<div
	role="group"
	aria-label={m.gantt_label()}
	class={cn(
		'flex min-h-21 min-w-0 flex-1 flex-col rounded-md border bg-background [--gantt-label-width:128px] sm:[--gantt-label-width:192px]',
		className
	)}
	data-testid="gantt"
>
	<div
		bind:this={scroller}
		use:overlayScrollbar={{ axis: 'both' }}
		class="min-h-0 flex-1 overflow-auto"
		data-diagram-scroller
		data-testid="gantt-scroller"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative"
			style:min-width="calc({LABEL_WIDTH} + {TIMELINE_MIN_WIDTH}px)"
			onpointerdown={chartPointerDown}
			onpointermove={chartPointerMove}
			onpointerleave={chartPointerLeave}
		>
			<div class="sticky top-0 z-20 flex border-b bg-background" style:height="{HEADER_HEIGHT}px">
				<div
					class="sticky left-0 z-10 flex w-(--gantt-label-width) shrink-0 items-center border-r bg-background px-1"
				></div>
				<div class="relative flex-1 text-xs text-muted-foreground">
					{#each ticks as t (t.month)}
						<GanttTween x0={t.x0} x1={t.x1}>
							{#snippet child(x)}
								<div
									class="absolute inset-y-0 flex items-center overflow-hidden border-l px-1 whitespace-nowrap first:border-l-0"
									style:left="{x.x0 * 100}%"
									style:width="{(x.x1 - x.x0) * 100}%"
								>
									<span class="truncate tabular-nums">{formatMonth(t.month, locale)}</span>
								</div>
							{/snippet}
						</GanttTween>
					{/each}
				</div>
			</div>

			<div class="pointer-events-none relative z-[1] flex" style:height="{MILESTONE_ROW_HEIGHT}px">
				<div
					class="sticky left-0 z-10 flex w-(--gantt-label-width) shrink-0 items-center border-r bg-background px-2 text-xs text-muted-foreground"
				>
					{m.legend_milestones()}
				</div>
				<div class="relative flex-1">
					{#each milestones as item, index (item.milestone.id)}
						{@const Symbol = MILESTONE_SYMBOLS[item.milestone.symbol]}
						<Hint text="{item.label} {item.milestone.title}">
							{#snippet child({ props })}
								<button
									{...mergeProps(props, { onclick: () => onMilestone(item.milestone) })}
									type="button"
									class="pointer-events-auto absolute top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-sm pr-1 text-xs font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
									style:left="calc({milestoneFractions[index] * 100}% - 7px)"
									aria-label={m.gantt_milestone({
										label: item.label,
										title: item.milestone.title,
										date: formatDate(item.milestone.date, locale)
									})}
									data-testid="gantt-milestone"
									data-milestone-sign
								>
									<Symbol class="size-3.5 fill-current" aria-hidden="true" />{item.label}
								</button>
							{/snippet}
						</Hint>
					{/each}
					{#if today !== null}
						<TodayTag
							x={todayPosition.current}
							today={todayPosition.current}
							milestones={milestoneFractions}
							chartWidth={timelineWidth}
						/>
					{/if}
				</div>
			</div>

			<div class="pointer-events-none relative z-[1]" style:height="{bodyHeight.current}px">
				{#each rows as row (row.id)}
					<GanttRow
						routeTarget={routeTargets.target}
						{row}
						geom={marks.get(row.id)!}
						width={timelineWidth}
						taps={scene.geometry.junctions.filter((j) => j.kind === 'tap' && j.source === row.id)}
						color={colors.get(row.stageId) ?? 'currentColor'}
						highlighted={editing.highlightId === row.id}
						route={routePaint(routeModel.onRouteRowIds.has(row.id))}
						{tapRoutes}
						onJump={jump}
						{onHighlight}
					/>
				{/each}
			</div>

			<div
				class="absolute right-0 bottom-0 left-(--gantt-label-width) z-0"
				style:top="{HEADER_HEIGHT}px"
				use:measureTimeline
			>
				{#each ticks.slice(1) as t (t.month)}
					<GanttTween x0={t.x0}>
						{#snippet child(x)}
							<div
								class="absolute inset-y-0 border-l border-border/60"
								style:left="{x.x0 * 100}%"
							></div>
						{/snippet}
					</GanttTween>
				{/each}
				{#each bands as item (item.band.id)}
					{@const name = m.gantt_band({
						title: item.band.title,
						range: formatRangeDisplay(item.band.start, item.band.end, locale)
					})}
					<GanttTween x0={item.x0} x1={item.x1}>
						{#snippet child(x)}
							<Hint text={name}>
								{#snippet child({ props })}
									<button
										{...mergeProps(props, { onclick: () => onBand(item.band) })}
										type="button"
										class="absolute inset-y-0 overflow-hidden text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
										style:left="{x.x0 * 100}%"
										style:width="{(x.x1 - x.x0) * 100}%"
										style:background={bandFill(bandTintVar(item.band.color))}
										aria-label={name}
										data-testid="gantt-band"
									>
										<span
											class="absolute bottom-0.5 left-1 max-w-full truncate pr-1 text-[10px] text-muted-foreground"
											aria-hidden="true">{item.band.title}</span
										>
									</button>
								{/snippet}
							</Hint>
						{/snippet}
					</GanttTween>
				{/each}
				{#if today !== null}
					<div
						class="pointer-events-none absolute inset-y-0 border-l border-dashed border-foreground/60"
						style:left="{todayPosition.current * 100}%"
						data-testid="gantt-today"
					></div>
				{/if}
				<svg
					class="pointer-events-none absolute inset-0 size-full overflow-visible text-muted-foreground"
					aria-hidden="true"
				>
					{#each sortedEdges as line (line.key)}
						{#if line.key === firstCycle}{@render routeOverlays()}{/if}
						<GanttLine
							{line}
							tween={edgeTweens.get(line.key) ?? { current: edgePoints(line, timelineWidth) }}
							muted={isFinished(sourceRows.get(line.from)!.status)}
							route={routePaint(routeModel.litLineKeys.has(line.key))}
							strokeWidth={lineWidth(line)}
						/>
					{/each}
					{#if firstCycle === undefined}{@render routeOverlays()}{/if}
					{#each scene.geometry.junctions.filter((j) => j.kind === 'junction') as junction (junction.key)}
						<DiagramRing {junction} width={timelineWidth} route={junctionPaint(junction)} />
					{/each}
				</svg>
			</div>
		</div>
	</div>
</div>

<style>
	.route-overlays {
		--route-ink: var(--foreground);
		--route-ground: var(--background, #ffffff);
	}
	@media (forced-colors: active) {
		.route-overlays {
			forced-color-adjust: none;
			--route-ink: Highlight;
			--route-ground: Canvas;
		}
	}
</style>
