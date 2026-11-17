<script lang="ts">
	import { untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { overlayScrollbar } from '#lib/components/app/overlay-scrollbar.ts';
	import StatusKey from '#lib/components/diagram/StatusKey.svelte';
	import GanttLine from '#lib/components/timeline/GanttLine.svelte';
	import RouteMapDecoration from './RouteMapDecoration.svelte';
	import RouteMapStageLabel from './RouteMapStageLabel.svelte';
	import { diagramRouteTargets, getDiagramLayer } from '#lib/components/diagram/diagram-layer.ts';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import type { DiagramViewProps } from '#lib/components/diagram/view-contract.ts';
	import { markColorLevel, stageColorVar, type RoutePaint } from '#lib/components/plan/colors.ts';
	import { joinList, joinSentences } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import { effectiveDependencyGraph, lineKey, routeFocusModel } from '#lib/domain/route.ts';
	import { routeMapModel } from '#lib/domain/route-map.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { routeMapLayout, type RouteMapLine } from '#lib/scene/route-map-layout.ts';
	import RouteMapKey from './RouteMapKey.svelte';
	import {
		routeMapRoutes,
		routeMapPath,
		routeMapSizes,
		type RouteMapRoute
	} from '#lib/scene/route-map-router.ts';
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
	const layer = getDiagramLayer();
	const model = $derived(
		routeMapModel(
			ws.plan,
			new Set(ws.plan.tasks.filter((t) => viewer.isExpanded(ws.plan.id, t.id)).map((t) => t.id)),
			ws.index
		)
	);
	let labelHeights = $state.raw(new Map<string, number>());
	const onTitleHeight = (id: string, height: number) => {
		if (labelHeights.get(id) !== height)
			labelHeights = new Map([...labelHeights, [id, height] as const]);
	};
	let controlsHeights = $state.raw(new Map<string, number>());
	const onControlsHeight = (id: string, height: number) => {
		if (controlsHeights.get(id) !== height)
			controlsHeights = new Map([...controlsHeights, [id, height] as const]);
	};
	let measuredPlanId = $state(untrack(() => ws.plan.id));
	$effect.pre(() => {
		if (measuredPlanId !== ws.plan.id) {
			measuredPlanId = ws.plan.id;
			labelHeights = new Map();
			controlsHeights = new Map();
		}
		const visible = new Set(model.nodes.map((node) => node.id));
		if ([...labelHeights.keys()].some((id) => !visible.has(id)))
			labelHeights = new Map([...labelHeights].filter(([id]) => visible.has(id)));
		if (
			[...controlsHeights.keys()].some(
				(id) => !visible.has(id) || !ws.index.children.get(id)?.length
			)
		)
			controlsHeights = new Map(
				[...controlsHeights].filter(([id]) => visible.has(id) && ws.index.children.get(id)?.length)
			);
	});
	const isMeasured = (id: string) =>
		labelHeights.has(id) && (!ws.index.children.get(id)?.length || controlsHeights.has(id));
	// Empty-stage placement follows the bounds of every visible station.
	const allStationsMeasured = $derived(model.nodes.every((node) => isMeasured(node.id)));
	const layout = $derived(
		routeMapLayout(model, {
			hitSize: 28,
			labelWidth: 96,
			labelHeight: 32,
			columnGap: 16,
			stageGap: 120,
			laneGap: 40,
			clearance: 5,
			labelHeights,
			controlsHeights
		})
	);
	const routes = $derived(routeMapRoutes(model, layout));
	const nodes = $derived(new Map(model.nodes.map((node) => [node.id, node])));
	const stages = $derived(new Map(ws.plan.stages.map((stage) => [stage.id, stage])));
	const routeTargets = diagramRouteTargets(() => model.nodes.map((node) => node.id));
	const rows = $derived(
		ws.plan.tasks.map((task) => ({
			id: task.id,
			isParent: (ws.index.children.get(task.id)?.length ?? 0) > 0,
			expanded: viewer.isExpanded(ws.plan.id, task.id)
		}))
	);
	const visibleId = (id: string) => (nodes.has(id) ? id : (ws.index.byId.get(id)?.parentId ?? id));
	const focus = $derived.by(() => {
		const graph = effectiveDependencyGraph(ws.index);
		// Resolve the shared route at stored task identities before mapping drawn rails.
		const exact = routeFocusModel(
			graph,
			ws.index,
			rows,
			routes.flatMap((edge) =>
				edge.stored.map((s) => ({ key: lineKey(s.dependencyId, s.taskId) }))
			),
			editing.routeId
		);
		const visiblePairKey = (from: string, to: string) => lineKey(visibleId(from), visibleId(to));
		// Project stored identities before matching inherited pairs to existing rails.
		const projected = routeFocusModel(
			graph,
			ws.index,
			rows.filter((row) => nodes.has(row.id)),
			routes.flatMap((edge) =>
				edge.stored.map((s) => ({ key: visiblePairKey(s.dependencyId, s.taskId) }))
			),
			editing.routeId
		);
		return {
			active: exact.active,
			onRouteRowIds: new Set([...exact.onRouteRowIds].map(visibleId)),
			litLineKeys: new Set(
				routes
					.filter((edge) =>
						edge.stored.some(
							(s) =>
								exact.litLineKeys.has(lineKey(s.dependencyId, s.taskId)) ||
								projected.litLineKeys.has(visiblePairKey(s.dependencyId, s.taskId))
						)
					)
					.map((edge) => edge.key)
			)
		};
	});
	const paint = (lit: boolean): RoutePaint => (focus.active ? (lit ? 'lit' : 'off') : null);
	const width = $derived(Math.max(300, layout.width));
	const height = $derived(Math.max(160, layout.height));
	const storedDependencies = $derived(
		ws.plan.tasks.flatMap((task) =>
			[...new Set(task.dependsOn)]
				.filter((dep) => ws.index.byId.has(dep))
				.map((dependencyId) => ({ taskId: task.id, dependencyId }))
		)
	);
	function directions(id: string) {
		const names = (ids: string[]) =>
			joinList(
				[...new Set(ids)]
					.sort()
					.map((taskId) => ws.index.byId.get(taskId)?.title || m.route_map_untitled_task()),
				uiIntl()
			);
		const predecessors = storedDependencies
			.filter((edge) => visibleId(edge.taskId) === id)
			.map((edge) => edge.dependencyId);
		const successors = storedDependencies
			.filter((edge) => visibleId(edge.dependencyId) === id)
			.map((edge) => edge.taskId);
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
					.filter((w) => visibleId(w.taskId) === id || visibleId(w.dependencyId) === id)
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
	const childId = (id: string) =>
		`${instanceId}-family-${Array.from(id, (c) => c.codePointAt(0)!.toString(16)).join('-')}`;

	function lineColor(line: RouteMapLine) {
		const statuses = line.taskIds.map((id) => nodes.get(id)?.status);
		const dim =
			statuses.includes('canceled') || (statuses.length > 1 && statuses.every((s) => s === 'done'));
		const lit = line.dependencyKeys.length
			? line.dependencyKeys.some((key) => focus.litLineKeys.has(key))
			: line.taskIds.length > 1
				? line.taskIds.every((id) => focus.onRouteRowIds.has(id))
				: line.taskIds.some((id) => focus.onRouteRowIds.has(id));
		const off = focus.active && (!line.dependencyKeys.length || !lit);
		const color = stageColorVar(stages.get(line.stageId)!.color);
		return `color-mix(in oklab, ${color} ${markColorLevel(dim ? 'done' : 'todo', 'line', off)}%, var(--background, #FFFFFF))`;
	}
	const path = routeMapPath;
	const sizes = routeMapSizes.screen;
	// A direction sequence describes routing semantics. Different sequences cross-fade.
	const geometryKey = (kind: string, key: string, points: readonly { x: number; y: number }[]) =>
		JSON.stringify([
			kind,
			key,
			points
				.slice(1)
				.map((point, index) => [
					Math.sign(point.x - points[index].x),
					Math.sign(point.y - points[index].y)
				])
		]);
	const lineKeyFor = (line: RouteMapLine) =>
		geometryKey(`line:${line.form}`, line.key, line.points);
	const routeKeyFor = (edge: RouteMapRoute) =>
		geometryKey(`${edge.carrier}:${edge.cycle ? 'cycle' : 'dependency'}`, edge.key, edge.points);
	let tweens = $state.raw(new Map<string, GeometryTween<{ x: number; y: number }[]>>());
	const initializedTweens = new WeakSet<GeometryTween<{ x: number; y: number }[]>>();
	let tweenPlanId: string | undefined;
	$effect(() => {
		const planId = ws.plan.id;
		const items = [
			...layout.lines.map((l) => ({
				key: lineKeyFor(l),
				points: l.points,
				measured: l.taskIds.every(isMeasured)
			})),
			...routes.map((r) => ({
				key: routeKeyFor(r),
				points: [...r.points, ...(r.chevron ?? [])],
				measured: isMeasured(r.from) && isMeasured(r.to)
			}))
		];
		// Read the running tweens untracked. Their frames must not rerun this effect.
		untrack(() => {
			const previous: typeof tweens = tweenPlanId === planId ? tweens : new Map();
			tweens = new Map(
				items.map((item) => {
					const points = [...item.points];
					const old = previous.get(item.key);
					const tween =
						old && old.current.length === points.length ? old : new GeometryTween(points);
					tween.set(points, { snap: !initializedTweens.has(tween) });
					if (item.measured) initializedTweens.add(tween);
					return [item.key, tween];
				})
			);
			tweenPlanId = planId;
		});
	});
	const lineEntries = $derived(
		layout.lines.map((line) => ({
			line,
			edge: routes.find((edge) => edge.key === line.dependencyKeys[0])
		}))
	);
	const routeFrame = (edge: RouteMapRoute) => {
		const current = tweens.get(routeKeyFor(edge))?.current ?? [
			...edge.points,
			...(edge.chevron ?? [])
		];
		const chevron = current.slice(edge.points.length);
		const points = current.slice(0, edge.points.length);
		return {
			points: chevron.length ? [...points.slice(0, -1), chevron[1]] : points,
			chevron
		};
	};
	const thinColor = (edge: RouteMapRoute) => {
		const route = paint(focus.litLineKeys.has(edge.key));
		if (route === 'lit') return 'var(--foreground)';
		const level = markColorLevel(nodes.get(edge.from)!.status, 'connector', route === 'off');
		return `color-mix(in oklab, currentColor ${level}%, var(--background, #FFFFFF))`;
	};
	const openPath = (points: readonly { x: number; y: number }[]) =>
		points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
</script>

{#snippet stageLine(line: RouteMapLine)}
	{@const points = tweens.get(lineKeyFor(line))?.current ?? line.points}
	<path
		data-testid="route-map-guide"
		data-carrier-path
		data-family-branch={line.form === 'double' ? '' : undefined}
		d={path(points)}
		fill="none"
		stroke={lineColor(line)}
		stroke-width={line.width}
		stroke-linecap="round"
		stroke-linejoin="round"
		class="stage-line"
		style:transition-duration={`${motionDuration(150)}ms`}
	/>
	{#if line.form === 'double'}
		<path
			d={path(points)}
			fill="none"
			stroke="var(--background)"
			stroke-width={sizes.branchGap}
			stroke-linecap="round"
			stroke-linejoin="round"
			class="branch-gap"
		/>
	{/if}
{/snippet}

{#snippet walkway(edge: RouteMapRoute, overlay = false)}
	{@const frame = routeFrame(edge)}
	{@const route = paint(focus.litLineKeys.has(edge.key))}
	{#if overlay}
		<path
			d={path(frame.points)}
			fill="none"
			stroke="var(--background)"
			stroke-width="4"
			data-overlay-for={edge.key}
			data-route-layer="casing"
		/>
	{/if}
	<path
		d={path(frame.points)}
		fill="none"
		stroke={thinColor(edge)}
		stroke-width={sizes.path}
		class="thin-path"
		data-testid={overlay ? undefined : 'gantt-dependency'}
		data-from={edge.from}
		data-to={edge.to}
		data-route={route ?? undefined}
		data-overlay-for={overlay ? edge.key : undefined}
		data-route-layer={overlay ? 'ink' : undefined}
		style:transition-duration={`${motionDuration(150)}ms`}
	/>
	{#if frame.chevron.length}
		<path
			data-chevron
			d={openPath(frame.chevron)}
			fill="none"
			stroke={thinColor(edge)}
			stroke-width={sizes.path}
			class="thin-path"
			data-route={route ?? undefined}
			data-overlay-for={overlay ? edge.key : undefined}
			data-route-layer={overlay ? 'ink' : undefined}
			style:transition-duration={`${motionDuration(150)}ms`}
		/>
	{/if}
{/snippet}
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
		{#if model.stages.length === 0}<p class="p-4 text-sm text-muted-foreground">
				{m.route_map_empty()}
			</p>
		{:else}
			<div class="relative" style:width="{width}px" style:height="{height}px">
				<svg
					class="pointer-events-none absolute inset-0 overflow-visible text-muted-foreground"
					{width}
					{height}
					aria-hidden="true"
				>
					{#each routes.filter((r) => r.carrier === 'walkway' && !r.cycle) as edge (routeKeyFor(edge))}
						<g
							transition:fade={{ duration: motionDuration(160) }}
							data-testid="route-map-dependency"
							data-from={edge.from}
							data-to={edge.to}
							data-carrier={edge.carrier}
							data-route={paint(focus.litLineKeys.has(edge.key)) ?? undefined}
						>
							{@render walkway(edge)}
						</g>
					{/each}
					<g class="route-overlays">
						{#each routes.filter((r) => r.carrier === 'walkway' && !r.cycle && focus.litLineKeys.has(r.key) && focus.active) as edge (routeKeyFor(edge))}
							<g transition:fade={{ duration: motionDuration(160) }}>
								{@render walkway(edge, true)}
							</g>
						{/each}
					</g>
					{#each routes.filter((r) => r.cycle) as edge (routeKeyFor(edge))}
						<g
							transition:fade={{ duration: motionDuration(160) }}
							data-testid="route-map-dependency"
							data-from={edge.from}
							data-to={edge.to}
							data-carrier={edge.carrier}
							data-route={paint(focus.litLineKeys.has(edge.key)) === 'lit' ? 'lit' : undefined}
						>
							<GanttLine
								line={{ ...edge, trunk: edge.key, points: [] }}
								muted={false}
								tween={tweens.get(routeKeyFor(edge)) ?? {
									current: [...edge.points]
								}}
								route={paint(focus.litLineKeys.has(edge.key))}
							/>
						</g>
					{/each}
					{#each lineEntries.filter((entry) => entry.edge) as entry (lineKeyFor(entry.line))}
						{@const edge = entry.edge!}
						<g
							transition:fade={{ duration: motionDuration(160) }}
							data-testid="route-map-dependency"
							data-from={edge.from}
							data-to={edge.to}
							data-carrier={edge.carrier}
							data-route={paint(focus.litLineKeys.has(edge.key)) ?? undefined}
						>
							{@render stageLine(entry.line)}
						</g>
					{/each}
					{#each lineEntries.filter((entry) => !entry.edge) as entry (lineKeyFor(entry.line))}
						<g transition:fade={{ duration: motionDuration(150) }}
							>{@render stageLine(entry.line)}</g
						>
					{/each}
				</svg>
				{#each layout.stageLabels as label (JSON.stringify( [ws.plan.id, label.stageId, label.hostId] ))}
					<RouteMapStageLabel
						{label}
						measured={label.hostId === null ? allStationsMeasured : isMeasured(label.hostId)}
						stage={stages.get(label.stageId)!}
						index={ws.plan.stages.findIndex((s) => s.id === label.stageId)}
					/>
				{/each}
				{#each layout.signs.filter((s) => !s.stationId) as sign (JSON.stringify( [ws.plan.id, sign.stageId] ))}
					<RouteMapDecoration {sign} measured={allStationsMeasured} />
					<span class="sr-only"
						>{stages.get(sign.stageId)!.title}
						{m.route_map_to_go({
							count: model.stages.find((s) => s.id === sign.stageId)!.toGo
						})}</span
					>
				{/each}
				{#each groups as station (JSON.stringify([ws.plan.id, station.id]))}
					{@const node = nodes.get(station.id)!}
					<RouteMapStation
						returnFocus={layer.returnFocus}
						{node}
						{station}
						measured={isMeasured(node.id)}
						stage={stages.get(node.stageId)!}
						sign={layout.signs.find((s) => s.stationId === node.id)}
						routeTarget={routeTargets.target}
						route={paint(focus.onRouteRowIds.has(node.id))}
						description={directions(node.id)}
						{onTitleHeight}
						{onControlsHeight}
						hasChildren={(ws.index.children.get(node.id)?.length ?? 0) > 0}
						expanded={viewer.isExpanded(ws.plan.id, node.id)}
						controls={childId(node.id)}
					/>
					<div id={childId(node.id)} class="contents">
						{#each layout.stations.filter((s) => nodes.get(s.id)?.parentId === node.id) as child (child.id)}
							{@const childNode = nodes.get(child.id)!}
							<RouteMapStation
								returnFocus={layer.returnFocus}
								node={childNode}
								station={child}
								measured={isMeasured(child.id)}
								stage={stages.get(childNode.stageId)!}
								sign={layout.signs.find((s) => s.stationId === child.id)}
								routeTarget={routeTargets.target}
								route={paint(focus.onRouteRowIds.has(child.id))}
								description={directions(child.id)}
								{onTitleHeight}
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
	<div class="flex shrink-0 flex-wrap gap-x-6 gap-y-2 border-t px-3 py-2">
		<RouteMapKey />
		<div class="space-y-1 text-xs text-muted-foreground"><StatusKey /></div>
	</div>
</div>

<style>
	.stage-line,
	.thin-path {
		transition-property: stroke;
	}
	@media (forced-colors: active) {
		.stage-line {
			forced-color-adjust: none;
			stroke: CanvasText;
		}
		.branch-gap {
			forced-color-adjust: none;
			stroke: Canvas;
		}
		.thin-path {
			forced-color-adjust: none;
			stroke: CanvasText;
		}
		.thin-path[data-route='lit'] {
			stroke: Highlight;
		}
		.route-overlays [data-route-layer='casing'] {
			forced-color-adjust: none;
			stroke: Canvas;
		}
		.route-overlays [data-route-layer='ink'] {
			forced-color-adjust: none;
			stroke: Highlight;
		}
	}
</style>
