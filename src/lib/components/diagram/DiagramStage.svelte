<!--
	The diagram stage in the Timeline body. Refer to docs/spec.md, section 5.13, and ADR 20.
	It renders the selected view from the registry. A view change:
	1. captures running cue copies, cancels their flight and captures every current view layer,
	2. merges cue positions and elements, then mounts the incoming view with outgoing input off,
	3. transfers and reveals focus by task id, then captured parent id, then switch choice,
	4. moves incoming cue copies in one flight layer and fades the view layers in place,
	5. lets outgoing layers exit and announces the final view after motion and the debounce.
	Flight cleanup restores the cues.
	All durations use motionDuration. Reduced motion swaps at once.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import {
		beginTimelineLayoutChange,
		endTimelineLayoutChange
	} from '#lib/components/app/app-layout.svelte.ts';
	import { MOTION_SETTLE_MS, VIEW_MOTION_MS, motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { cn } from '#lib/utils.ts';
	import {
		activeDiagramLayer,
		diagramReturnFocus,
		parentIdOf,
		resolveTaskFocus,
		revealTarget,
		selectedDiagramChoice,
		taskIdOf
	} from './diagram-focus.ts';
	import { setDiagramLayer } from './diagram-layer.ts';
	import { captureGeometry, createFlight, type TaskGeometry } from './diagram-motion.ts';
	import DiagramStageLayer from './DiagramStageLayer.svelte';
	import { DIAGRAM_ATTR, type DiagramViewId, type DiagramViewProps } from './view-contract.ts';
	import { getViewRegistry } from './view-registry.ts';

	interface Props extends DiagramViewProps {
		/** The id of the region. The switch choices control it. */
		id: string;
	}

	let { id, todayDate, class: className, onBand, onMilestone, onReveal }: Props = $props();

	const registry = getViewRegistry();
	const viewer = getViewer();
	const ws = getWorkspace();
	const active = $derived(registry.resolve(viewer.diagramView));

	/** The announcement delay after the view transition finishes. */
	const ANNOUNCE_DELAY_MS = 150;

	interface Layer {
		key: number;
		view: DiagramViewId;
		leaving: boolean;
	}

	let stage = $state<HTMLDivElement | null>(null);
	let layers = $state<Layer[]>([{ key: 0, view: untrack(() => active.id), leaving: false }]);
	let nextKey = 1;
	let flight: ReturnType<typeof createFlight> | null = null;
	let destroyed = false;
	let announcement = $state('');
	let announceTimer: ReturnType<typeof setTimeout> | undefined;
	let announcementGeneration = 0;
	let viewTransition: Promise<unknown> = Promise.resolve();
	let incomingFade: { key: number; finish: () => void } | null = null;
	let layoutToken: symbol | undefined;
	let layoutTimer: ReturnType<typeof setTimeout> | undefined;

	const layerElement = (key: number) =>
		stage?.querySelector<HTMLElement>(`[${DIAGRAM_ATTR.layer}="${key}"]`) ?? null;
	const activeKey = $derived(layers.find((layer) => !layer.leaving)?.key);

	setDiagramLayer({
		active: true,
		returnFocus: (taskId, from) =>
			diagramReturnFocus(
				{
					planId: ws.plan.id,
					viewId: active.id,
					taskId,
					parentId: parentIdOf(from, ws.index) ?? ws.index.byId.get(taskId)?.parentId ?? null,
					from
				},
				{
					planId: () => ws.plan.id,
					viewId: () => active.id,
					stage: () => stage,
					get controls() {
						return id;
					},
					onReveal: revealImmediately,
					onFallback: () => announce(active.id, true)
				}
			)
	});

	interface FocusRecord {
		element: HTMLElement;
		taskId: string;
		parentId: string | null;
	}

	function revealImmediately(row: { top: number; bottom: number }) {
		onReveal(row, 'instant');
	}

	/**
	 * The task id of the focused stage node. Focus on another stage control (for example a
	 * milestone) gives 'switch': that control leaves with the outgoing view.
	 */
	function focusedTask(): FocusRecord | 'switch' | null {
		const focused = document.activeElement;
		const layer = activeDiagramLayer(stage);
		if (!layer || !(focused instanceof HTMLElement) || !layer.contains(focused)) return null;
		const taskId = taskIdOf(focused);
		return taskId
			? { element: focused, taskId, parentId: parentIdOf(focused, ws.index) }
			: 'switch';
	}

	function transferFocus(root: HTMLElement, target: FocusRecord | 'switch') {
		const resolved = target === 'switch' ? 'switch' : resolveTaskFocus(root, target);
		const element = resolved === 'switch' ? selectedDiagramChoice(id) : resolved;
		if (element) {
			element.focus({ preventScroll: true });
			revealTarget(element, stage, revealImmediately);
		}
		return resolved === 'switch' || (target !== 'switch' && taskIdOf(element) !== target.taskId);
	}

	$effect(() => {
		const root = activeKey === undefined ? null : layerElement(activeKey);
		if (!root) return;
		let record: FocusRecord | null = null;
		let pendingBlur: FocusRecord | null = null;
		const focusin = (event: FocusEvent) => {
			pendingBlur = null;
			const element = event.target;
			const taskId = element instanceof HTMLElement ? taskIdOf(element) : null;
			record =
				taskId && element instanceof HTMLElement
					? { element, taskId, parentId: parentIdOf(element, ws.index) }
					: null;
		};
		const focusout = (event: FocusEvent) => {
			const next = event.relatedTarget;
			if (next instanceof Element) {
				if (!root.contains(next) || !taskIdOf(next)) {
					record = null;
					pendingBlur = null;
				}
				return;
			}
			// Removal of the focused node also sends focusout with no relatedTarget, before the node
			// is detached. Keep the record for the removal observer; clear it only after a real blur.
			const left = record;
			pendingBlur = left;
			queueMicrotask(() => {
				if (record !== left || !left?.element.isConnected) return;
				// A move can queue this clear before the observer. Read that batch before clearing.
				reconcileRemovals(observer.takeRecords());
				if (record === left && pendingBlur === left) {
					record = null;
					pendingBlur = null;
				}
			});
		};
		const reconcileRemovals = (mutations: MutationRecord[]) => {
			if (
				!mutations.some((mutation) => mutation.removedNodes.length > 0) ||
				!record ||
				document.activeElement !== document.body ||
				activeDiagramLayer(stage) !== root
			)
				return;
			const target = record;
			if (target.element.isConnected) {
				const moved = mutations.some((mutation) =>
					Array.from(mutation.removedNodes).some((node) => node.contains(target.element))
				);
				if (pendingBlur === target && root.contains(target.element) && moved) {
					pendingBlur = null;
					target.element.focus({ preventScroll: true });
				}
				return;
			}
			record = null;
			pendingBlur = null;
			if (transferFocus(root, target)) announce(active.id, true);
		};
		const observer = new MutationObserver(reconcileRemovals);
		root.addEventListener('focusin', focusin);
		root.addEventListener('focusout', focusout);
		observer.observe(root, { childList: true, subtree: true });
		return () => {
			observer.disconnect();
			root.removeEventListener('focusin', focusin);
			root.removeEventListener('focusout', focusout);
		};
	});

	let announced = untrack(() => active.id);

	function announce(view: DiagramViewId, fallback = false) {
		const generation = ++announcementGeneration;
		clearTimeout(announceTimer);
		// Wait for copies and incoming content, including a transition that has no copies.
		void viewTransition.then(() => {
			if (destroyed || generation !== announcementGeneration) return;
			announceTimer = setTimeout(() => {
				if (destroyed || generation !== announcementGeneration) return;
				// A return to the announced view is no change. Fallbacks still repeat the name.
				if (view === announced && !fallback) return;
				const label = registry.get(view)?.label() ?? view;
				announcement = '';
				void tick().then(() => {
					if (destroyed || generation !== announcementGeneration) return;
					announced = view;
					announcement = m.diagram_view_announcement({ view: label });
				});
			}, ANNOUNCE_DELAY_MS);
		});
	}

	function finishIncomingFade(key: number) {
		if (incomingFade?.key !== key) return;
		incomingFade.finish();
		incomingFade = null;
	}

	function markLayoutChange(duration: number) {
		if (layoutToken) endTimelineLayoutChange(layoutToken);
		clearTimeout(layoutTimer);
		const token = beginTimelineLayoutChange();
		layoutToken = token;
		layoutTimer = setTimeout(() => {
			endTimelineLayoutChange(token);
			if (layoutToken === token) layoutToken = undefined;
		}, duration + MOTION_SETTLE_MS);
	}

	async function change(view: DiagramViewId) {
		const duration = motionDuration(VIEW_MOTION_MS);
		// Invalidate every earlier announcement before canceled motion can settle its promises.
		announcementGeneration++;
		clearTimeout(announceTimer);
		incomingFade?.finish();
		incomingFade = null;
		// Capture copies before cleanup restores the real cue elements.
		const running = flight?.capture();
		flight?.cancel();
		flight = null;
		// A plain map: a local snapshot, not reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const outgoing = new Map<string, TaskGeometry>();
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const elements = new Map<string, Set<HTMLElement>>();
		const retained: {
			element: HTMLElement;
			width: number;
			height: number;
			scrollers: { element: HTMLElement; top: number; left: number }[];
		}[] = [];
		if (stage) {
			// Exiting DOM can outlive its entry in layers. Include it in the cue-element union.
			const current = stage.querySelectorAll<HTMLElement>(`[${DIAGRAM_ATTR.layer}]`);
			for (const element of current) {
				const box = element.getBoundingClientRect();
				retained.push({
					element,
					width: box.width,
					height: box.height,
					scrollers: [...element.querySelectorAll<HTMLElement>(`[${DIAGRAM_ATTR.scroller}]`)].map(
						(scroller) => ({
							element: scroller,
							top: scroller.scrollTop,
							left: scroller.scrollLeft
						})
					)
				});
				for (const [task, geometry] of captureGeometry(element, stage)) {
					let cues = elements.get(task);
					if (!cues) {
						// eslint-disable-next-line svelte/prefer-svelte-reactivity
						cues = new Set<HTMLElement>();
						elements.set(task, cues);
					}
					for (const cue of geometry.elements) cues.add(cue);
					if (!element.inert || !outgoing.has(task)) outgoing.set(task, geometry);
				}
			}
		}
		for (const [task, geometry] of running ?? []) outgoing.set(task, geometry);
		for (const [task, geometry] of outgoing) {
			outgoing.set(task, { ...geometry, elements: [...(elements.get(task) ?? [])] });
		}
		// A switch action keeps focus on the switch. Focus elsewhere is not taken.
		// The transfer happens one microtask later, so no user focus action can come between.
		const target = focusedTask();
		markLayoutChange(duration);
		// Keep each outgoing viewport at its captured size when it becomes absolute.
		for (const { element, width, height } of retained) {
			element.style.boxSizing = 'border-box';
			element.style.width = `${width}px`;
			element.style.height = `${height}px`;
		}

		const key = nextKey++;
		const fadeFinished =
			duration > 0
				? new Promise<void>((finish) => {
						incomingFade = { key, finish };
					})
				: Promise.resolve();
		layers = [
			...layers.map((layer) => ({ ...layer, leaving: true })),
			{ key, view, leaving: false }
		];
		await tick();
		if (destroyed || key !== nextKey - 1) return;
		// A layout change can clamp a scroller. Restore it before focus reveal and cue capture.
		for (const { scrollers } of retained) {
			for (const { element, top, left } of scrollers) {
				element.scrollTop = top;
				element.scrollLeft = left;
			}
		}
		const incoming = layerElement(key);
		// Resolve and reveal before motion samples the destination geometry.
		const fallback = target && incoming ? transferFocus(incoming, target) : false;
		const destination = stage && incoming ? captureGeometry(incoming, stage) : null;
		let flightFinished: Promise<unknown> = Promise.resolve();
		if (stage && incoming && destination) {
			const current = createFlight(stage, outgoing, destination, duration);
			flight = current;
			flightFinished = Promise.allSettled(
				current.animations.map((animation) => animation.finished)
			).then(() => {
				current.cancel();
				if (flight === current) flight = null;
			});
		}
		if (!incoming) finishIncomingFade(key);
		viewTransition =
			duration > 0 ? Promise.allSettled([flightFinished, fadeFinished]) : Promise.resolve();
		// The outgoing layers lost route input above. Now their DOM can exit.
		layers = layers.filter((layer) => !layer.leaving);

		announce(view, fallback);
	}

	let shown = untrack(() => active.id);
	$effect.pre(() => {
		const view = active.id;
		if (view === shown) return;
		shown = view;
		untrack(() => void change(view));
	});

	$effect(() => () => {
		destroyed = true;
		announcementGeneration++;
		incomingFade?.finish();
		incomingFade = null;
		flight?.cancel();
		clearTimeout(announceTimer);
		clearTimeout(layoutTimer);
		if (layoutToken) endTimelineLayoutChange(layoutToken);
	});

	// Svelte calls a transition with the node, so the parameter must exist. The fade does not use it.
	function layerFade(_node: Element) {
		void _node;
		// Outgoing content fades in the first 40 %, incoming content in the last 40 %.
		return {
			duration: motionDuration(VIEW_MOTION_MS),
			css: (t: number) => `opacity: ${Math.max(0, (t - 0.6) / 0.4)}`
		};
	}
</script>

<div
	bind:this={stage}
	{id}
	role="region"
	aria-label={m.diagram_region({ view: active.label() })}
	class={cn('relative flex min-h-21 min-w-0 flex-1 flex-col', className)}
	data-testid="diagram-stage"
	data-view={active.id}
>
	{#each layers as layer (layer.key)}
		{@const view = registry.resolve(layer.view)}
		<div
			class={cn(
				'isolate flex min-h-0 min-w-0 flex-1 flex-col',
				layer.leaving && 'pointer-events-none absolute inset-x-0 top-0'
			)}
			inert={layer.leaving}
			aria-hidden={layer.leaving || undefined}
			data-diagram-layer={layer.key}
			data-diagram-view={view.id}
			in:layerFade
			out:layerFade
			onintroend={() => finishIncomingFade(layer.key)}
		>
			<DiagramStageLayer
				{view}
				leaving={layer.leaving}
				{todayDate}
				{onBand}
				{onMilestone}
				{onReveal}
			/>
		</div>
	{/each}
	<div
		class="pointer-events-none absolute inset-0 z-10 overflow-hidden"
		data-diagram-flight
		inert
		aria-hidden="true"
	></div>
</div>
<p class="sr-only" aria-live="polite" data-testid="diagram-view-announcement">{announcement}</p>
