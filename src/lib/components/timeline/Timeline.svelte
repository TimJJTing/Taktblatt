<!--
	The timeline section: the heading, Gantt chart and three legends (stages, milestones, bands).
	The pin keeps the full section below the app header.
	A milestone or band in the chart or in a legend opens its dialog. The "+" buttons add a new one.
	Dates use the UI language.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { innerHeight } from 'svelte/reactivity/window';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import PinIcon from '@lucide/svelte/icons/pin';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { appHeader, pinnedTimeline } from '#lib/components/app/app-layout.svelte.js';
	import { Toggle } from '#lib/components/ui/toggle/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { stageColorVar, bandTintVar } from '#lib/components/plan/colors.js';
	import { orderedMilestones } from '#lib/domain/derive.js';
	import { formatDate, formatRangeDisplay } from '#lib/domain/format.js';
	import { uiIntl } from '#lib/ui-language.js';
	import type { Band, Milestone } from '#lib/domain/schema.js';
	import { motionDuration } from '#lib/motion.js';
	import { getViewer } from '#lib/state/viewer.svelte.js';
	import { cn } from '#lib/utils.js';
	import { heightLimits, pinnedHeight, TIMELINE_MOTION_MS } from './gantt-layout.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import BandDialog from './BandDialog.svelte';
	import Gantt from './Gantt.svelte';
	import MilestoneDialog from './MilestoneDialog.svelte';

	const ws = getWorkspace();
	const viewer = getViewer();
	let milestone = $state<Milestone | null | undefined>(undefined);
	let band = $state<Band | null | undefined>(undefined);
	const milestones = $derived(orderedMilestones(ws.plan.milestones));
	const locale = uiIntl();
	const row = 'flex min-h-8 shrink-0 flex-wrap items-center gap-x-3 gap-y-2';
	const legend = 'min-w-0 flex flex-wrap items-center gap-x-4 gap-y-2';
	const entryButton =
		'flex min-w-0 items-center gap-2 rounded px-2 py-1 text-left [overflow-wrap:anywhere] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring';

	let slot = $state<HTMLDivElement | null>(null);
	let panel = $state<HTMLDivElement | null>(null);
	let body = $state<HTMLDivElement | null>(null);
	let boxHeight = $state(0);
	let stuck = $state(false);
	let slotBox = $state({ left: 0, width: 0 });
	let appWidth = $state(0);
	const headerHeight = $derived(appHeader.height);
	const viewport = $derived(innerHeight.current ?? 800);
	const limits = $derived(heightLimits(viewport));
	const height = $derived(pinnedHeight(viewer.ganttHeight, viewport));
	const percent = (px: number) => Math.round((px / viewport) * 100);
	// The stored fraction times the viewport can differ from a limit by a rounding error.
	const atMin = $derived(height <= limits.min + 0.5);
	const atMax = $derived(height >= limits.max - 0.5);

	let drag = $state<{ y: number; height: number } | null>(null);
	let previousHeight = 0;
	let heightInitialized = false;
	$effect.pre(() => {
		void [viewer.ganttPinned, height, drag];
		if (panel) previousHeight = panel.getBoundingClientRect().height;
	});

	// Pin and unpin change the slot height. Scroll anchoring can then follow content below the slot
	// and scroll the page, so the section leaves its fixed place. Disable anchoring until the slot settles.
	// Do this only for a pin change: at other times, anchoring keeps the page stable.
	// Chromium reads the page setting from the body, not from the root element.
	let anchorPinned: boolean | undefined;
	$effect.pre(() => {
		const pinned = viewer.ganttPinned;
		const changed = anchorPinned !== undefined && anchorPinned !== pinned;
		anchorPinned = pinned;
		if (!changed) return;
		const body = document.body;
		const anchor = body.style.overflowAnchor;
		body.style.overflowAnchor = 'none';
		const restoreAnchor = () => {
			body.style.overflowAnchor = anchor;
		};
		const element = panel;
		let frame = 0;
		// ResizeObserver updates the slot after the panel's final animation frame.
		const settle = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				frame = requestAnimationFrame(restoreAnchor);
			});
		};
		const isHeight = (event: TransitionEvent) =>
			event.target === element && event.propertyName === 'height';
		// A replacement transition, for example after Page Down, cancels the current one.
		// The browser sends its run event before the next frame. Thus it stops a pending restore.
		const onRun = (event: TransitionEvent) => {
			if (!isHeight(event)) return;
			window.clearTimeout(timer);
			cancelAnimationFrame(frame);
		};
		const onEnd = (event: TransitionEvent) => {
			if (isHeight(event)) settle();
		};
		element?.addEventListener('transitionrun', onRun);
		element?.addEventListener('transitionend', onEnd);
		element?.addEventListener('transitioncancel', onEnd);
		// Fallback when no height transition runs, for example with reduced motion.
		const timer = window.setTimeout(settle, motionDuration(TIMELINE_MOTION_MS) + 200);
		return () => {
			element?.removeEventListener('transitionrun', onRun);
			element?.removeEventListener('transitionend', onEnd);
			element?.removeEventListener('transitioncancel', onEnd);
			window.clearTimeout(timer);
			cancelAnimationFrame(frame);
			restoreAnchor();
		};
	});

	// Measure with auto, then transition between pixels. Restore auto after unpinning.
	$effect(() => {
		if (!panel) return;
		const element = panel;
		const pinned = viewer.ganttPinned;
		const duration = motionDuration(drag ? 0 : TIMELINE_MOTION_MS);
		let target = height;
		untrack(() => {
			element.style.transitionDuration = '0ms';
			// The measurement expands the scrollers, and the browser resets their offsets.
			// Keep the offsets, so the content scrolls back with the animation and does not jump.
			const scrollers = [
				...element.querySelectorAll<HTMLElement>('[data-testid="gantt-scroller"]'),
				...(body ? [body] : [])
			].map((scroller) => ({ scroller, top: scroller.scrollTop }));
			if (!pinned) {
				// The outgoing separator is not part of the unpinned natural height.
				const separator = element.querySelector<HTMLElement>('[data-testid="gantt-resize"]');
				const display = separator?.style.display ?? '';
				if (separator) separator.style.display = 'none';
				element.style.height = 'auto';
				target = element.getBoundingClientRect().height;
				if (separator) separator.style.display = display;
			}
			if (!heightInitialized || duration === 0 || Math.abs(previousHeight - target) < 0.5) {
				element.style.height = pinned ? `${target}px` : 'auto';
			} else {
				element.style.height = `${previousHeight}px`;
				for (const { scroller, top } of scrollers) scroller.scrollTop = top;
				// Commit the start height before applying the target.
				element.getBoundingClientRect();
				element.style.transitionDuration = `${duration}ms`;
				element.style.height = `${target}px`;
			}
			heightInitialized = true;
		});
		function releaseHeight(event: TransitionEvent) {
			if (!pinned && event.target === element && event.propertyName === 'height') {
				element.style.height = 'auto';
			}
		}
		element.addEventListener('transitionend', releaseHeight);
		return () => element.removeEventListener('transitionend', releaseHeight);
	});

	// Share the full section height with section links, table headers and chart label jumps.
	$effect(() => {
		const root = document.documentElement;
		const offset = viewer.ganttPinned ? boxHeight || height : 0;
		pinnedTimeline.height = offset;
		if (offset === 0) {
			root.style.removeProperty('--gantt-pinned-h');
			return;
		}
		root.style.setProperty('--gantt-pinned-h', `${offset}px`);
		return () => {
			pinnedTimeline.height = 0;
			root.style.removeProperty('--gantt-pinned-h');
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

	// Keep the section fixed after its slot passes the header. The slot preserves page layout.
	function updateStuck() {
		if (!slot) return;
		const rect = slot.getBoundingClientRect();
		stuck = viewer.ganttPinned && rect.top < headerHeight;
		slotBox = { left: rect.left, width: rect.width };
		appWidth = document.documentElement.clientWidth;
	}

	$effect(() => {
		void [viewer.ganttPinned, headerHeight, slot];
		untrack(updateStuck);
	});

	$effect(() => {
		if (!slot) return;
		// Scrollbar changes can alter the app width without a window resize.
		const observer = new ResizeObserver(updateStuck);
		observer.observe(document.documentElement);
		observer.observe(slot);
		return () => observer.disconnect();
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
</script>

{#snippet swatch(background: string)}
	<span class="size-2.5 shrink-0 rounded-sm" style:background aria-hidden="true"></span>
{/snippet}

<svelte:window onscroll={updateStuck} onresize={updateStuck} />

<div bind:this={slot} style:height={stuck ? `${boxHeight}px` : undefined}>
	<div
		bind:this={panel}
		bind:offsetHeight={boxHeight}
		class={cn(
			'flex min-w-0 flex-col bg-background text-sm transition-[height] ease-out',
			stuck &&
				'fixed top-(--timeline-top) left-(--timeline-left) z-30 w-(--timeline-width) shadow-md'
		)}
		style:--timeline-top="{headerHeight}px"
		style:--timeline-left="{slotBox.left}px"
		style:--timeline-width="{slotBox.width}px"
		style:--timeline-app-width="{appWidth}px"
		data-testid="timeline-panel"
		data-pinned={viewer.ganttPinned || undefined}
	>
		<div class="mb-2 flex shrink-0 items-center gap-2">
			<h2 id="timeline-title" class="text-sm font-semibold tracking-wide uppercase">
				{m.section_timeline()}
			</h2>
			<Toggle
				class="size-9 p-0"
				aria-label={m.gantt_pin()}
				title={m.gantt_pin()}
				pressed={viewer.ganttPinned}
				onPressedChange={(value) => viewer.setGanttPinned(value)}
				data-testid="gantt-pin"
			>
				<PinIcon aria-hidden="true" class={cn(viewer.ganttPinned && 'fill-current')} />
			</Toggle>
			{#if viewer.ganttPinned}
				<div
					class="flex shrink-0 gap-1"
					transition:fade={{ duration: motionDuration(TIMELINE_MOTION_MS) }}
				>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={m.gantt_shorter()}
						title={m.gantt_shorter()}
						disabled={atMin}
						onclick={() => setHeight(height - viewport * 0.1)}
						style={`transition-duration: ${motionDuration(TIMELINE_MOTION_MS)}ms`}
					>
						<ChevronUpIcon aria-hidden="true" />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={m.gantt_taller()}
						title={m.gantt_taller()}
						disabled={atMax}
						onclick={() => setHeight(height + viewport * 0.1)}
						style={`transition-duration: ${motionDuration(TIMELINE_MOTION_MS)}ms`}
					>
						<ChevronDownIcon aria-hidden="true" />
					</Button>
				</div>
			{/if}
			<Button
				variant="ghost"
				size="sm"
				class="ml-auto"
				style={`transition-duration: ${motionDuration(TIMELINE_MOTION_MS)}ms`}
				aria-expanded={!viewer.timelineLegendsCollapsed}
				aria-controls="timeline-legends"
				onclick={() => viewer.setTimelineLegendsCollapsed(!viewer.timelineLegendsCollapsed)}
				data-testid="timeline-legends-toggle"
			>
				<ChevronDownIcon
					aria-hidden="true"
					class={cn('transition-transform', viewer.timelineLegendsCollapsed && '-rotate-90')}
					style={`transition-duration: ${motionDuration(TIMELINE_MOTION_MS)}ms`}
				/>
				{m.timeline_legends()}
			</Button>
		</div>
		<div
			bind:this={body}
			class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
			data-testid="timeline-body"
		>
			<Gantt
				onBand={(item) => (band = item)}
				onMilestone={(item) => (milestone = item)}
				onReveal={revealRow}
			/>
			<div
				id="timeline-legends"
				class="grid shrink-0 transition-[grid-template-rows] ease-out"
				style:grid-template-rows={viewer.timelineLegendsCollapsed ? '0fr' : '1fr'}
				style:transition-duration={`${motionDuration(TIMELINE_MOTION_MS)}ms`}
				inert={viewer.timelineLegendsCollapsed}
				aria-hidden={viewer.timelineLegendsCollapsed}
				data-testid="timeline-legends"
			>
				<div class="min-h-0 overflow-hidden">
					<div class="flex flex-col gap-3 pt-3">
						<div class={row}>
							<span class="font-medium" aria-hidden="true">{m.legend_stages()}</span>
							<ul class={legend} aria-label={m.legend_stages()} data-testid="stage-legend">
								{#each ws.plan.stages as stage, i (stage.id)}
									<li class="flex min-w-0 items-center gap-2 [overflow-wrap:anywhere]">
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
										<button
											type="button"
											class={entryButton}
											onclick={() => (milestone = item.milestone)}>{text}</button
										>
									</li>
								{/each}
								<li>
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
							<span class="font-medium" aria-hidden="true">{m.legend_bands()}</span>
							<ul class={legend} aria-label={m.legend_bands()} data-testid="band-legend">
								{#each ws.plan.bands as item (item.id)}
									{@const text = `${item.title} (${formatRangeDisplay(item.start, item.end, locale)})`}
									<li>
										<button type="button" class={entryButton} onclick={() => (band = item)}
											>{@render swatch(bandTintVar(item.color))}{text}</button
										>
									</li>
								{/each}
								<li>
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
		{#if viewer.ganttPinned}
			<!-- A focusable separator is a widget (WAI-ARIA window splitter). -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
			<div
				transition:slide={{ duration: motionDuration(TIMELINE_MOTION_MS) }}
				role="separator"
				aria-orientation="horizontal"
				aria-label={m.gantt_resize()}
				aria-valuenow={percent(height)}
				aria-valuemin={percent(limits.min)}
				aria-valuemax={percent(limits.max)}
				aria-valuetext="{percent(height)} %"
				tabindex="0"
				class="relative mt-2 flex h-3 w-(--timeline-app-width) shrink-0 cursor-row-resize touch-none items-center justify-center border-t bg-background hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
				style:left="calc(-1 * var(--timeline-left))"
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
{#if milestone !== undefined}<MilestoneDialog
		entry={milestone ?? undefined}
		onClose={() => (milestone = undefined)}
	/>{/if}
{#if band !== undefined}<BandDialog
		entry={band ?? undefined}
		onClose={() => (band = undefined)}
	/>{/if}
