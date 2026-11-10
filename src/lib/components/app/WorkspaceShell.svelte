<script lang="ts">
	import { onMount, tick, untrack, type Snippet } from 'svelte';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import {
		isTimelinePinned,
		beginTimelineLayoutChange,
		endTimelineLayoutChange,
		pinnedTimeline,
		workspaceLayout,
		workspaceTabs,
		timelineLayout
	} from './app-layout.svelte.ts';
	import { COLLAPSED_TIMELINE_HEIGHT } from '#lib/components/timeline/gantt-layout.ts';
	import AppHeader from './AppHeader.svelte';
	import WorkspaceTabs from './WorkspaceTabs.svelte';
	import { nextIslandScroll, nextTimelineAutoCollapse } from './island-scroll.ts';

	let { plan, work }: { plan: Snippet; work: Snippet } = $props();
	const viewer = getViewer();
	let content: HTMLDivElement;
	let width = $state(0);
	let dragging = $state(false);
	let duration = $state(0);
	const available = $derived(Math.max(720, width - 12));
	const minimum = $derived(360 / available);
	const ratio = $derived(Math.min(1 - minimum, Math.max(minimum, viewer.splitRatio)));
	const percent = (value: number) => Math.round(value * 100);
	const scrollPositions = { plan: 0, 'work-plan': 0 };
	let previousTab = viewer.narrowTab;
	let stopUserScroll = () => {};
	let rebaseTimelineScroll = () => {};
	let resetTimelineScroll = () => {};

	$effect(() => {
		void timelineLayout.revision;
		untrack(() => resetTimelineScroll());
	});
	$effect(() => {
		void pinnedTimeline.height;
		const changing = timelineLayout.changing;
		untrack(() => rebaseTimelineScroll());
		if (!changing)
			void tick().then(() => {
				const active = document.activeElement;
				if (active instanceof HTMLElement && content?.contains(active)) revealFocus(active);
			});
	});

	$effect(() => {
		if (motionDuration(1) === 0) workspaceTabs.compact = 0;
	});

	$effect(() => {
		if (workspaceLayout.split || !content) return;
		let last = content.scrollTop;
		let auto = { last, down: 0, collapsed: untrack(() => timelineLayout.autoCollapsed) };
		const rebase = () => {
			last = content.scrollTop;
			auto = { ...auto, last };
		};
		resetTimelineScroll = () => {
			rebase();
			auto = { ...auto, down: 0, collapsed: timelineLayout.autoCollapsed };
		};
		let inputUntil = 0;
		let inputDirection = 0;
		let touchY: number | undefined;
		let touching = false;
		let touchMoved = false;
		let scrollbar = false;
		// Count scroll only after user input. App restores, jumps and focus reveals do not resize tabs.
		const stop = () => {
			inputUntil = 0;
			inputDirection = 0;
			last = content.scrollTop;
			auto = { ...auto, last };
		};
		stopUserScroll = () => {
			stop();
			auto = { ...auto, down: 0 };
		};
		const activate = (direction: number) => {
			if (direction !== 0) inputDirection = Math.sign(direction);
			inputUntil = performance.now() + 200;
		};
		const wheel = (event: WheelEvent) => {
			if (!event.ctrlKey && event.deltaY !== 0) activate(event.deltaY);
		};
		// A tap is not a scroll. Only a touch that moved keeps counting during the momentum scroll.
		// A label tap then starts an app scroll (the jump) that must not resize the tabs.
		const touchStart = (event: TouchEvent) => {
			touchY = event.touches[0]?.clientY;
			inputDirection = 0;
			touching = true;
			touchMoved = false;
		};
		const touchMove = (event: TouchEvent) => {
			const y = event.touches[0]?.clientY;
			const delta = y !== undefined && touchY !== undefined ? touchY - y : 0;
			touchY = y;
			touchMoved = true;
			activate(delta);
		};
		const touchEnd = () => {
			touching = false;
			inputUntil = touchMoved ? performance.now() + 600 : 0;
		};
		const pointerDown = (event: PointerEvent) => {
			stop();
			const bounds = content.getBoundingClientRect();
			scrollbar = event.target === content && event.clientX >= bounds.left + content.clientWidth;
			if (scrollbar) activate(0);
		};
		const pointerUp = () => {
			scrollbar = false;
		};
		const key = (event: KeyboardEvent) => {
			stop();
			if (
				!event.defaultPrevented &&
				!event.ctrlKey &&
				!event.metaKey &&
				!event.altKey &&
				['PageDown', 'PageUp', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) &&
				event.target instanceof HTMLElement &&
				!event.target.closest('input, textarea, select, button, [contenteditable], [role="slider"]')
			)
				activate(
					['PageUp', 'ArrowUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey)
						? -1
						: 1
				);
		};
		const sampleScroll = (layoutSample: boolean) => {
			const max = Math.max(0, content.scrollHeight - content.clientHeight);
			const top = content.scrollTop;
			const input = (touching && touchMoved) || scrollbar || performance.now() <= inputUntil;
			const clamp = (value: number) => Math.min(max, Math.max(0, value));
			const delta = clamp(top) - clamp(last);
			// A smaller scroll range clamps the old offset. Only movement after that clamp counts.
			const followsInput =
				input && delta !== 0 && (scrollbar || Math.sign(delta) === inputDirection);
			if (delta === 0 || ((timelineLayout.changing || layoutSample) && !followsInput)) {
				rebase();
				return;
			}
			// Count this user delta before a collapse changes the height and rebases both controllers.
			const next = nextIslandScroll({ last, compact: workspaceTabs.compact }, top, max, input);
			last = next.last;
			workspaceTabs.compact = motionDuration(1) === 0 ? 0 : next.compact;
			auto = nextTimelineAutoCollapse(
				{ ...auto, collapsed: timelineLayout.autoCollapsed },
				{
					top,
					max,
					heightDelta: Math.max(0, pinnedTimeline.height - COLLAPSED_TIMELINE_HEIGHT),
					user: input,
					keepOpen: viewer.timelineKeepOpen,
					userCollapsed: viewer.timelineCollapsed,
					focusInside: !!document.activeElement?.closest('#timeline-content')
				}
			);
			if (auto.collapsed !== timelineLayout.autoCollapsed) {
				const token = beginTimelineLayoutChange();
				void tick().then(() => endTimelineLayoutChange(token));
				timelineLayout.autoCollapsed = auto.collapsed;
			}
		};
		const scroll = () => sampleScroll(false);
		// Height measurements can arrive before the scroll event. Consume user movement once.
		rebaseTimelineScroll = () => sampleScroll(true);
		let observing = true;
		const resetIfShort = () => {
			if (content.scrollHeight <= content.clientHeight) workspaceTabs.compact = 0;
		};
		const resize = new ResizeObserver(() => {
			resetIfShort();
			// A FLIP can keep overflow after the group's layout size has decreased.
			const animations = content
				.getAnimations({ subtree: true })
				.filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime));
			if (animations.length)
				void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
					if (observing) resetIfShort();
				});
		});
		resize.observe(content);
		for (const group of content.querySelectorAll('#work-pane, #remarks')) resize.observe(group);
		content.addEventListener('scroll', scroll, { passive: true });
		content.addEventListener('wheel', wheel, { passive: true });
		content.addEventListener('touchstart', touchStart, { passive: true });
		content.addEventListener('touchmove', touchMove, { passive: true });
		content.addEventListener('touchend', touchEnd, { passive: true });
		content.addEventListener('touchcancel', touchEnd, { passive: true });
		content.addEventListener('pointerdown', pointerDown, true);
		content.addEventListener('keydown', key);
		window.addEventListener('pointerup', pointerUp);
		window.addEventListener('pointercancel', pointerUp);
		return () => {
			observing = false;
			resize.disconnect();
			content.removeEventListener('scroll', scroll);
			content.removeEventListener('wheel', wheel);
			content.removeEventListener('touchstart', touchStart);
			content.removeEventListener('touchmove', touchMove);
			content.removeEventListener('touchend', touchEnd);
			content.removeEventListener('touchcancel', touchEnd);
			content.removeEventListener('pointerdown', pointerDown, true);
			content.removeEventListener('keydown', key);
			window.removeEventListener('pointerup', pointerUp);
			window.removeEventListener('pointercancel', pointerUp);
			stopUserScroll = () => {};
			rebaseTimelineScroll = () => {};
			resetTimelineScroll = () => {};
		};
	});

	function tabElements(tab: 'plan' | 'work-plan') {
		return content.querySelectorAll<HTMLElement>(
			tab === 'work-plan' ? '#work-pane' : '#header, #stage-overview, #remarks'
		);
	}

	onMount(() => {
		const query = matchMedia('(min-width: 1024px)');
		// The browser can remove focus from a hidden control before the change event.
		// Then the active element is the body. Use the last focused element instead.
		let lastFocused: Element | null = null;
		const trackFocus = (event: FocusEvent) => (lastFocused = event.target as Element);
		document.addEventListener('focusin', trackFocus);
		function update() {
			const active = document.activeElement;
			const focused = active && active !== document.body ? active : lastFocused;
			const focusedTimeline = !!focused?.closest('#timeline');
			if (workspaceLayout.split && !query.matches && !focusedTimeline) {
				const group = focused?.closest('#work-pane, #plan-pane')?.id;
				if (group) viewer.setNarrowTab(group === 'work-pane' ? 'work-plan' : 'plan');
			}
			workspaceLayout.split = query.matches;
			void tick().then(() => {
				const lost = document.activeElement === document.body || document.activeElement === focused;
				if (
					focused instanceof HTMLElement &&
					lost &&
					(!focused.isConnected ||
						!focused.checkVisibility({ visibilityProperty: true }) ||
						!!focused.closest('[inert]'))
				) {
					if (focused.matches('.split-resize')) {
						document.getElementById(`workspace-tab-${viewer.narrowTab}`)?.focus();
					} else if (focusedTimeline) {
						content
							.querySelector<HTMLElement>(
								workspaceLayout.split ? '[data-testid="gantt-pin"]' : '#timeline-collapse'
							)
							?.focus();
					} else if (focused.matches('#workspace-tab-plan, #workspace-tab-work-plan')) {
						document.getElementById(focused.getAttribute('aria-controls')!)?.focus();
					}
				}
				const active = document.activeElement;
				if (active instanceof HTMLElement && content.contains(active)) revealFocus(active);
			});
		}
		update();
		query.addEventListener('change', update);
		return () => {
			query.removeEventListener('change', update);
			document.removeEventListener('focusin', trackFocus);
		};
	});

	$effect.pre(() => {
		const tab = viewer.narrowTab;
		if (tab === previousTab) return;
		const outgoingTab = previousTab;
		if (!workspaceLayout.split && content) scrollPositions[outgoingTab] = content.scrollTop;
		previousTab = tab;
		untrack(() => {
			const ms = motionDuration(120);
			void tick().then(() => {
				if (workspaceLayout.split || !content) return;
				stopUserScroll();
				content.scrollTop = Math.min(
					scrollPositions[tab],
					Math.max(0, content.scrollHeight - content.clientHeight)
				);
				// The selected group fades in. Its position does not change, so no slide is necessary.
				if (ms === 0) return;
				for (const target of tabElements(tab)) {
					target.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease-out' });
				}
			});
		});
	});

	function setRatio(value: number, animate = true) {
		duration = motionDuration(animate ? 180 : 0);
		viewer.setSplitRatio(Math.min(1 - minimum, Math.max(minimum, value)));
	}

	function onKey(event: KeyboardEvent) {
		const values: Record<string, number> = {
			ArrowLeft: ratio - 0.02,
			ArrowRight: ratio + 0.02,
			PageUp: ratio - 0.1,
			PageDown: ratio + 0.1,
			Home: minimum,
			End: 1 - minimum
		};
		if (!(event.key in values)) return;
		event.preventDefault();
		setRatio(values[event.key]);
	}

	function revealFocus(target: HTMLElement) {
		if (target.closest('#timeline')) return;
		const split = workspaceLayout.split;
		const scroller = split ? target.closest<HTMLElement>('#plan-pane, #work-pane') : content;
		if (!scroller) return;
		const bounds = target.getBoundingClientRect();
		const view = scroller.getBoundingClientRect();
		const pinned =
			isTimelinePinned(viewer) && (!split || scroller.id === 'plan-pane')
				? pinnedTimeline.height
				: 0;
		const stage = target.closest('[data-testid="stage"]');
		const header = stage?.querySelector(':scope > header');
		const columns = stage?.querySelector<HTMLElement>(
			stage.getBoundingClientRect().width >= 640 ? 'thead th' : '[data-testid="stage-band"]'
		);
		const stack =
			header && !header.contains(target)
				? header.getBoundingClientRect().height + (columns?.getBoundingClientRect().height ?? 0)
				: 0;
		const top = view.top + pinned + stack;
		const bottom =
			view.bottom - (split ? 0 : parseFloat(getComputedStyle(content).scrollPaddingBottom));
		stopUserScroll();
		if (bounds.top < top) scroller.scrollTop += bounds.top - top;
		else if (bounds.bottom > bottom) scroller.scrollTop += bounds.bottom - bottom;
	}
