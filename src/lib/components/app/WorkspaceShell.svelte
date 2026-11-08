<script lang="ts">
	import { onMount, tick, untrack, type Snippet } from 'svelte';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { pinnedTimeline, workspaceLayout } from './app-layout.svelte.ts';
	import AppHeader from './AppHeader.svelte';

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

	function tabElements(tab: 'plan' | 'work-plan') {
		return content.querySelectorAll<HTMLElement>(
			tab === 'work-plan'
				? '#work-pane'
				: viewer.ganttPinned
					? '#header, #stage-overview, #remarks'
					: '#header, #timeline, #stage-overview, #remarks'
		);
	}

	onMount(() => {
		const query = matchMedia('(min-width: 1024px)');
		function update() {
			const focused = document.activeElement;
			if (workspaceLayout.split && !query.matches) {
				const group = focused?.closest('#work-pane, #plan-pane')?.id;
				if (group) viewer.setNarrowTab(group === 'work-pane' ? 'work-plan' : 'plan');
			}
			workspaceLayout.split = query.matches;
			void tick().then(() => {
				if (focused instanceof HTMLElement && !focused.checkVisibility()) {
					if (focused.matches('.split-resize')) {
						document.getElementById(`workspace-tab-${viewer.narrowTab}`)?.focus();
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
		return () => query.removeEventListener('change', update);
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
			viewer.ganttPinned && (!split || scroller.id === 'plan-pane') ? pinnedTimeline.height : 0;
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
		if (bounds.top < top) scroller.scrollTop += bounds.top - top;
		else if (bounds.bottom > view.bottom) scroller.scrollTop += bounds.bottom - view.bottom;
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
	data-pinned={viewer.ganttPinned}
	style:--split-columns="{ratio}fr 12px {1 - ratio}fr"
	style:--split-duration="{duration}ms"
	data-animate-split={duration > 0}
	style:--gantt-pinned-h={!workspaceLayout.split && viewer.ganttPinned
		? `${pinnedTimeline.height}px`
		: '0px'}
	style:--plan-pinned-h={viewer.ganttPinned ? `${pinnedTimeline.height}px` : '0px'}
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
		.workspace-content[data-layout='tabs'][data-tab='work-plan'][data-pinned='false']
			:global(#timeline) {
			display: none;
		}
		/* A sticky element stops at the padding edge. Subtract the padding, so it touches the top. */
		.workspace-content[data-pinned='true'] :global(#timeline) {
			position: sticky;
			top: calc(-1 * var(--pane-padding));
			z-index: 30;
		}
		.workspace-content[data-tab='work-plan'] :global(#timeline) {
			margin-top: 0;
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
			.workspace-content[data-tab='work-plan'] :global(#plan-pane > :not(#timeline)),
			.workspace-content[data-tab='work-plan'][data-pinned='false'] :global(#timeline) {
				display: block;
			}
			.workspace-content[data-tab='work-plan'] :global(#timeline) {
				margin-top: 40px;
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
