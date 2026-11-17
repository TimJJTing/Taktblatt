<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { SvelteMap } from 'svelte/reactivity';
	import { overlayScrollbar } from '#lib/components/app/overlay-scrollbar.ts';
	import { workspaceLayout } from '#lib/components/app/app-layout.svelte.ts';
	import { diagramRouteTargets } from '#lib/components/diagram/diagram-layer.ts';
	import { revealTarget, taskFocusTarget } from '#lib/components/diagram/diagram-focus.ts';
	import StatusKey from '#lib/components/diagram/StatusKey.svelte';
	import type { DiagramViewProps } from '#lib/components/diagram/view-contract.ts';
	import { effectiveDependencyGraph, routeFocusModel } from '#lib/domain/route.ts';
	import { GEOMETRY_MOTION_MS, motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { KANBAN_COLUMNS, kanbanSwimlanes } from '#lib/scene/kanban-board.ts';
	import { kanbanColumnLabel } from '#lib/scene/kanban-paper.ts';
	import {
		kanbanNodeEdges,
		kanbanScene,
		type KanbanCardGeometry,
		type KanbanRect
	} from '#lib/scene/kanban-scene.ts';
	import { getEditing } from '#lib/state/editing.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { GANTT_HEIGHT, getViewer } from '#lib/state/viewer.svelte.ts';
	import KanbanSwimlane from './KanbanSwimlane.svelte';
	let { class: className, onReveal }: DiagramViewProps = $props();
	const clipId = $props.id();
	const ws = getWorkspace();
	const editing = getEditing();
	const viewer = getViewer();
	const board = $derived(kanbanSwimlanes(ws.plan, ws.index));
	const rows = $derived(
		board.lanes.flatMap((lane) => [
			...KANBAN_COLUMNS.flatMap((column) =>
				lane.cells[column].map((card) => ({
					id: card.id,
					isParent: card.isParent,
					expanded: viewer.isExpanded(ws.plan.id, card.id)
				}))
			),
			...lane.families.flatMap((family) =>
				viewer.isExpanded(ws.plan.id, family.parentId)
					? family.children.map((item) => ({ id: item.id, isParent: false, expanded: false }))
					: []
			)
		])
	);
	const ids = $derived(rows.map((row) => row.id));
	const targets = diagramRouteTargets(() => ids);
	const edges = $derived(
		kanbanNodeEdges(ws.index, new Set(ids), (id) => ws.index.byId.get(id)?.parentId ?? null)
	);
	const graph = $derived(effectiveDependencyGraph(ws.index));
	const route = $derived(routeFocusModel(graph, ws.index, rows, edges, editing.routeId));
	let root = $state<HTMLElement>(undefined!);
	let vertical: HTMLDivElement;
	let strip: HTMLDivElement;
	let geometry = $state.raw(new Map<string, KanbanCardGeometry>());
	let viewport = $state.raw<KanbanRect>({ x: 0, y: 0, w: 0, h: 0 });
	const scene = $derived(kanbanScene({ edges, route, cards: geometry, viewport }));
	let frame = 0;
	let motionFrame = 0;
	const animations = new SvelteMap<string, Animation>();
	function sampleMotion() {
		measure();
		if (animations.size) motionFrame = requestAnimationFrame(sampleMotion);
	}
	let scrollTop = $state(0);
	function measure() {
		if (vertical) scrollTop = vertical.scrollTop;
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			if (!root?.isConnected || !vertical || !strip) return;
			const base = root.getBoundingClientRect();
			const v = vertical.getBoundingClientRect(),
				h = strip.getBoundingClientRect();
			const heading = root
				.querySelector<HTMLElement>('[data-testid="kanban-heading"]')
				?.getBoundingClientRect();
			const left =
					Math.max(v.left, h.left) + parseFloat(getComputedStyle(strip).scrollPaddingInlineStart),
				top = Math.max(v.top, h.top) + (heading?.height ?? 0);
			viewport = {
				x: left - base.left,
				y: top - base.top,
				w: Math.max(0, Math.min(v.right, h.right) - left),
				h: Math.max(0, Math.min(v.bottom, h.bottom) - top)
			};
			const next = new SvelteMap<string, KanbanCardGeometry>();
			const visibleIds = new Set(ids);
			for (const node of root.querySelectorAll<HTMLElement>('[data-diagram-task]')) {
				if (!visibleIds.has(node.dataset.diagramTask!)) continue;
				const box = node.getBoundingClientRect(),
					dot = node.querySelector<HTMLElement>('[data-diagram-station]')?.getBoundingClientRect();
				if (dot)
					next.set(node.dataset.diagramTask!, {
						box: { x: box.left - base.left, y: box.top - base.top, w: box.width, h: box.height },
						station: {
							x: dot.left + dot.width / 2 - base.left,
							y: dot.top + dot.height / 2 - base.top
						}
					});
			}
			geometry = next;
		});
	}
	$effect(() => {
		void ids;
		void route;
		tick().then(measure);
	});
	onMount(() => {
		const observer = new ResizeObserver(measure);
		observer.observe(root);
		observer.observe(vertical);
		observer.observe(strip);
		window.addEventListener('resize', measure);
		measure();
		return () => {
			motionRevision++;
			observer.disconnect();
			window.removeEventListener('resize', measure);
			cancelAnimationFrame(frame);
			cancelAnimationFrame(motionFrame);
			for (const animation of animations.values()) animation.cancel();
			animations.clear();
		};
	});
	function reveal(id: string) {
		const action = taskFocusTarget(root, id);
		const box = action?.closest<HTMLElement>('[data-diagram-task]');
		if (box) revealTarget(box, root, onReveal);
	}

	function revealFocused(event: FocusEvent) {
		const target = event.target;
		if (!(target instanceof HTMLElement) || !target.matches(':focus-visible')) return;
		const id = target.closest<HTMLElement>('[data-diagram-task]')?.dataset.diagramTask;
		if (id) reveal(id);
	}
	function navigate(event: KeyboardEvent, id: string) {
		const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
		if (!keys.includes(event.key)) return;
		event.preventDefault();
		const lane = board.lanes.find((lane) =>
			KANBAN_COLUMNS.some((column) => lane.cells[column].some((card) => card.id === id))
		);
		if (!lane) return;
		const col = KANBAN_COLUMNS.findIndex((column) =>
			lane.cells[column].some((card) => card.id === id)
		);
		const column = KANBAN_COLUMNS[col];
		let next = id;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			const ordinal = lane.cells[column].findIndex((card) => card.id === id);
			const step = event.key === 'ArrowRight' ? 1 : -1;
			let neighbor = col + step;
			while (
				neighbor >= 0 &&
				neighbor < KANBAN_COLUMNS.length &&
				!lane.cells[KANBAN_COLUMNS[neighbor]].length
			)
				neighbor += step;
			if (neighbor >= 0 && neighbor < KANBAN_COLUMNS.length) {
				const cards = lane.cells[KANBAN_COLUMNS[neighbor]];
				next = cards[Math.min(ordinal, cards.length - 1)].id;
			}
		} else {
			const cards = board.lanes.flatMap((lane) => lane.cells[column]);
			let ordinal = cards.findIndex((card) => card.id === id);
			if (event.key === 'Home') ordinal = 0;
			else if (event.key === 'End') ordinal = cards.length - 1;
			else if (event.key === 'ArrowUp') ordinal = Math.max(0, ordinal - 1);
			else ordinal = Math.min(cards.length - 1, ordinal + 1);
			next = cards[ordinal].id;
		}
		if (next) {
			taskFocusTarget(root, next)?.focus({ preventScroll: true });
			reveal(next);
		}
	}
	const columnIds = () =>
		KANBAN_COLUMNS.map((column) =>
			board.lanes.flatMap((lane) => lane.cells[column].map((card) => card.id))
		);
	let previous = untrack(columnIds);
	let planId = untrack(() => ws.plan.id);
	let motionRevision = 0;
	const movingSelector =
		'[data-testid="kanban-swimlane"], [data-testid="kanban-family"], [data-diagram-task]';
	function motionKey(node: HTMLElement): string {
		if (node.dataset.diagramTask) return `task:${node.dataset.diagramTask}`;
		if (node.dataset.parent) return `family:${node.dataset.parent}`;
		return `lane:${node.dataset.stage}`;
	}
	/** Read content coordinates so reveal scrolling does not become a card move. */
	function motionPosition(node: HTMLElement, origin: DOMRect): { x: number; y: number } {
		const box = node.getBoundingClientRect();
		return {
			x: box.left - origin.left + strip.scrollLeft,
			y: box.top - origin.top + strip.scrollTop
		};
	}
	$effect.pre(() => {
		void board;
		void rows;
		if (!root || !strip) return;
		const revision = ++motionRevision;
		const origin = strip.getBoundingClientRect();
		const before = new SvelteMap<string, { x: number; y: number }>();
		for (const node of root.querySelectorAll<HTMLElement>(movingSelector)) {
			before.set(motionKey(node), motionPosition(node, origin));
		}
		untrack(() => {
			for (const animation of animations.values()) animation.cancel();
			animations.clear();
		});
		tick().then(() => {
			const duration = motionDuration(GEOMETRY_MOTION_MS);
			if (!root?.isConnected || !strip || revision !== motionRevision) return;
			if (!duration) {
				measure();
				return;
			}
			const nodes = [...root.querySelectorAll<HTMLElement>(movingSelector)];
			const origin = strip.getBoundingClientRect();
			const deltas = new Map<HTMLElement, { x: number; y: number }>(
				nodes.map((node) => {
					const old = before.get(motionKey(node));
					const next = motionPosition(node, origin);
					return [node, { x: old ? old.x - next.x : 0, y: old ? old.y - next.y : 0 }];
				})
			);
			for (const node of nodes) {
				const key = motionKey(node);
				if (!before.has(key)) continue;
				// A child receives only the part of the move that its ancestor does not carry.
				const parent = node.parentElement?.closest<HTMLElement>(movingSelector);
				const ancestor = parent ? deltas.get(parent) : undefined;
				const delta = deltas.get(node)!;
				const x = delta.x - (ancestor?.x ?? 0),
					y = delta.y - (ancestor?.y ?? 0);
				if (!x && !y) continue;
				const animation = node.animate(
					[{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }],
					{ duration, easing: 'ease-out' }
				);
				animations.set(key, animation);
				const finish = () => {
					if (animations.get(key) !== animation) return;
					animations.delete(key);
					measure();
					const active = document.activeElement;
					if (active instanceof HTMLElement && root?.contains(active)) {
						const id = active.closest<HTMLElement>('[data-diagram-task]')?.dataset.diagramTask;
						if (id) reveal(id);
					}
				};
				animation.onfinish = finish;
				animation.oncancel = () => {
					if (animations.get(key) === animation) animations.delete(key);
					measure();
				};
			}
			cancelAnimationFrame(motionFrame);
			sampleMotion();
		});
	});
	$effect.pre(() => {
		const current = columnIds();
		const nextPlan = ws.plan.id;
		const active = document.activeElement as HTMLElement | null;
		const card = active?.closest<HTMLElement>('[data-diagram-task]');
		const id = card?.dataset.diagramTask;
		const station = !!active?.hasAttribute('data-route-touch');
		const old = previous;
		previous = current;
		if (planId !== nextPlan) {
			planId = nextPlan;
			if (vertical) vertical.scrollTop = 0;
			if (strip) strip.scrollLeft = 0;
			return;
		}
		if (!id || !root?.contains(active)) return;
		const priorColumn = old.findIndex((c) => c.includes(id));
		if (priorColumn < 0) return;
		const nextIds = current.flat();
		if (nextIds.includes(id) && current.some((c, i) => c.includes(id) && !old[i]?.includes(id))) {
			tick().then(() => {
				root
					.querySelector<HTMLElement>(
						`[data-diagram-task="${CSS.escape(id)}"] ${station ? '[data-route-touch]' : '[data-diagram-label]'}`
					)
					?.focus({ preventScroll: true });
				reveal(id);
			});
		}
	});
