<!--
	The timeline section: the heading, Gantt chart and three legends (stages, milestones, bands).
	The pin keeps the full section at the top of its scroller.
	A milestone or band in the chart or in a legend opens its dialog. The "+" buttons add a new one.
	Dates use the UI language.
-->
<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import { tick, untrack } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { innerHeight } from 'svelte/reactivity/window';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import PinIcon from '@lucide/svelte/icons/pin';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import {
		isTimelinePinned,
		workspaceLayout,
		pinnedTimeline
	} from '#lib/components/app/app-layout.svelte.ts';
	import Hint from '#lib/components/app/Hint.svelte';
	import { Toggle } from '#lib/components/ui/toggle/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { stageColorVar, bandTintVar } from '#lib/components/plan/colors.ts';
	import { orderedMilestones } from '#lib/domain/derive.ts';
	import { formatDate, formatRangeDisplay } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import type { Band, Milestone } from '#lib/domain/schema.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { cn } from '#lib/utils.ts';
	import { heightLimits, pinnedHeight, TIMELINE_MOTION_MS } from './gantt-layout.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
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

	let panel = $state<HTMLDivElement | null>(null);
	let body = $state<HTMLDivElement | null>(null);
	let boxHeight = $state(0);
	let heading: HTMLDivElement;
	let collapseButton = $state<HTMLButtonElement>();
	const pinned = $derived(isTimelinePinned(viewer));
	const collapsed = $derived(!workspaceLayout.split && viewer.timelineCollapsed);
	const dividerHeight = 28;

	function setCollapsed(value: boolean) {
		if (
			value &&
			(heading?.contains(document.activeElement) || body?.contains(document.activeElement))
		) {
			collapseButton?.focus({ preventScroll: true });
		}
		viewer.setTimelineCollapsed(value);
	}
	// A layout change can collapse the section without setCollapsed. Keep focus out of hidden content.
	// Read the focus before the update makes the content inert. The chevron exists after the update.
	$effect.pre(() => {
		if (!collapsed) return;
		const focused = untrack(() => document.activeElement);
		if (!heading?.contains(focused) && !body?.contains(focused)) return;
		void tick().then(() => collapseButton?.focus({ preventScroll: true }));
	});
	const viewport = $derived(innerHeight.current ?? 800);
	const limits = $derived(heightLimits(viewport, workspaceLayout.split));
	const height = $derived(pinnedHeight(viewer.ganttHeight, viewport, workspaceLayout.split));
	const percent = (px: number) => Math.round((px / viewport) * 100);
	// The stored fraction times the viewport can differ from a limit by a rounding error.
	const atMin = $derived(height <= limits.min + 0.5);
	const atMax = $derived(height >= limits.max - 0.5);

	let drag = $state<{ y: number; height: number; saved: number; collapsed: boolean } | null>(null);
	let previousHeight = 0;
	let heightInitialized = false;
	$effect.pre(() => {
		void [pinned, collapsed, height, drag];
		if (panel) previousHeight = panel.getBoundingClientRect().height;
	});

	// Measure with auto, then transition between pixels. Restore auto after unpinning.
	$effect(() => {
		if (!panel) return;
		const element = panel;
		const fixed = pinned;
		// A hidden panel cannot measure its natural height or finish a transition.
		if (!fixed && element.getClientRects().length === 0) {
			element.style.height = 'auto';
			heightInitialized = false;
			return;
		}
		const duration = motionDuration(drag ? 0 : TIMELINE_MOTION_MS);
		let target = collapsed ? dividerHeight : height;
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
				element.style.transitionDuration = `${duration}ms`;
				element.style.height = `${target}px`;
			}
			heightInitialized = true;
		});
		function releaseHeight(event: TransitionEvent) {
			if (!fixed && event.target === element && event.propertyName === 'height') {
				element.style.height = 'auto';
			}
		}
		element.addEventListener('transitionend', releaseHeight);
		return () => element.removeEventListener('transitionend', releaseHeight);
	});

	// Share the animated height with pane scroll padding and narrow sticky headers.
	$effect(() => {
		pinnedTimeline.height = pinned ? boxHeight || (collapsed ? dividerHeight : height) : 0;
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

	function onSeparatorKey(event: KeyboardEvent) {
		if (!workspaceLayout.split && event.key === 'Enter') {
			event.preventDefault();
			setCollapsed(!collapsed);
			return;
		}
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

	function onSeparatorDown(event: PointerEvent) {
		if (event.button !== 0) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		drag = {
			y: event.clientY,
			height: collapsed ? 0 : height,
			saved: viewer.ganttHeight,
			collapsed
		};
		event.preventDefault();
	}
	function onSeparatorMove(event: PointerEvent) {
		if (!drag) return;
		const delta = event.clientY - drag.y;
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
	function onSeparatorUp() {
		drag = null;
	}
</script>

{#snippet swatch(background: string)}
	<span class="size-2.5 shrink-0 rounded-sm" style:background aria-hidden="true"></span>
{/snippet}

<div>
	<div
		bind:this={panel}
		bind:offsetHeight={boxHeight}
		class={cn(
			'flex min-w-0 flex-col bg-background text-sm transition-[height] ease-out',
			// With tabs, the full-width section has the shadow (WorkspaceShell).
			pinned && workspaceLayout.split && 'shadow-md',
			collapsed && 'justify-end overflow-y-clip'
		)}
		data-testid="timeline-panel"
		data-pinned={pinned || undefined}
	>
		<div
			id="timeline-content"
			class="flex min-h-0 flex-1 flex-col"
			inert={collapsed}
			style:visibility={collapsed ? 'hidden' : undefined}
		>
			<div bind:this={heading} class="mb-2 flex shrink-0 items-center gap-2">
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
										{@const text = m.label_parenthetical({
											name: item.title,
											qualifier: formatRangeDisplay(item.start, item.end, locale)
										})}
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
		</div>
		{#if pinned}
			<div
				class={cn('timeline-divider relative shrink-0', workspaceLayout.split && 'mt-2')}
				transition:slide={{ duration: motionDuration(TIMELINE_MOTION_MS) }}
			>
				<!-- A focusable separator is a widget (WAI-ARIA window splitter). -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
				<div
					role="separator"
					aria-orientation="horizontal"
					aria-label={m.gantt_resize()}
					aria-valuenow={collapsed ? 0 : percent(height)}
					aria-valuemin={workspaceLayout.split ? percent(limits.min) : 0}
					aria-valuemax={percent(limits.max)}
					aria-valuetext="{collapsed ? 0 : percent(height)} %"
					tabindex="0"
					class={cn(
						'relative flex cursor-row-resize touch-none items-center justify-center bg-background hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
						workspaceLayout.split ? 'h-3 border-t' : 'h-7'
					)}
					onkeydown={onSeparatorKey}
					onpointerdown={onSeparatorDown}
					onpointermove={onSeparatorMove}
					onpointerup={onSeparatorUp}
					onpointercancel={onSeparatorUp}
					data-testid="gantt-resize"
				>
					{#if workspaceLayout.split}
						<span class="h-1 w-10 rounded-full bg-border" aria-hidden="true"></span>
					{:else}
						<span class="h-px w-full bg-border" aria-hidden="true"></span>
					{/if}
				</div>
				{#if !workspaceLayout.split}
					<Hint text={collapsed ? m.timeline_expand() : m.timeline_collapse()}>
						{#snippet child({ props })}
							<button
								{...mergeProps(props, { onclick: () => setCollapsed(!collapsed) })}
								bind:this={collapseButton}
								id="timeline-collapse"
								type="button"
								class="absolute top-0 left-1/2 flex size-7 -translate-x-1/2 items-center justify-center rounded-full border bg-background hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
								aria-label={collapsed ? m.timeline_expand() : m.timeline_collapse()}
								aria-expanded={!collapsed}
								aria-controls="timeline-content"
							>
								<ChevronUpIcon
									aria-hidden="true"
									class={cn('size-4 transition-transform', collapsed && 'rotate-180')}
									style={`transition-duration: ${motionDuration(TIMELINE_MOTION_MS)}ms`}
								/>
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
		margin-left: calc(-1 * var(--pane-padding, 16px));
		width: calc(100% + 2 * var(--pane-padding, 16px));
	}
</style>