</script>

<AppHeader />
<div
	bind:this={content}
	bind:clientWidth={width}
	role="main"
	class="workspace-content"
	data-testid="workspace-content"
	data-layout={workspaceLayout.split ? 'split' : 'tabs'}
	data-tab={viewer.narrowTab}
	data-pinned={isTimelinePinned(viewer)}
	style:--split-columns="{ratio}fr 12px {1 - ratio}fr"
	style:--split-duration="{duration}ms"
	data-animate-split={duration > 0}
	style:--gantt-pinned-h={!workspaceLayout.split ? `${pinnedTimeline.height}px` : '0px'}
	style:--plan-pinned-h={isTimelinePinned(viewer) ? `${pinnedTimeline.height}px` : '0px'}
	onfocusin={(event) => {
		if (event.target instanceof HTMLElement) revealFocus(event.target);
	}}
>
	<div
		id="plan-pane"
		data-testid="plan-pane"
		tabindex="-1"
		class="outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
		role={workspaceLayout.split ? 'region' : viewer.narrowTab === 'plan' ? 'tabpanel' : undefined}
		aria-label={workspaceLayout.split ? m.workspace_plan() : undefined}
		aria-labelledby={!workspaceLayout.split && viewer.narrowTab === 'plan'
			? 'workspace-tab-plan'
			: undefined}
	>
		{@render plan()}
	</div>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		role="separator"
		tabindex="0"
		aria-label={m.resize_panes()}
		aria-orientation="vertical"
		aria-controls="plan-pane work-pane"
		aria-valuemin={percent(minimum)}
		aria-valuemax={percent(1 - minimum)}
		aria-valuenow={percent(ratio)}
		data-testid="split-resize"
		class="split-resize group relative flex touch-none items-center justify-center hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
		data-dragging={dragging}
		onkeydown={onKey}
		ondblclick={() => setRatio(0.5)}
		onpointerdown={(event) => {
			if (event.button !== 0) return;
			event.preventDefault();
			event.currentTarget.setPointerCapture(event.pointerId);
			dragging = true;
			duration = motionDuration(0);
		}}
		onpointermove={(event) => {
			if (dragging)
				setRatio((event.clientX - content.getBoundingClientRect().left - 6) / available, false);
		}}
		onpointerup={() => (dragging = false)}
		onpointercancel={() => (dragging = false)}
		onlostpointercapture={() => (dragging = false)}
	>
		<span class="absolute inset-y-0 w-px bg-border" aria-hidden="true"></span>
		<span
			class="z-10 h-10 w-1 rounded-full bg-border opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[dragging=true]:opacity-100"
			aria-hidden="true"
		></span>
	</div>
	<div
		id="work-pane"
		data-testid="work-pane"
		tabindex="-1"
		class="outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
		role={workspaceLayout.split
			? 'region'
			: viewer.narrowTab === 'work-plan'
				? 'tabpanel'
				: undefined}
		aria-label={workspaceLayout.split ? m.section_work_plan() : undefined}
		aria-labelledby={!workspaceLayout.split && viewer.narrowTab === 'work-plan'
			? 'workspace-tab-work-plan'
			: undefined}
	>
		{@render work()}
	</div>
