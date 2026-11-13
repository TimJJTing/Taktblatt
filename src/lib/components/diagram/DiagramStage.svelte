<!--
	The diagram stage in the Timeline body. Refer to docs/spec.md, section 5.13, and ADR 20.
	It renders the selected view from the registry. A view change:
	1. captures the current geometry and focus of the outgoing view,
	2. marks the outgoing layer inactive (no route input, inert) and mounts the incoming layer,
	3. moves task boxes by task id (FLIP) and cross-fades the layers in one ease-out transition,
	4. moves focus to the same task id, or to the selected switch choice,
	5. announces the final view in a polite live region.
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
	import { cn } from '#lib/utils.ts';
	import {
		applyTransition,
		captureGeometry,
		stopTransition,
		type TaskGeometry
	} from './diagram-motion.ts';
	import DiagramStageLayer from './DiagramStageLayer.svelte';
	import { focusSelectedChoice } from './DiagramViewSwitch.svelte';
	import {
		DIAGRAM_ATTR,
		ROUTE_ATTR,
		type DiagramViewId,
		type DiagramViewProps
	} from './view-contract.ts';
	import { getViewRegistry } from './view-registry.ts';

	interface Props extends DiagramViewProps {
		/** The id of the region. The switch choices control it. */
		id: string;
	}

	let { id, todayDate, class: className, onBand, onMilestone, onReveal }: Props = $props();

	const registry = getViewRegistry();
	const viewer = getViewer();
	const active = $derived(registry.resolve(viewer.diagramView));

	/** The delay before the announcement. Rapid changes announce only the final view. */
	const ANNOUNCE_DELAY_MS = 150;

	interface Layer {
		key: number;
		view: DiagramViewId;
		leaving: boolean;
	}

	let stage = $state<HTMLDivElement | null>(null);
	let layers = $state<Layer[]>([{ key: 0, view: untrack(() => active.id), leaving: false }]);
	let nextKey = 1;
	let animations: Animation[] = [];
	let announcement = $state('');
	let announceTimer: ReturnType<typeof setTimeout> | undefined;
	let layoutToken: symbol | undefined;
	let layoutTimer: ReturnType<typeof setTimeout> | undefined;

	const layerElement = (key: number) =>
		stage?.querySelector<HTMLElement>(`[${DIAGRAM_ATTR.layer}="${key}"]`) ?? null;

	/**
	 * The task id of the focused stage node. Focus on another stage control (for example a
	 * milestone) gives 'switch': that control leaves with the outgoing view.
	 */
	function focusedTask(): string | 'switch' | null {
		const focused = document.activeElement;
		if (!stage || !(focused instanceof Element) || !stage.contains(focused)) return null;
		return focused.closest(`[${ROUTE_ATTR.target}]`)?.getAttribute(ROUTE_ATTR.target) ?? 'switch';
	}

	/** The task box if it takes focus, else the task label, else a keyboard route target. */
	function focusTarget(root: HTMLElement, taskId: string): HTMLElement | null {
		const id = CSS.escape(taskId);
		const focusable = 'button, [tabindex]:not([tabindex="-1"])';
		const candidates = [
			root.querySelector<HTMLElement>(`[${DIAGRAM_ATTR.task}="${id}"]`),
			root.querySelector<HTMLElement>(`[${DIAGRAM_ATTR.label}="${id}"]`),
			...root.querySelectorAll<HTMLElement>(
				`[${ROUTE_ATTR.target}="${id}"][${ROUTE_ATTR.focus}="keyboard"]`
			)
		];
		return candidates.find((element) => element?.matches(focusable)) ?? null;
	}

	let announced = untrack(() => active.id);

	function announce(view: DiagramViewId) {
		clearTimeout(announceTimer);
		// Rapid changes announce only the final view. A return to the announced view is no change.
		announceTimer = setTimeout(() => {
			if (view === announced) return;
			announced = view;
			const label = registry.get(view)?.label() ?? view;
			announcement = '';
			void tick().then(() => (announcement = m.diagram_view_announcement({ view: label })));
		}, ANNOUNCE_DELAY_MS);
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
		// Capture the current frame before canceling interrupted motion.
		// A plain map: a local snapshot, not reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const outgoing = new Map<string, TaskGeometry>();
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const frames = new Map<number, Map<string, TaskGeometry>>();
		for (const layer of layers) {
			const element = layerElement(layer.key);
			if (!element || !stage) continue;
			const frame = captureGeometry(element, stage);
			frames.set(layer.key, frame);
			for (const [task, geometry] of frame) {
				if (!layer.leaving || !outgoing.has(task)) outgoing.set(task, geometry);
			}
		}
		// Running flights stay: applyTransition continues each box from its current frame.
		// A switch action keeps focus on the switch. Focus elsewhere is not taken.
		// The transfer happens one microtask later, so no user focus action can come between.
		const target = focusedTask();
		markLayoutChange(duration);

		const key = nextKey++;
		layers = [
			...layers.map((layer) => ({ ...layer, leaving: true })),
			{ key, view, leaving: false }
		];
		await tick();
		const incoming = layerElement(key);
		// Measure the destination before any transform: the FLIP start frame moves the boxes.
		const destination = stage && incoming ? captureGeometry(incoming, stage) : null;
		const focusElement =
			target && target !== 'switch' && incoming ? focusTarget(incoming, target) : null;
		const reveal = focusElement?.getBoundingClientRect();
		if (stage && incoming && destination) {
			// Keep only flights in progress. Finished and canceled ones hold removed elements.
			animations = animations.filter((animation) => animation.playState === 'running');
			animations.push(...applyTransition(incoming, stage, outgoing, duration, 'from'));
			for (const layer of layers) {
				const element = layer.leaving ? layerElement(layer.key) : null;
				if (element) {
					animations.push(
						...applyTransition(
							element,
							stage,
							destination,
							duration,
							'toward',
							frames.get(layer.key)
						)
					);
				}
			}
		}
		// The outgoing layers lost route input above. Now their DOM can exit.
		layers = layers.filter((layer) => !layer.leaving);

		if (focusElement && reveal) {
			focusElement.focus({ preventScroll: true });
			onReveal({ top: reveal.top, bottom: reveal.bottom });
		} else if (target) {
			focusSelectedChoice(id);
		}
		announce(view);
	}

	let shown = untrack(() => active.id);
	$effect.pre(() => {
		const view = active.id;
		if (view === shown) return;
		shown = view;
		untrack(() => void change(view));
	});

	$effect(() => () => {
		stopTransition(animations);
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
				'flex min-h-0 min-w-0 flex-1 flex-col',
				layer.leaving && 'pointer-events-none absolute inset-x-0 top-0'
			)}
			inert={layer.leaving}
			aria-hidden={layer.leaving || undefined}
			data-diagram-layer={layer.key}
			data-diagram-view={view.id}
			in:layerFade
			out:layerFade
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
</div>
<p class="sr-only" aria-live="polite" data-testid="diagram-view-announcement">{announcement}</p>
