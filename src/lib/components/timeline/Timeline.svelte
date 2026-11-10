<!--
	The timeline section: the heading, Gantt chart and three legends (stages, milestones, bands).
	Split view uses a pin and separator. Tabs use a tap and drag handle.
	Tabs keep the legend rail below the chart and can collapse on user scroll.
	One pointer owns a handle drag until release or cancellation.
	The body scrolls when the chart and legends do not fit. The heading and handle stay visible.
	A milestone or band in the chart or in a legend opens its dialog. The "+" buttons add a new one.
	Dates use the UI language.
-->
<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import { DRAG_START_PX } from '#lib/browser/drag-click.ts';
	import { tick, untrack } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { innerHeight } from 'svelte/reactivity/window';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import PinIcon from '@lucide/svelte/icons/pin';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import {
		isTimelinePinned,
		beginTimelineLayoutChange,
		endTimelineLayoutChange,
		workspaceLayout,
		pinnedTimeline,
		timelineLayout
	} from '#lib/components/app/app-layout.svelte.ts';
	import Hint from '#lib/components/app/Hint.svelte';
	import { Toggle } from '#lib/components/ui/toggle/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { stageColorVar, bandTintVar } from '#lib/components/plan/colors.ts';
	import { todayISO } from '#lib/domain/date.ts';
	import { stageEdgeSegments } from '#lib/domain/stage-edge.ts';
	import { orderedMilestones } from '#lib/domain/derive.ts';
	import { formatDate, formatRangeDisplay } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import type { Band, Milestone } from '#lib/domain/schema.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { cn } from '#lib/utils.ts';
	import {
		heightLimits,
		pinnedHeight,
		COLLAPSED_TIMELINE_HEIGHT,
		TIMELINE_HANDLE_RESERVE,
		STAGE_EDGE_HEIGHT,
		TIMELINE_HANDLE_HEIGHT,
		TABS_TIMELINE_TOP_SPACE,
		MIN_CHART_HEIGHT,
		TIMELINE_MOTION_MS
	} from './gantt-layout.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import BandDialog from './BandDialog.svelte';
	import Gantt from './Gantt.svelte';
	import GanttTween from './GanttTween.svelte';
	import MilestoneDialog from './MilestoneDialog.svelte';

	const ws = getWorkspace();
	const viewer = getViewer();
	let milestone = $state<Milestone | null | undefined>(undefined);
	let band = $state<Band | null | undefined>(undefined);
	const milestones = $derived(orderedMilestones(ws.plan.milestones));
	const locale = uiIntl();
	const row = $derived(
		cn(
			'flex shrink-0 items-center gap-x-3 gap-y-2',
			workspaceLayout.split ? 'min-h-8 flex-wrap' : 'min-h-6 flex-nowrap whitespace-nowrap'
		)
	);
	const legend = $derived(
		cn(
			'min-w-0 flex items-center gap-x-4 gap-y-2',
			workspaceLayout.split ? 'flex-wrap' : 'min-h-7 shrink-0 flex-nowrap whitespace-nowrap'
		)
	);
	const legendItem = $derived(
		cn(!workspaceLayout.split && 'min-h-6 shrink-0 flex-nowrap whitespace-nowrap')
	);
	const entryButton =
		'flex min-w-0 items-center gap-2 rounded px-2 py-1 text-left [overflow-wrap:anywhere] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring';

	let panel = $state<HTMLDivElement | null>(null);
	let body = $state<HTMLDivElement | null>(null);
	let boxHeight = $state(0);
	let rail = $state<HTMLDivElement>();
	let chips = $state<HTMLDivElement>();
	let railMore = $state(false);
	$effect(() => {
		if (!rail) return;
		const element = rail;
		const update = () => {
			railMore = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
		};
		const observer = new ResizeObserver(update);
		observer.observe(element);
		if (chips) observer.observe(chips);
		element.addEventListener('scroll', update, { passive: true });
		update();
		return () => {
			observer.disconnect();
			element.removeEventListener('scroll', update);
		};
	});
	let heading: HTMLDivElement;
	let handleButton = $state<HTMLButtonElement>();
	const pinned = $derived(isTimelinePinned(viewer));
	const collapsed = $derived(
		!workspaceLayout.split && (viewer.timelineCollapsed || timelineLayout.autoCollapsed)
	);
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
	const edge = $derived(stageEdgeSegments(ws.index, ws.plan.stages, ws.plan.range, todayDate));

	function setCollapsed(value: boolean) {
		if (viewer.timelineCollapsed === value && !timelineLayout.autoCollapsed) return;
		if (
			value &&
			(heading?.contains(document.activeElement) || body?.contains(document.activeElement))
		) {
			handleButton?.focus({ preventScroll: true });
		}
		timelineLayout.autoCollapsed = false;
		timelineLayout.revision += 1;
		viewer.setTimelineCollapsed(value);
	}
	// A layout change can collapse the section without setCollapsed. Keep focus out of hidden content.
	// Read focus before the update makes the content inert.
	$effect.pre(() => {
		if (!collapsed) return;
		const focused = untrack(() => document.activeElement);
		if (!heading?.contains(focused) && !body?.contains(focused)) return;
		void tick().then(() => handleButton?.focus({ preventScroll: true }));
	});
	// Only split view can hide the legends.
	const legendsCollapsed = $derived(workspaceLayout.split && viewer.timelineLegendsCollapsed);
	// A split-view legend toggle moves focus out of the hidden list.
	let previousSplit = workspaceLayout.split;
	$effect.pre(() => {
		const split = workspaceLayout.split;
		const layoutChanged = previousSplit !== split;
		previousSplit = split;
		if (!legendsCollapsed || layoutChanged) return;
		const focused = untrack(() => document.activeElement);
		const list = document.getElementById('timeline-legends');
		if (!focused || !list?.contains(focused)) return;
		void tick().then(() => document.getElementById('timeline-legends-button')?.focus());
	});
	function setLegendsCollapsed(value: boolean) {
		viewer.setTimelineLegendsCollapsed(value);
	}
	const viewport = $derived(innerHeight.current ?? 800);
	const limits = $derived(heightLimits(viewport, workspaceLayout.split));
	const height = $derived(pinnedHeight(viewer.ganttHeight, viewport, workspaceLayout.split));
	const expandedHeight = $derived(height + (workspaceLayout.split ? 0 : TABS_TIMELINE_TOP_SPACE));
	const percent = (px: number) => Math.round((px / viewport) * 100);
	// The stored fraction times the viewport can differ from a limit by a rounding error.
	const atMin = $derived(height <= limits.min + 0.5);
	const atMax = $derived(height >= limits.max - 0.5);

	let drag = $state<{
		pointerId: number;
		y: number;
		height: number;
		saved: number;
		collapsed: boolean;
		moved: boolean;
	} | null>(null);
	let suppressClick = false;
	let previousHeight = 0;
	let heightInitialized = false;
	let viewportInitialized = false;
	$effect.pre(() => {
		void [pinned, collapsed, expandedHeight, drag];
		if (panel) previousHeight = panel.getBoundingClientRect().height;
	});

	// Measure with auto, then transition between pixels. Restore auto after unpinning.
	$effect(() => {
		if (!panel) return;
		const element = panel;
		const owner = beginTimelineLayoutChange();
		const release = () => endTimelineLayoutChange(owner);
		const fixed = pinned;
		// A hidden panel cannot measure its natural height or finish a transition.
		if (!fixed && element.getClientRects().length === 0) {
			element.style.height = 'auto';
			heightInitialized = false;
			release();
			return;
		}
		const measuredViewport = innerHeight.current !== undefined;
		const firstViewport = measuredViewport && !viewportInitialized;
		viewportInitialized ||= measuredViewport;
		// The first measured viewport corrects the fallback height without a transition.
		const duration = motionDuration(drag || firstViewport ? 0 : TIMELINE_MOTION_MS);
		let settleFrame = 0;
		let settleTimer: ReturnType<typeof setTimeout> | undefined;
		let transitioning = false;
		const finish = () => {
			cancelAnimationFrame(settleFrame);
			if (motionDuration(1) === 0) {
				release();
				return;
			}
			settleFrame = requestAnimationFrame(release);
		};
		let target = collapsed ? COLLAPSED_TIMELINE_HEIGHT : expandedHeight;
		untrack(() => {
			element.style.transitionDuration = '0ms';
			// The measurement expands the scrollers, and the browser resets their offsets.
			// Keep the offsets, so the content scrolls back with the animation and does not jump.
			const scrollers = [
				...element.querySelectorAll<HTMLElement>('[data-testid="gantt-scroller"]'),
				...(body ? [body] : [])
			].map((scroller) => ({ scroller, top: scroller.scrollTop }));
			if (!fixed) {
				// The outgoing separator is not part of the unpinned natural height.
				const separator = element.querySelector<HTMLElement>('.timeline-divider');
				const display = separator?.style.display ?? '';
				if (separator) separator.style.display = 'none';
				element.style.height = 'auto';
				target = element.getBoundingClientRect().height;
				if (separator) separator.style.display = display;
			}
			if (!heightInitialized || duration === 0 || Math.abs(previousHeight - target) < 0.5) {
				element.style.height = fixed ? `${target}px` : 'auto';
			} else {
				element.style.height = `${previousHeight}px`;
				for (const { scroller, top } of scrollers) scroller.scrollTop = top;
				// Commit the start height before applying the target.
				element.getBoundingClientRect();
				transitioning = true;
				element.style.transitionDuration = `${duration}ms`;
				element.style.height = `${target}px`;
			}
			heightInitialized = true;
		});
		// Without a height transition, only the next layout frame needs scroll suppression.
		if (transitioning) settleTimer = setTimeout(finish, duration + 32);
		else finish();
		function releaseHeight(event: TransitionEvent) {
			if (event.target === element && event.propertyName === 'height') finish();
			if (!fixed && event.target === element && event.propertyName === 'height') {
				element.style.height = 'auto';
			}
		}
		element.addEventListener('transitionend', releaseHeight);
		return () => {
			clearTimeout(settleTimer);
			cancelAnimationFrame(settleFrame);
			element.removeEventListener('transitionend', releaseHeight);
			release();
		};
	});

	// Share the animated height with pane scroll padding and narrow sticky headers.
	$effect(() => {
		// Reduced motion uses the final height without waiting for the resize measurement.
		const target = collapsed ? COLLAPSED_TIMELINE_HEIGHT : expandedHeight;
		pinnedTimeline.height = pinned ? (motionDuration(1) === 0 ? target : boxHeight || target) : 0;
		return () => {
			pinnedTimeline.height = 0;
		};
	});

	function revealRow(row: { top: number; bottom: number }) {
		if (!body) return;
		const view = body.getBoundingClientRect();
		const delta =
			row.top < view.top
				? row.top - view.top
				: row.bottom > view.bottom
					? row.bottom - view.bottom
					: 0;
		if (delta !== 0) {
			body.scrollBy({ top: delta, behavior: motionDuration(1) === 0 ? 'instant' : 'smooth' });
		}
	}

	function setHeight(px: number) {
		const clamped = Math.min(limits.max, Math.max(limits.min, px));
		viewer.setGanttHeight(clamped / viewport);
	}

	function onResizeKey(event: KeyboardEvent) {
		if (collapsed) {
			if (['ArrowDown', 'PageDown', 'End', 'ArrowUp', 'PageUp', 'Home'].includes(event.key)) {
				event.preventDefault();
				if (['ArrowDown', 'PageDown', 'End'].includes(event.key)) setCollapsed(false);
			}
			return;
		}
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

	function onResizeDown(event: PointerEvent) {
		if (event.button !== 0 || drag) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		drag = {
			pointerId: event.pointerId,
			y: event.clientY,
			height: collapsed ? 0 : height,
			saved: viewer.ganttHeight,
			collapsed,
			moved: false
		};
		suppressClick = false;
		if (workspaceLayout.split) event.preventDefault();
	}
	function onResizeMove(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointerId) return;
		const delta = event.clientY - drag.y;
		if (!workspaceLayout.split && !drag.moved && Math.abs(delta) < DRAG_START_PX) return;
		drag.moved = true;
		suppressClick = true;
		const next = drag.height + delta;
		if (!workspaceLayout.split) {
			// A drag down from the collapsed state expands. Other drags collapse below half the minimum.
			if (drag.collapsed ? delta <= 0 : next < limits.min / 2) {
				setCollapsed(true);
				viewer.setGanttHeight(drag.saved);
				return;
			}
			setCollapsed(false);
		}
		setHeight(next);
	}
	function onResizeUp(event: PointerEvent) {
		if (event.pointerId !== drag?.pointerId) return;
		drag = null;
	}
	function onResizeCancel(event: PointerEvent) {
		if (event.pointerId !== drag?.pointerId) return;
		suppressClick = true;
		onResizeUp(event);
	}
