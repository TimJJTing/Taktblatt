<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { SvelteMap } from 'svelte/reactivity';
	import { overlayScrollbar } from '#lib/components/app/overlay-scrollbar.ts';
	import { workspaceLayout } from '#lib/components/app/app-layout.svelte.ts';
	import { diagramRouteTargets } from '#lib/components/diagram/diagram-layer.ts';
	import type { DiagramViewProps } from '#lib/components/diagram/view-contract.ts';
	import { effectiveDependencyGraph, routeFocusModel } from '#lib/domain/route.ts';
	import { GEOMETRY_MOTION_MS, motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { kanbanBoard, kanbanEdges } from '#lib/scene/kanban-board.ts';
	import {
		kanbanScene,
		type KanbanCardGeometry,
		type KanbanRect
	} from '#lib/scene/kanban-scene.ts';
	import { getEditing } from '#lib/state/editing.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { GANTT_HEIGHT } from '#lib/state/viewer.svelte.ts';
	import KanbanColumn from './KanbanColumn.svelte';
	let { class: className, onReveal }: DiagramViewProps = $props();
	const clipId = $props.id();
	const ws = getWorkspace();
	const editing = getEditing();
	const board = $derived(kanbanBoard(ws.plan, ws.index));
	const ids = $derived(board.columns.flatMap((c) => c.cards.map((card) => card.id)));
	const targets = diagramRouteTargets(() => ids);
	const edges = $derived(kanbanEdges(ws.index, new Set(ids)));
	const graph = $derived(effectiveDependencyGraph(ws.index));
	const route = $derived(
		routeFocusModel(
			graph,
			ws.index,
			ids.map((id) => ({ id, isParent: false, expanded: false })),
			edges,
			editing.routeId
		)
	);
	const colors = $derived(new Map(ws.plan.stages.map((s) => [s.id, s.color])));
	let root: HTMLElement;
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
			if (!root || !vertical || !strip) return;
			const base = root.getBoundingClientRect();
			const v = vertical.getBoundingClientRect(),
				h = strip.getBoundingClientRect();
			const heading = root
				.querySelector<HTMLElement>('[data-testid="kanban-heading"]')
				?.getBoundingClientRect();
			const left = Math.max(v.left, h.left),
				top = Math.max(v.top, h.top) + (heading?.height ?? 0);
			viewport = {
				x: left - base.left,
				y: top - base.top,
				w: Math.max(0, Math.min(v.right, h.right) - left),
				h: Math.max(0, Math.min(v.bottom, h.bottom) - top)
			};
			const next = new SvelteMap<string, KanbanCardGeometry>();
			for (const node of root.querySelectorAll<HTMLElement>('[data-diagram-task]')) {
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
			observer.disconnect();
			window.removeEventListener('resize', measure);
			cancelAnimationFrame(frame);
			cancelAnimationFrame(motionFrame);
			for (const animation of animations.values()) animation.cancel();
			animations.clear();
		};
	});
	// Offset positions describe layout without the stage's temporary transforms.
	function layoutPosition(element: HTMLElement) {
		let x = 0;
		let y = 0;
		let current: HTMLElement | null = element;
		while (current) {
			const parent: HTMLElement | null = current.offsetParent as HTMLElement | null;
			x += current.offsetLeft + (parent?.clientLeft ?? 0);
			y += current.offsetTop + (parent?.clientTop ?? 0);
			current = parent;
		}
		return { x, y };
	}
	function reveal(id: string) {
		const action = root.querySelector<HTMLElement>(`[data-diagram-task="${CSS.escape(id)}"]`);
		if (!action) return;
		const position = layoutPosition(action);
		const verticalPosition = layoutPosition(vertical);
		const stripPosition = layoutPosition(strip);
		const top = position.y - verticalPosition.y - vertical.clientTop;
		const left = position.x - stripPosition.x - strip.clientLeft;
		const heading =
			root.querySelector<HTMLElement>('[data-testid="kanban-heading"]')?.offsetHeight ?? 0;
		const visibleTop = vertical.scrollTop + heading;
		const visibleBottom = vertical.scrollTop + vertical.clientHeight;
		const visibleLeft = strip.scrollLeft;
		const visibleRight = strip.scrollLeft + strip.clientWidth;
		if (top < visibleTop) vertical.scrollTop = top - heading;
		else if (top + action.offsetHeight > visibleBottom)
			vertical.scrollTop = top + action.offsetHeight - vertical.clientHeight;
		if (left < visibleLeft) strip.scrollLeft = left;
		else if (left + action.offsetWidth > visibleRight)
			strip.scrollLeft = left + action.offsetWidth - strip.clientWidth;
		const viewportTop = vertical.getBoundingClientRect().top + vertical.clientTop;
		const revealedTop = viewportTop + top - vertical.scrollTop;
		onReveal({ top: revealedTop, bottom: revealedTop + action.offsetHeight });
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
		let col = board.columns.findIndex((c) => c.cards.some((card) => card.id === id));
		const cards = board.columns[col].cards;
		let row = cards.findIndex((c) => c.id === id);
		if (event.key === 'Home') row = 0;
		else if (event.key === 'End') row = cards.length - 1;
		else if (event.key === 'ArrowUp') row = Math.max(0, row - 1);
		else if (event.key === 'ArrowDown') row = Math.min(cards.length - 1, row + 1);
		else {
			const step = event.key === 'ArrowRight' ? 1 : -1;
			let next = col + step;
			while (next >= 0 && next < board.columns.length && !board.columns[next].count) next += step;
			if (next >= 0 && next < board.columns.length) {
				col = next;
				row = Math.min(row, board.columns[col].count - 1);
			}
		}
		const next = board.columns[col].cards[row]?.id;
		if (next) {
			root
				.querySelector<HTMLElement>(`[data-diagram-label="${CSS.escape(next)}"]`)
				?.focus({ preventScroll: true });
			reveal(next);
		}
	}
	let previous = untrack(() => board.columns.map((c) => c.cards.map((card) => card.id)));
	let planId = untrack(() => ws.plan.id);
	$effect.pre(() => {
		const columns = board.columns.map((column) => column.cards.map((card) => card.id));
		if (!root) return;
		const before = new SvelteMap<string, DOMRect>();
		for (const node of root.querySelectorAll<HTMLElement>('[data-diagram-task]')) {
			before.set(node.dataset.diagramTask!, node.getBoundingClientRect());
		}
		untrack(() => {
			for (const animation of animations.values()) animation.cancel();
			animations.clear();
		});
		tick().then(() => {
			const duration = motionDuration(GEOMETRY_MOTION_MS);
			if (!root || !duration) {
				measure();
				return;
			}
			for (const id of columns.flat()) {
				const node = root.querySelector<HTMLElement>(`[data-diagram-task="${CSS.escape(id)}"]`);
				const old = before.get(id);
				if (!node || !old) continue;
				const next = node.getBoundingClientRect();
				const x = old.left - next.left,
					y = old.top - next.top;
				if (!x && !y) continue;
				const animation = node.animate(
					[{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }],
					{ duration, easing: 'ease-out' }
				);
				animations.set(id, animation);
				const finish = () => {
					if (animations.get(id) === animation) animations.delete(id);
					measure();
				};
				animation.onfinish = finish;
				animation.oncancel = finish;
			}
			cancelAnimationFrame(motionFrame);
			sampleMotion();
		});
	});
	$effect.pre(() => {
		const current = board.columns.map((c) => c.cards.map((card) => card.id));
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
		const prior = old.find((c) => c.includes(id));
		if (!prior) return;
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
		} else if (!nextIds.includes(id) && !editing.detailsTaskId) {
			const index = prior.indexOf(id);
			const fallback = [...prior.slice(index + 1), ...prior.slice(0, index).reverse()].find(
				(candidate) => nextIds.includes(candidate)
			);
			tick().then(() => {
				if (fallback) {
					root
						.querySelector<HTMLElement>(`[data-diagram-label="${CSS.escape(fallback)}"]`)
						?.focus({ preventScroll: true });
					reveal(fallback);
				} else document.querySelector<HTMLElement>('[data-testid="diagram-view-kanban"]')?.focus();
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
		class="min-h-0 flex-1 overflow-y-auto"
		data-testid="kanban-scroll"
		data-diagram-scroller
	>
		<div
			bind:this={strip}
			use:overlayScrollbar={{ axis: 'x' }}
			onscroll={measure}
			role="region"
			aria-label={m.kanban_strip()}
			class="relative z-[1] min-w-0 overflow-x-auto"
			style:container-type="inline-size"
			style:--kanban-scroll-top="{scrollTop}px"
			data-testid="kanban-strip"
			data-diagram-scroller
		>
			<div class="flex min-w-max" style="--column-width: min(100cqw, max(16rem, 25cqw));">
				{#each board.columns as column (column.id)}<div
						class="w-(--column-width) min-w-0 border-r last:border-r-0"
					>
						<KanbanColumn
							{column}
							{colors}
							dimmed={scene.dimmedCardIds}
							target={targets.target}
							onNavigate={navigate}
						/>
					</div>{/each}
			</div>
		</div>
		{#if board.emptyKind !== 'none'}<p class="p-3 text-sm" data-testid="kanban-empty">
				{board.emptyKind === 'no-tasks' ? m.kanban_empty_tasks() : m.kanban_empty_canceled()}
			</p>{/if}
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
	@media (forced-colors: active) {
		.cycle-casing {
			forced-color-adjust: none;
			stroke: Canvas;
		}
	}
</style>