</script>

<div
	bind:this={root}
	role="group"
	aria-label={m.diagram_view_kanban()}
	class="relative flex min-h-21 min-w-0 flex-1 flex-col rounded-md border bg-background {className ??
		''}"
	data-testid="kanban"
	style:max-height="{(workspaceLayout.split ? GANTT_HEIGHT.max : GANTT_HEIGHT.narrowMax) * 100}dvh"
	onfocusin={revealFocused}
>
	<div
		bind:this={vertical}
		use:overlayScrollbar={{ axis: 'y' }}
		onscroll={measure}
		role="region"
		aria-label={m.kanban_scroll()}
		class="min-h-0 flex-1 scroll-pt-10 overflow-y-auto"
		data-testid="kanban-scroll"
		data-diagram-scroller
	>
		<div
			bind:this={strip}
			use:overlayScrollbar={{ axis: 'x', host: root }}
			onscroll={measure}
			role="region"
			aria-label={m.kanban_strip()}
			class="relative z-[1] min-w-0 overflow-x-auto"
			style:container-type="inline-size"
			style:scroll-padding-inline-start="6rem"
			style:--kanban-scroll-top="{scrollTop}px"
			data-testid="kanban-strip"
			data-diagram-scroller
		>
			<div class="min-w-[36rem]" style="--kanban-tracks: 6rem repeat(4, minmax(7.5rem, 1fr));">
				<div
					class="headings relative z-30 grid border-b bg-background"
					style:grid-template-columns="var(--kanban-tracks)"
					style:transform="translateY(var(--kanban-scroll-top, 0px))"
				>
					<div class="sticky start-0 z-10 bg-background" aria-hidden="true"></div>
					{#each board.columns as column (column.id)}
						<h3
							class="flex h-10 min-w-0 items-center justify-between gap-1 px-2 text-sm font-semibold"
							data-testid="kanban-heading"
							data-column={column.id}
						>
							{kanbanColumnLabel(column.id)} <span data-testid="kanban-count">{column.count}</span>
						</h3>
					{/each}
				</div>
				{#each board.lanes as lane (lane.stageId)}
					<KanbanSwimlane
						{lane}
						dimmed={scene.dimmedCardIds}
						target={targets.target}
						onNavigate={navigate}
					/>
				{/each}
			</div>
		</div>
		{#if board.emptyKind !== 'none'}<p class="p-3 text-sm" data-testid="kanban-empty">
				{board.emptyKind === 'no-tasks' ? m.kanban_empty_tasks() : m.kanban_empty_canceled()}
			</p>{/if}
		<div class="space-y-1 border-t px-3 py-2 text-xs text-muted-foreground"><StatusKey /></div>
	</div>
	<svg class="pointer-events-none absolute inset-0 z-0 size-full" aria-hidden="true"
		><defs
			><clipPath id={clipId}
				><rect x={viewport.x} y={viewport.y} width={viewport.w} height={viewport.h} /></clipPath
			></defs
		><g clip-path={`url(#${clipId})`}
			>{#each scene.paths as path (path.key)}{@const d = path.points
					.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`)
					.join(' ')}<g transition:fade={{ duration: motionDuration(150) }}>
					<path
						{d}
						class:cycle-casing={path.cycle}
						fill="none"
						stroke="var(--background)"
						stroke-width="4"
					/>
					<path
						{d}
						class:text-destructive={path.cycle}
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-dasharray={path.cycle ? '1 4' : undefined}
						stroke-linecap={path.cycle ? 'round' : undefined}
						data-testid="kanban-dependency"
						data-from={path.from}
						data-to={path.to}
						data-cycle={path.cycle ? 'true' : undefined}
					/>
				</g>{/each}</g
		></svg
	>
</div>

<style>
	:global([data-testid='kanban'] > [data-overlay-scrollbar]:has([data-overlay-thumb='x'])) {
		top: 0 !important;
		height: 100% !important;
	}

	@media (forced-colors: active) {
		.cycle-casing {
			forced-color-adjust: none;
			stroke: Canvas;
		}
	}
</style>