</script>

{#snippet swatch(background: string)}
	<span class="size-2.5 shrink-0 rounded-sm" style:background aria-hidden="true"></span>
{/snippet}

<div
	style:--timeline-handle-reserve={`${TIMELINE_HANDLE_RESERVE}px`}
	style:--stage-edge-height={`${STAGE_EDGE_HEIGHT}px`}
	style:--timeline-handle-height={`${TIMELINE_HANDLE_HEIGHT}px`}
	style:--tabs-timeline-top-space={`${TABS_TIMELINE_TOP_SPACE}px`}
>
	<div
		bind:this={panel}
		bind:offsetHeight={boxHeight}
		class={cn(
			'flex min-w-0 flex-col bg-background text-sm transition-[height] ease-out',
			// With tabs, the full-width section has the shadow (WorkspaceShell).
			pinned && workspaceLayout.split && 'shadow-md',
			collapsed && 'justify-end overflow-y-clip'
		)}
		style:transition-property={motionDuration(1) === 0 ? 'none' : undefined}
		data-testid="timeline-panel"
		data-pinned={pinned || undefined}
	>
		<div
			id="timeline-content"
			class="flex min-h-0 flex-1 flex-col"
			style:padding-top={workspaceLayout.split ? undefined : 'var(--tabs-timeline-top-space)'}
			inert={collapsed}
			style:visibility={collapsed ? 'hidden' : undefined}
		>
			<div
				bind:this={heading}
				class={cn('flex shrink-0 items-center gap-2', workspaceLayout.split && 'mb-2')}
			>
				<h2 id="timeline-title" class="text-sm font-semibold tracking-wide uppercase">
					{m.section_timeline()}
				</h2>
				{#if workspaceLayout.split}
					<Hint text={m.gantt_pin()}>
						{#snippet child({ props })}
							<Toggle
								{...props}
								class="size-9 p-0"
								aria-label={m.gantt_pin()}
								pressed={viewer.ganttPinned}
								onPressedChange={(value) => viewer.setGanttPinned(value)}
								data-testid="gantt-pin"
							>
								<PinIcon aria-hidden="true" class={cn(viewer.ganttPinned && 'fill-current')} />
							</Toggle>
						{/snippet}
					</Hint>
				{/if}
				{#if workspaceLayout.split && viewer.ganttPinned}
					<div
						class="flex shrink-0 gap-1"
						transition:fade={{ duration: motionDuration(TIMELINE_MOTION_MS) }}
					>
						<Hint text={m.gantt_shorter()}>
							{#snippet child({ props })}
								<Button
									{...mergeProps(props, { onclick: () => setHeight(height - viewport * 0.1) })}
									variant="ghost"
									size="icon-sm"
									aria-label={m.gantt_shorter()}
									disabled={atMin}
									style={`transition-duration: ${motionDuration(TIMELINE_MOTION_MS)}ms`}
								>
									<ChevronUpIcon aria-hidden="true" />
								</Button>
							{/snippet}
						</Hint>
						<Hint text={m.gantt_taller()}>
							{#snippet child({ props })}
								<Button
									{...mergeProps(props, { onclick: () => setHeight(height + viewport * 0.1) })}
									variant="ghost"
									size="icon-sm"
									aria-label={m.gantt_taller()}
									disabled={atMax}
									style={`transition-duration: ${motionDuration(TIMELINE_MOTION_MS)}ms`}
								>
									<ChevronDownIcon aria-hidden="true" />
								</Button>
							{/snippet}
						</Hint>
					</div>
				{/if}
				{#if workspaceLayout.split}
					<Button
						variant="ghost"
						size="sm"
						class="ml-auto"
						style={`transition-duration: ${motionDuration(TIMELINE_MOTION_MS)}ms`}
						aria-expanded={!legendsCollapsed}
						id="timeline-legends-button"
						aria-controls="timeline-legends"
						onclick={() => setLegendsCollapsed(!legendsCollapsed)}
						data-testid="timeline-legends-toggle"
					>
						<ChevronDownIcon
							aria-hidden="true"
							class={cn('transition-transform', legendsCollapsed && '-rotate-90')}
							style={`transition-duration: ${motionDuration(TIMELINE_MOTION_MS)}ms`}
						/>
						{m.timeline_legends()}
					</Button>
				{:else}
					<Hint text={m.timeline_keep_open()}>
						{#snippet child({ props })}
							<Toggle
								{...props}
								class="ml-auto size-6 p-0"
								style={`transition-duration: ${motionDuration(TIMELINE_MOTION_MS)}ms`}
								aria-label={m.timeline_keep_open()}
								pressed={viewer.timelineKeepOpen}
								onPressedChange={(value) => viewer.setTimelineKeepOpen(value)}
								data-testid="timeline-keep-open"
							>
								<PinIcon aria-hidden="true" class={cn(viewer.timelineKeepOpen && 'fill-current')} />
							</Toggle>
						{/snippet}
					</Hint>
				{/if}
			</div>
			<div
				bind:this={body}
				class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
				style:--chart-min-height={`${MIN_CHART_HEIGHT}px`}
				data-testid="timeline-body"
			>
				<Gantt
					{todayDate}
					class={cn(
						!workspaceLayout.split &&
							'min-h-(--chart-min-height) flex-[1_0_var(--chart-min-height)]'
					)}
					onBand={(item) => (band = item)}
					onMilestone={(item) => (milestone = item)}
					onReveal={revealRow}
				/>
				<div
					id="timeline-legends"
					bind:this={rail}
					class={cn(
						'grid shrink-0 transition-[grid-template-rows] ease-out',
						!workspaceLayout.split && 'overflow-x-auto overflow-y-hidden',
						!workspaceLayout.split &&
							railMore &&
							'mask-[linear-gradient(to_right,black_calc(100%_-_16px),transparent)]'
					)}
					onfocusin={(event) => {
						if (!workspaceLayout.split && event.target instanceof HTMLElement) {
							event.target.scrollIntoView({
								block: 'nearest',
								inline: 'nearest',
								behavior: motionDuration(1) === 0 ? 'instant' : 'smooth'
							});
						}
					}}
					style:grid-template-rows={legendsCollapsed ? '0fr' : '1fr'}
					style:transition-duration={`${motionDuration(TIMELINE_MOTION_MS)}ms`}
					style:transition-property={motionDuration(1) === 0 ? 'none' : undefined}
					inert={legendsCollapsed}
					aria-hidden={legendsCollapsed}
					data-testid="timeline-legends"
				>
					<div
						class={cn('min-h-0', workspaceLayout.split ? 'overflow-hidden' : 'overflow-visible')}
					>
						<div
							bind:this={chips}
							class={cn(
								'flex',
								workspaceLayout.split
									? 'flex-col gap-3 pt-3'
									: 'w-max flex-row flex-nowrap gap-4 pt-1'
							)}
						>
							<div class={row}>
								<span
									class={cn('font-medium', !workspaceLayout.split && 'hidden')}
									aria-hidden="true">{m.legend_stages()}</span
								>
								<ul class={legend} aria-label={m.legend_stages()} data-testid="stage-legend">
									{#each ws.plan.stages as stage, i (stage.id)}
										<li
											class={cn(
												'flex min-w-0 items-center gap-2 [overflow-wrap:anywhere]',
												legendItem
											)}
										>
											{@render swatch(stageColorVar(stage.color))}{stage.title ||
												m.stage_title_placeholder({ n: i + 1 })}
										</li>
									{/each}
								</ul>
							</div>
							<div class={row}>
								<span
									class={cn('font-medium', !workspaceLayout.split && 'hidden')}
									aria-hidden="true">{m.legend_milestones()}</span
								>
								<ul
									class={legend}
									aria-label={m.legend_milestones()}
									data-testid="milestone-legend"
								>
									{#each milestones as item (item.milestone.id)}
										{@const text = m.milestone_label({
											symbol: item.label,
											title: item.milestone.title,
											date: formatDate(item.milestone.date, locale)
										})}
										<li class={legendItem}>
											<button
												type="button"
												class={entryButton}
												onclick={() => (milestone = item.milestone)}>{text}</button
											>
										</li>
									{/each}
									<li class={legendItem}>
										<Button
											size="icon-xs"
											variant="outline"
											aria-label={m.milestone_add()}
											onclick={() => (milestone = null)}
											><PlusIcon aria-hidden="true" class="size-3" /></Button
										>
									</li>
								</ul>
							</div>
							<div class={row}>
								<span
									class={cn('font-medium', !workspaceLayout.split && 'hidden')}
									aria-hidden="true">{m.legend_bands()}</span
								>
								<ul class={legend} aria-label={m.legend_bands()} data-testid="band-legend">
									{#each ws.plan.bands as item (item.id)}
										{@const text = m.label_parenthetical({
											name: item.title,
											qualifier: formatRangeDisplay(item.start, item.end, locale)
										})}
										<li class={legendItem}>
											<button type="button" class={entryButton} onclick={() => (band = item)}
												>{@render swatch(bandTintVar(item.color))}{text}</button
											>
										</li>
									{/each}
									<li class={legendItem}>
										<Button
											size="icon-xs"
											variant="outline"
											aria-label={m.band_add()}
											onclick={() => (band = null)}
											><PlusIcon aria-hidden="true" class="size-3" /></Button
										>
									</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
		{#if pinned}
			<div
				class={cn(
					'timeline-divider relative shrink-0',
					workspaceLayout.split ? 'mt-2' : !collapsed && 'pt-(--timeline-handle-reserve)'
				)}
				transition:slide={{ duration: motionDuration(TIMELINE_MOTION_MS) }}
			>
				{#if workspaceLayout.split}
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
						class={cn(
							'relative flex cursor-row-resize touch-none items-center justify-center bg-background hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
							'h-3 border-t'
						)}
						onkeydown={onResizeKey}
						onpointerdown={onResizeDown}
						onpointermove={onResizeMove}
						onpointerup={onResizeUp}
						onpointercancel={onResizeUp}
						data-testid="gantt-resize"
					>
						<span class="h-1 w-10 rounded-full bg-border" aria-hidden="true"></span>
					</div>
				{:else}
					{#if collapsed}
						<div
							class="stage-edge pointer-events-none relative h-(--stage-edge-height) bg-border"
							aria-hidden="true"
							data-testid="timeline-stage-edge"
							transition:fade={{ duration: motionDuration(TIMELINE_MOTION_MS) }}
						>
							{#each edge.segments as segment (segment.stageId)}
								{@const stage = ws.plan.stages.find((stage) => stage.id === segment.stageId)!}
								<GanttTween x0={segment.left} x1={segment.left + segment.width}>
									{#snippet child({ x0, x1 })}
										<span
											class="absolute inset-y-0"
											data-testid="timeline-stage-segment"
											style:left={`${x0 * 100}%`}
											style:width={`${(x1 - x0) * 100}%`}
											style:background={stageColorVar(stage.color)}
										></span>
									{/snippet}
								</GanttTween>
							{/each}
							{#if edge.today !== null}
								<GanttTween x0={edge.today}>
									{#snippet child({ x0 })}
										<span
											class="absolute top-0 z-10 h-2.5 w-0.5 bg-foreground"
											data-testid="timeline-today-tick"
											style:left={`${x0 * 100}%`}
										></span>
									{/snippet}
								</GanttTween>
							{/if}
						</div>
					{/if}
					<span id="timeline-handle-hint" class="sr-only">{m.timeline_handle_hint()}</span>
					<Hint text={collapsed ? m.timeline_expand() : m.timeline_collapse()}>
						{#snippet child({ props })}
							<button
								{...mergeProps(props, {
									onclick: (event: MouseEvent) => {
										if (suppressClick && event.detail !== 0) {
											suppressClick = false;
											return;
										}
										suppressClick = false;
										setCollapsed(!collapsed);
									}
								})}
								bind:this={handleButton}
								id="timeline-collapse"
								type="button"
								class="timeline-handle relative flex h-(--timeline-handle-height) w-full cursor-row-resize touch-none items-center justify-center bg-background hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
								class:collapsed
								aria-label={collapsed ? m.timeline_expand() : m.timeline_collapse()}
								aria-expanded={!collapsed}
								aria-controls="timeline-content"
								aria-describedby="timeline-handle-hint"
								onkeydown={onResizeKey}
								onpointerdown={onResizeDown}
								onpointermove={onResizeMove}
								onpointerup={onResizeUp}
								onpointercancel={onResizeCancel}
								onlostpointercapture={onResizeCancel}
							>
								<span class="h-1 w-9 rounded-full bg-border" aria-hidden="true"></span>
							</button>
						{/snippet}
					</Hint>
				{/if}
			</div>
		{/if}
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

<style>
	.timeline-divider {
		margin-left: calc(-1 * var(--pane-padding, var(--tabs-timeline-top-space)));
		width: calc(100% + 2 * var(--pane-padding, var(--tabs-timeline-top-space)));
	}
	.timeline-handle::before {
		content: '';
		position: absolute;
		inset: calc(-1 * var(--timeline-handle-reserve)) 0 0;
	}
	.timeline-handle.collapsed::before {
		top: calc(-1 * var(--stage-edge-height));
	}
</style>
