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
	import { VIEW_MOTION_MS, motionDuration } from '#lib/motion.ts';
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
	import { DIAGRAM_ATTR, GANTT_VIEW_ID, type DiagramViewProps } from './view-contract.ts';
	import { getViewRegistry } from './view-registry.ts';

	interface Props extends DiagramViewProps {
		/** The id of the region. The switch choices control it. */
		id: string;
	}

	let { id, todayDate, class: className, onBand, onMilestone, onReveal }: Props = $props();

	const registry = getViewRegistry();
	const viewer = getViewer();
	const active = $derived(registry.get(viewer.diagramView) ?? registry.get(GANTT_VIEW_ID)!);

	interface Layer {
		key: number;
		view: string;
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
	/** The task id whose focus moves to the incoming view, or 'switch'. */
	let pendingFocus: string | null = null;

	const layerElement = (key: number) =>
		stage?.querySelector<HTMLElement>(`[data-diagram-layer="${key}"]`) ?? null;

	/**
	 * The task id of the focused stage node. Focus on another stage control (for example a
	 * milestone) gives 'switch': that control leaves with the outgoing view.
	 */
	function focusedTask(): string | 'switch' | null {
		const focused = document.activeElement;
		if (!stage || !(focused instanceof Element) || !stage.contains(focused)) return null;
		return focused.closest('[data-route-target]')?.getAttribute('data-route-target') ?? 'switch';
	}

	/** The task box if it takes focus, else the task label, else a keyboard route target. */
	function focusTarget(root: HTMLElement, taskId: string): HTMLElement | null {
		const id = CSS.escape(taskId);
		const focusable = 'button, [tabindex]:not([tabindex="-1"])';
		const candidates = [
			root.querySelector<HTMLElement>(`[${DIAGRAM_ATTR.task}="${id}"]`),
			root.querySelector<HTMLElement>(`[${DIAGRAM_ATTR.label}="${id}"]`),
			...root.querySelectorAll<HTMLElement>(
				`[data-route-target="${id}"][data-route-focus="keyboard"]`
			)
		];
		return candidates.find((element) => element?.matches(focusable)) ?? null;
	}

	function focusSwitch() {
		document
			.querySelector<HTMLElement>(`[role="radio"][aria-controls="${id}"][aria-checked="true"]`)
			?.focus();
	}

	let announced = untrack(() => active.id);

	function announce(view: string) {
		clearTimeout(announceTimer);
		// Rapid changes announce only the final view. A return to the announced view is no change.
		announceTimer = setTimeout(() => {
			if (view === announced) return;
			announced = view;
			const label = registry.get(view)?.label() ?? view;
			announcement = '';
			void tick().then(() => (announcement = m.diagram_view_announcement({ view: label })));
		}, 150);
	}

	function markLayoutChange(duration: number) {
		if (layoutToken) endTimelineLayoutChange(layoutToken);
		clearTimeout(layoutTimer);
		const token = beginTimelineLayoutChange();
		layoutToken = token;
		layoutTimer = setTimeout(() => {
			endTimelineLayoutChange(token);
			if (layoutToken === token) layoutToken = undefined;
		}, duration + 32);
	}

	async function change(view: string) {
		const duration = motionDuration(VIEW_MOTION_MS);
		// Capture the current frame before canceling interrupted motion.
		// A plain map: a local snapshot, not reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const outgoing = new Map<string, TaskGeometry>();
		for (const layer of layers) {
			const element = layerElement(layer.key);
			if (!element || !stage) continue;
			for (const [task, geometry] of captureGeometry(element, stage)) {
				if (!layer.leaving || !outgoing.has(task)) outgoing.set(task, geometry);
			}
		}
		stopTransition(animations);
		animations = [];
		const focus = focusedTask();
		// A switch action keeps focus on the switch. Focus elsewhere is not taken.
		pendingFocus = focus;
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
		const target = pendingFocus;
		pendingFocus = null;
		const focusElement =
			target && target !== 'switch' && incoming ? focusTarget(incoming, target) : null;
		const reveal = focusElement?.getBoundingClientRect();
		if (stage && incoming && destination) {
			animations = applyTransition(incoming, stage, outgoing, duration, 'from');
			for (const layer of layers) {
				const element = layer.leaving ? layerElement(layer.key) : null;
				if (element) {
					animations.push(...applyTransition(element, stage, destination, duration, 'toward'));
				}
			}
		}
		// The outgoing layers lost route input above. Now their DOM can exit.
		layers = layers.filter((layer) => !layer.leaving);

		if (focusElement && reveal) {
			focusElement.focus({ preventScroll: true });
			onReveal({ top: reveal.top, bottom: reveal.bottom });
		} else if (target) {
			focusSwitch();
		}
		announce(view);
	}

	// A later user focus action cancels a pending transfer.
	function onFocusIn() {
		pendingFocus = null;
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

	function layerFade(_node: Element) {
		void _node;
		// Outgoing content fades in the first 40 %, incoming content in the last 40 %.
		return {
			duration: motionDuration(VIEW_MOTION_MS),
			css: (t: number) => `opacity: ${Math.max(0, (t - 0.6) / 0.4)}`
		};
	}
</script>

<svelte:document onfocusin={onFocusIn} />

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
		{@const view = registry.get(layer.view) ?? registry.get(GANTT_VIEW_ID)!}
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
