<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { overlayScrollbar } from '#lib/components/app/overlay-scrollbar.ts';
	import StageBadge from '#lib/components/diagram/StageBadge.svelte';
	import { diagramRouteTargets } from '#lib/components/diagram/diagram-layer.ts';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import type { DiagramViewProps } from '#lib/components/diagram/view-contract.ts';
	import { markColorLevel, stageColorVar, type RoutePaint } from '#lib/components/plan/colors.ts';
	import { joinList, joinSentences } from '#lib/domain/format.ts';
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
	const instanceId = $props.id();
	let root: HTMLDivElement;
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
			hitSize: 28,
			labelWidth: 120,
			labelHeight: 36,
			columnGap: 28,
			stageGap: 130,
			laneGap: 24,
			clearance: 8
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
	const width = $derived(Math.max(300, layout.width + 180));
	const height = $derived(Math.max(160, layout.height));
	function directions(id: string) {
		const names = (ids: string[]) =>
			joinList(
				ids.map((taskId) => nodes.get(taskId)?.title || m.route_map_untitled_task()),
				uiIntl()
			);
		const predecessors = model.edges.filter((edge) => edge.to === id).map((edge) => edge.from);
		const successors = model.edges.filter((edge) => edge.from === id).map((edge) => edge.to);
		return joinSentences(
			[
				predecessors.length ? m.route_map_predecessors({ tasks: names(predecessors) }) : '',
				successors.length ? m.route_map_successors({ tasks: names(successors) }) : '',
				nodes.get(id)?.parentId
					? m.route_map_subtask_of({
							task: nodes.get(nodes.get(id)!.parentId!)?.title || m.route_map_untitled_task()
						})
					: '',
				...model.warnings
					.filter((w) =>
						model.edges.some(
							(edge) =>
								(edge.from === id || edge.to === id) &&
								edge.stored.some(
									(stored) => stored.taskId === w.taskId && stored.dependencyId === w.dependencyId
								)
						)
					)
					.map((w) =>
						w.kind === 'cycle'
							? m.dependency_warning_cycle()
							: w.kind === 'subtask_scope'
								? m.dependency_warning_subtask_scope()
								: w.kind === 'date' && w.taskId === id
									? m.dependency_warning({
											task: ws.index.byId.get(w.dependencyId)?.title || m.route_map_untitled_task()
										})
									: ''
					)
			].filter(Boolean),
			uiIntl()
		);
	}
	const groups = $derived(
		model.stages.flatMap((stage) =>
			layout.stations.filter(
				(s) => nodes.get(s.id)?.stageId === stage.id && !nodes.get(s.id)?.parentId
			)
		)
	);
	$effect.pre(() => {
		const visible = new Set(model.nodes.map((node) => node.id));
		const active = document.activeElement;
		if (!(active instanceof HTMLElement)) return;
		const target = active.closest<HTMLElement>('[data-route-map-task]');
		const id = target?.dataset.routeMapTask;
		if (!id || visible.has(id)) return;
		const parent = target.dataset.routeMapParent;
		void tick().then(() => {
			const replacement =
				parent &&
				root.querySelector<HTMLElement>(
					`button[data-route-target="${CSS.escape(parent)}"][data-route-focus="keyboard"]`
				);
			(
				replacement || document.querySelector<HTMLElement>('[data-testid="diagram-view-route-map"]')
			)?.focus();
		});
	});
	const childId = (id: string) =>
		`${instanceId}-family-${Array.from(id, (c) => c.codePointAt(0)!.toString(16)).join('-')}`;
	const guides = $derived.by(() =>
		model.stages.flatMap((stage, i) => {
			const members = layout.stations.filter(
				(station) => nodes.get(station.id)?.stageId === stage.id && !nodes.get(station.id)?.parentId
			);
			if (!members.length)
				return [
					{
						key: `${stage.id}:empty`,
						stageId: stage.id,
						ids: [] as string[],
						points: [
							{ x: 8, y: layout.stageYs[i] },
							{ x: 100, y: layout.stageYs[i] }
						]
					}
				];

			return members.slice(1).map((station, j) => ({
				key: `${stage.id}:${members[j].id}:${station.id}`,
				stageId: stage.id,
				ids: [members[j].id, station.id],
				points: [members[j].outPort, station.inPort]
			}));
		})
	);
	const loops = $derived.by(() =>
		layout.loops.flatMap((loop) => {
			const parent = stations.get(loop.taskIds[0]);
			const children = loop.taskIds
				.slice(1)
				.map((id) => stations.get(id))
				.filter((s) => s !== undefined);
			const last = children.at(-1);
			if (!parent || !last) return [];
			const x1 = parent.labelBox.x + parent.labelBox.w + layout.clearance / 2,
				x2 = last.labelBox.x + last.labelBox.w + layout.clearance / 2;
			const stageId = nodes.get(parent.id)!.stageId;
			const first = children[0];
			return [
				{
					key: `${parent.id}:branch-start`,
					stageId,
					ids: [parent.id, first.id],
					points: [
						parent.outPort,
						{ x: x1, y: parent.outPort.y },
						{ x: x1, y: first.inPort.y },
						first.inPort
					]
				},
				...children.slice(1).map((child, i) => ({
					key: `${parent.id}:branch:${children[i].id}:${child.id}`,
					stageId,
					ids: [children[i].id, child.id],
					points: [children[i].outPort, child.inPort]
				})),
				{
					key: `${parent.id}:branch-end`,
					stageId,
					ids: [last.id],
					points: [last.outPort, { x: x2, y: last.outPort.y }, { x: x2, y: parent.outPort.y }]
				}
			];
		})
	);
	function lineColor(stageId: string, ids: readonly string[]) {
		const statuses = ids.map((id) => nodes.get(id)?.status);
		const dim =
			statuses.includes('canceled') ||
			(statuses.length > 1 && statuses.every((status) => status === 'done'));
		const off = focus.active && (!ids.length || !ids.every((id) => focus.onRouteRowIds.has(id)));
		const level = markColorLevel(dim ? 'done' : 'todo', 'line', off);
		return `color-mix(in oklab, ${stageColorVar(stages.get(stageId)!.color)} ${level}%, var(--background, #FFFFFF))`;
	}

	const termini = $derived(
		model.stages.map((stage, i) => {
			const members = layout.stations.filter(
				(station) => nodes.get(station.id)?.stageId === stage.id && !nodes.get(station.id)?.parentId
			);
			const last = members.at(-1);
			const branch = last && layout.loops.find((loop) => loop.taskIds[0] === last.id);
			const branchEnd = branch && stations.get(branch.taskIds.at(-1)!);
			const x = branchEnd
				? branchEnd.labelBox.x + branchEnd.labelBox.w + layout.clearance / 2
				: last
					? last.outPort.x
					: 100;
			return { id: stage.id, ids: last ? [last.id] : [], x, y: layout.stageYs[i] };
		})
	);
	let terminusTweens = $state.raw(new Map<string, GeometryTween<{ x: number; y: number }>>());
	$effect(() => {
		const previous = untrack(() => terminusTweens);
		terminusTweens = new Map(
			termini.map(({ id, x, y }) => {
				const tween = previous.get(id) ?? new GeometryTween({ x, y });
				tween.set({ x, y });
				return [id, tween];
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
				tween.set(points);
				return [edge.key, tween];
			})
		);
	});
	const path = (points: readonly { x: number; y: number }[]) =>
		points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