</div>
<WorkspaceTabs />

<style>
	@media screen {
		.workspace-content {
			position: relative;
			min-height: 0;
			min-width: 0;
			overflow-y: auto;
			overscroll-behavior: contain;
			overflow-anchor: none;
			scroll-padding-top: var(--gantt-pinned-h, 0px);
			--pane-padding: 16px;
			padding: var(--pane-padding);
		}
		#plan-pane {
			display: contents;
		}
		#work-pane {
			min-width: 0;
		}
		.split-resize {
			display: none;
			cursor: col-resize;
		}
		.workspace-content[data-layout='tabs'][data-tab='plan'] #work-pane {
			display: none;
		}
		.workspace-content[data-layout='tabs'][data-tab='work-plan']
			:global(#plan-pane > :not(#timeline)) {
			display: none;
		}
		/* A sticky element stops at the padding edge. Subtract the padding, so it touches the top. */
		.workspace-content[data-pinned='true'] :global(#timeline) {
			position: sticky;
			top: calc(-1 * var(--pane-padding));
			z-index: 30;
		}
		/* Keep these rules below the split width. The layout attribute changes one frame after the media query. */
		@media (max-width: 1023.98px) {
			.workspace-content[data-layout='tabs'] {
				/* Full island: 40 px target and 4 px padding on each side. */
				--tabs-bottom-space: calc(48px + 12px + env(safe-area-inset-bottom) + 16px);
				padding-bottom: var(--tabs-bottom-space);
				scroll-padding-bottom: var(--tabs-bottom-space);
				display: flex;
				flex-direction: column;
			}
			.workspace-content[data-layout='tabs'] > *,
			.workspace-content[data-layout='tabs'] :global(#plan-pane > *) {
				flex-shrink: 0;
			}
			.workspace-content[data-layout='tabs'] :global(#timeline) {
				order: -1;
				margin: calc(-1 * var(--pane-padding)) calc(-1 * var(--pane-padding)) var(--pane-padding);
				padding-inline: var(--pane-padding);
				background: var(--background);
				box-shadow:
					0 4px 6px -1px rgb(0 0 0 / 0.1),
					0 2px 4px -2px rgb(0 0 0 / 0.1);
			}
		}
		:global(#stage-overview),
		:global(#remarks) {
			container-type: inline-size;
		}
		@media (min-width: 1024px) {
			.workspace-content {
				display: grid;
				grid-template-columns: var(--split-columns);
				transition: grid-template-columns var(--split-duration) ease-out;
				overflow: hidden;
				padding: 0;
			}
			/* The global reduced-motion rule keeps a 0.01 ms transition. That shows the old widths for one frame. */
			.workspace-content[data-animate-split='false'] {
				transition: none;
			}
			#plan-pane,
			#work-pane,
			.workspace-content[data-tab='plan'] #work-pane {
				display: block;
				min-height: 0;
				min-width: 0;
				overflow-y: auto;
				overscroll-behavior: contain;
				overflow-anchor: none;
				--pane-padding: 16px;
				padding: var(--pane-padding);
			}
			#plan-pane {
				scroll-padding-top: var(--plan-pinned-h, 0px);
			}
			.split-resize {
				display: flex;
			}
			.workspace-content[data-tab='work-plan'] :global(#plan-pane > :not(#timeline)) {
				display: block;
			}
		}
		@media (min-width: 1280px) {
			#plan-pane,
			#work-pane,
			.workspace-content[data-tab='plan'] #work-pane {
				--pane-padding: 24px;
				padding: var(--pane-padding);
			}
		}
	}
</style>
