<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { overlayScrollbar } from '#lib/components/app/overlay-scrollbar.ts';
	import StageBadge from '#lib/components/diagram/StageBadge.svelte';
	import { diagramRouteTargets } from '#lib/components/diagram/diagram-layer.ts';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import type { DiagramViewProps } from '#lib/components/diagram/view-contract.ts';
	import { stageColorVar, type RoutePaint } from '#lib/components/plan/colors.ts';
	import { joinList } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import { effectiveDependencyGraph, routeFocusModel } from '#lib/domain/route.ts';
	import { routeMapModel } from '#lib/domain/route-map.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { routeMapLayout } from '#lib/scene/route-map-layout.ts';
	import { routeMapRoutes } from '#lib/scene/route-map-router.ts';
	import { getEditing } from '#lib/state/editing.svelte.ts';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import { cn } from '#lib/utils.ts';
	import RouteMapStation from './RouteMapStation.svelte';

	let { class: className }: DiagramViewProps = $props();
	const ws = getWorkspace();
	const viewer = getViewer();
	const editing = getEditing();
	const model = $derived(
		routeMapModel(
			ws.plan,
			new Set(ws.plan.tasks.filter((t) => viewer.isExpanded(ws.plan.id, t.id)).map((t) => t.id))
		)
	);
	const layout = $derived(
		routeMapLayout(model, {
			stationSize: 16,
			hitSize: 28,
			labelWidth: 120,
			labelHeight: 36,
			columnGap: 28,
			stageGap: 130,
			laneGap: 24,
			clearance: 8,
			measureText: (text) => text.length * 7
		})
	);
	const routes = $derived(routeMapRoutes(model, layout));
	const nodes = $derived(new Map(model.nodes.map((node) => [node.id, node])));
	const stations = $derived(new Map(layout.stations.map((station) => [station.id, station])));
	const stages = $derived(new Map(ws.plan.stages.map((stage) => [stage.id, stage])));
	const routeTargets = diagramRouteTargets(() => model.nodes.map((node) => node.id));
	const rows = $derived(
		model.nodes.map((node) => ({
			id: node.id,
			isParent: (ws.index.children.get(node.id)?.length ?? 0) > 0,
			expanded: viewer.isExpanded(ws.plan.id, node.id)
		}))
	);
	const focus = $derived(
		routeFocusModel(effectiveDependencyGraph(ws.index), ws.index, rows, routes, editing.routeId)
	);
	const paint = (lit: boolean): RoutePaint => (focus.active ? (lit ? 'lit' : 'off') : null);
	const width = $derived(Math.max(300, layout.width));
	const height = $derived(Math.max(160, layout.height));
	function directions(id: string) {
		const names = (ids: string[]) =>
			joinList(
				ids.map((taskId) => nodes.get(taskId)?.title || m.route_map_untitled_task()),
				uiIntl()
			);
		const predecessors = model.edges.filter((edge) => edge.to === id).map((edge) => edge.from);
		const successors = model.edges.filter((edge) => edge.from === id).map((edge) => edge.to);
		return joinList(
			[
				predecessors.length ? m.route_map_predecessors({ tasks: names(predecessors) }) : '',
				successors.length ? m.route_map_successors({ tasks: names(successors) }) : ''
			].filter(Boolean),
			uiIntl()
		);
	}
	const groups = $derived(layout.stations.filter((s) => !nodes.get(s.id)?.parentId));
	$effect.pre(() => {
		const visible = new Set(model.nodes.map((node) => node.id));
		const active = document.activeElement;
		if (!(active instanceof HTMLElement)) return;
		const target = active.closest<HTMLElement>('[data-diagram-task]');
		const id = target?.dataset.diagramTask;
		if (!id || visible.has(id)) return;
		const parent = target.dataset.diagramParent;
		void tick().then(() => {
			const replacement =
				parent &&
				document.querySelector<HTMLElement>(
					`button[data-route-target="${CSS.escape(parent)}"][data-route-focus="keyboard"]`
				);
			(
				replacement || document.querySelector<HTMLElement>('[data-testid="diagram-view-route-map"]')
			)?.focus();
		});
	});
	const childId = (id: string) => `route-map-family-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
	const guides = $derived.by(() =>
		model.stages.flatMap((stage) => {
			const members = layout.stations.filter(
				(station) => nodes.get(station.id)?.stageId === stage.id
			);
			return members.slice(1).map((station, i) => ({
				key: `${stage.id}:${members[i].id}:${station.id}`,
				stageId: stage.id,
				points: [members[i].outPort, station.inPort]
			}));
		})
	);
	const loops = $derived.by(() =>
		layout.loops.flatMap((loop) => {
			const parent = stations.get(loop.taskIds[0]);
			const last = stations.get(loop.taskIds.at(-1)!);
			if (!parent || !last) return [];
			const y =
				Math.max(parent.labelBox.y + parent.labelBox.h, last.labelBox.y + last.labelBox.h) + 10;
			return [
				{
					key: loop.taskIds.join(':'),
					stageId: nodes.get(parent.id)!.stageId,
					points: [
						parent.outPort,
						{ x: parent.outPort.x + 8, y },
						{ x: last.inPort.x - 8, y },
						last.inPort
					]
				}
			];
		})
	);
	let stageTweens = $state.raw(new Map<string, GeometryTween<number>>());
	$effect(() => {
		const stages = model.stages;
		const ys = layout.stageYs;
		const previous = untrack(() => stageTweens);
		stageTweens = new Map(
			stages.map((stage, i) => {
				const y = Math.max(0, (ys[i] ?? 0) - 38);
				const tween = previous.get(stage.id) ?? new GeometryTween(y);
				tween.set(y);
				return [stage.id, tween];
			})
		);
	});
	let decorationTweens = $state.raw(new Map<string, GeometryTween<{ x: number; y: number }[]>>());
	$effect(() => {
		const next = [...guides, ...loops];
		const previous = untrack(() => decorationTweens);
		decorationTweens = new Map(
			next.map((line) => {
				const tween = previous.get(line.key) ?? new GeometryTween(line.points);
				tween.set(line.points);
				return [line.key, tween];
			})
		);
	});
	let tweens = $state.raw(new Map<string, GeometryTween<{ x: number; y: number }[]>>());
	$effect(() => {
		const next = routes;
		const previous = untrack(() => tweens);
		tweens = new Map(
			next.map((edge) => {
				const points = [...edge.points];
				const tween = previous.get(edge.key) ?? new GeometryTween(points);
				tween.set(points, { snap: previous.get(edge.key)?.current.length !== points.length });
				return [edge.key, tween];
			})
		);
	});
	const path = (points: readonly { x: number; y: number }[]) =>
		points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
</script>

<div
	class={cn('flex min-h-21 min-w-0 flex-1 flex-col rounded-md border bg-background', className)}
	data-testid="route-map"
>
	<div
		use:overlayScrollbar={{ axis: 'both' }}
		class="min-h-0 flex-1 overflow-auto"
		data-diagram-scroller
		data-testid="route-map-scroller"
	>
		{#if model.stages.length === 0}
			<p class="p-4 text-sm text-muted-foreground">{m.route_map_empty()}</p>
		{:else}
			<div class="relative" style:width="{width}px" style:height="{height}px">
				<svg
					class="pointer-events-none absolute inset-0 overflow-visible"
					{width}
					{height}
					aria-hidden="true"
				>
					{#each guides as guide (guide.key)}
						<path
							data-testid="route-map-guide"
							d={path(decorationTweens.get(guide.key)?.current ?? guide.points)}
							fill="none"
							stroke={stageColorVar(stages.get(guide.stageId)!.color)}
							stroke-width="2"
						/>
					{/each}
					{#each loops as loop (loop.key)}
						<path
							d={path(decorationTweens.get(loop.key)?.current ?? loop.points)}
							fill="none"
							stroke={stageColorVar(stages.get(loop.stageId)!.color)}
							stroke-width="1"
							stroke-dasharray="3 3"
						/>
					{/each}
					{#each routes as edge (edge.key)}
						{#if edge.cycle}
							<path
								d={path(tweens.get(edge.key)?.current ?? edge.points)}
								fill="none"
								stroke="var(--background)"
								stroke-width="5"
							/>
						{/if}
						<path
							data-testid="route-map-dependency"
							data-from={edge.from}
							data-to={edge.to}
							data-route={paint(focus.litLineKeys.has(edge.key)) ?? undefined}
							d={path(tweens.get(edge.key)?.current ?? edge.points)}
							fill="none"
							class="dependency"
							class:cycle={edge.cycle}
							style:transition-duration={`${motionDuration(150)}ms`}
						/>
					{/each}
				</svg>
				{#each model.stages as stage, i (stage.id)}
					<div
						class="absolute left-0 z-10 flex items-center gap-1 text-xs"
						style:top="{stageTweens.get(stage.id)?.current ??
							Math.max(0, (layout.stageYs[i] ?? 0) - 38)}px"
					>
						<StageBadge color={stages.get(stage.id)!.color} label={stages.get(stage.id)!.title} />
						<span class="whitespace-nowrap">{m.route_map_to_go({ count: stage.toGo })}</span>
					</div>
				{/each}
				{#each groups as station (station.id)}
					{@const node = nodes.get(station.id)!}
					{@const stage = stages.get(node.stageId)!}
					{@const children = layout.stations.filter((s) => nodes.get(s.id)?.parentId === node.id)}
					<RouteMapStation
						{node}
						{station}
						{stage}
						routeTarget={routeTargets.target}
						route={paint(focus.onRouteRowIds.has(node.id))}
						description={directions(node.id)}
						hasChildren={(ws.index.children.get(node.id)?.length ?? 0) > 0}
						expanded={viewer.isExpanded(ws.plan.id, node.id)}
						controls={childId(node.id)}
					/>
					<div id={childId(node.id)} class="contents">
						{#each children as child (child.id)}
							{@const childNode = nodes.get(child.id)!}
							<RouteMapStation
								node={childNode}
								station={child}
								stage={stages.get(childNode.stageId)!}
								routeTarget={routeTargets.target}
								route={paint(focus.onRouteRowIds.has(child.id))}
								description={directions(child.id)}
								hasChildren={false}
								expanded={false}
								controls={childId(child.id)}
							/>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.dependency {
		stroke: var(--muted-foreground);
		stroke-width: 2;
		transition-property: stroke, opacity;
	}
	.dependency[data-route='lit'] {
		stroke: var(--foreground);
	}
	.dependency[data-route='off'] {
		opacity: 0.25;
	}
	.dependency.cycle {
		stroke-dasharray: 4 3;
	}
	@media (forced-colors: active) {
		.dependency {
			forced-color-adjust: none;
			stroke: CanvasText;
		}
		.dependency[data-route='lit'] {
			stroke: Highlight;
		}
	}
</style>