</script>

<div
	bind:this={root}
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
							stroke={lineColor(guide.stageId, guide.ids)}
							stroke-width="2"
							class="route-paint"
							style:transition-duration={`${motionDuration(150)}ms`}
						/>
					{/each}
					{#each termini as terminus (terminus.id)}
						{@const point = terminusTweens.get(terminus.id)?.current ?? terminus}
						<path
							d={`M ${point.x} ${point.y} h 20`}
							fill="none"
							stroke={lineColor(terminus.id, terminus.ids)}
							stroke-width="2"
							class="route-paint"
							style:transition-duration={`${motionDuration(150)}ms`}
						/>
					{/each}
					{#each loops as loop (loop.key)}
						<path
							d={path(decorationTweens.get(loop.key)?.current ?? loop.points)}
							fill="none"
							stroke={lineColor(loop.stageId, loop.ids)}
							stroke-width="1"
							class="route-paint"
							style:transition-duration={`${motionDuration(150)}ms`}
						/>
					{/each}
					{#each routes as edge (edge.key)}
						{#if edge.cycle}
							<path
								d={path(tweens.get(edge.key)?.current ?? edge.points)}
								fill="none"
								stroke="var(--background)"
								stroke-width="5"
								class="cycle-casing"
							/>
						{/if}
						<path
							data-testid="route-map-dependency"
							data-from={edge.from}
							data-to={edge.to}
							data-route={edge.cycle
								? paint(focus.litLineKeys.has(edge.key)) === 'lit'
									? 'lit'
									: undefined
								: (paint(focus.litLineKeys.has(edge.key)) ?? undefined)}
							d={path(tweens.get(edge.key)?.current ?? edge.points)}
							fill="none"
							class="dependency"
							class:cycle={edge.cycle}
							stroke={edge.cycle
								? 'var(--destructive)'
								: `color-mix(in oklab, ${paint(focus.litLineKeys.has(edge.key)) === 'lit' ? 'var(--foreground)' : 'var(--muted-foreground)'} ${markColorLevel(nodes.get(edge.from)?.status ?? 'todo', 'connector', paint(focus.litLineKeys.has(edge.key)) === 'off')}%, var(--background, #FFFFFF))`}
							stroke-dasharray={edge.cycle ? '1 4' : undefined}
							stroke-linecap={edge.cycle ? 'round' : undefined}
							style:transition-duration={`${motionDuration(150)}ms`}
						/>
					{/each}
				</svg>
				{#each model.stages as stage, i (stage.id)}
					{@const point = terminusTweens.get(stage.id)?.current ?? termini[i]}
					<div
						class="absolute z-10 flex items-center gap-1 text-xs"
						style:left="{point.x + 24}px"
						style:top="{point.y - 10}px"
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
	.route-paint,
	.dependency {
		transition-property: stroke;
	}
	.dependency {
		stroke-width: 2;
	}
	@media (forced-colors: active) {
		.cycle-casing {
			forced-color-adjust: none;
			stroke: Canvas;
		}
		.dependency {
			forced-color-adjust: none;
			stroke: CanvasText;
		}
		.dependency[data-route='lit'] {
			stroke: Highlight;
		}
	}
</style>
