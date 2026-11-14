<script lang="ts">
	import DiagramRing from '#lib/components/diagram/DiagramRing.svelte';
	import RouteMapTerminus from './RouteMapTerminus.svelte';
	import RouteMapInterchange from './RouteMapInterchange.svelte';
	import RouteMapStageLabel from './RouteMapStageLabel.svelte';
	import RouteMapKey from './RouteMapKey.svelte';
	import RouteMapStationGlyph from './RouteMapStationGlyph.svelte';
	import TaskStatusIcon from '#lib/components/task/TaskStatusIcon.svelte';
	import { taskStatusLabel } from '#lib/components/task/task-status.ts';
	import { routeMapPath } from '#lib/scene/route-map-router.ts';
	import { markColorLevel, stagePaperColor, subtaskFill } from '#lib/components/plan/colors.ts';
	import type { DiagramPaperProps } from '#lib/components/diagram/view-contract.ts';
	import type { RouteMapNode } from '#lib/domain/route-map.ts';
	import { joinList } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import type { Stage } from '#lib/domain/schema.ts';
	import type { RouteMapContinuation, RouteMapPaperItem } from '#lib/scene/route-map-paper.ts';
	import { m } from '#lib/paraglide/messages.js';

	let { segment, from, to }: DiagramPaperProps = $props();
	const data = $derived(
		segment.data as { stages: Stage[]; nodes: RouteMapNode[]; panels: { id: string }[] }
	);
	const items = $derived(segment.items as RouteMapPaperItem[]);
	const node = (id: string) => data.nodes.find((entry) => entry.id === id);
	const stage = (id: string) => data.stages.find((entry) => entry.id === id);
	const visible = $derived(items.slice(from, to));
	const bounded = (text: string) => (text.length > 40 ? `${text.slice(0, 39)}…` : text);
	const headings = $derived(
		data.stages
			.filter((entry) =>
				visible.some(
					(item) =>
						item.stageId === entry.id ||
						item.stageLabels.some((label) => label.stageId === entry.id) ||
						item.stations.some((station) => node(station.id)?.stageId === entry.id)
				)
			)
			.map((entry) => bounded(entry.title))
	);
	const panelNames = $derived(
		[...new Set(visible.map((item) => item.panelId))].map((id) =>
			String(data.panels.findIndex((panel) => panel.id === id) + 1)
		)
	);

	const parentReferences = $derived(
		[
			...new Set(
				visible
					.flatMap((item) => [
						...item.stations.map((station) => node(station.id)?.parentId),
						...item.titles.map((title) => node(title.taskId)?.parentId)
					])
					.filter((id): id is string => Boolean(id))
			)
		].map((id) => items.flatMap((item) => item.stations).find((s) => s.id === id)?.reference ?? id)
	);

	const stages = $derived(new Map(data.stages.map((s) => [s.id, s])));
	const paperLine = (stageId: string, ids: readonly string[], branch = false) => {
		const statuses = ids.map((id) => node(id)?.status);
		const dim =
			statuses.includes('canceled') || (statuses.length > 1 && statuses.every((s) => s === 'done'));
		const base = stagePaperColor(stage(stageId)!.color);
		const color = branch && !dim ? subtaskFill(base, 'white') : base;
		return `color-mix(in oklab, ${color} ${markColorLevel(dim ? 'done' : 'todo', 'line', false, true)}%, white)`;
	};
	const path = routeMapPath;
	const ring = (point: { x: number; y: number }, key: string) => ({
		key,
		trunk: key,
		kind: 'junction' as const,
		point: { x: { f: 0, px: point.x }, y: { f: 0, px: point.y } }
	});
	const connectorPoints = (edge: { points: readonly { x: number; y: number }[] }) => {
		if ('kind' in edge)
			return (edge as RouteMapContinuation).kind === 'exit'
				? edge.points.slice(0, -1)
				: edge.points.slice(1);
		return edge.points;
	};
	const child = (id: string) => !!node(id)?.parentId;
</script>

<div>
	<div data-part="repeat" class="border-b border-paper-rule pb-1 text-xs font-semibold">
		{#if parentReferences.length}
			{m.route_map_print_header_parents({
				panels: joinList(panelNames, uiIntl()),
				stages: bounded(joinList(headings, uiIntl())),
				parents: bounded(joinList(parentReferences, uiIntl()))
			})}
		{:else}{m.route_map_print_header({
				panels: joinList(panelNames, uiIntl()),
				stages: bounded(joinList(headings, uiIntl()))
			})}{/if}
		<RouteMapKey still />
	</div>
	{#each items.slice(from, to) as item, i (item.id)}
		<div
			data-item={from + i}
			data-panel-id={item.panelId}
			class="route-paper-item"
			style:height="{item.height}px"
			style:width="{item.width}px"
		>
			{#if item.lineY !== undefined}
				<svg
					class="paper-lines text-paper-ink-3"
					width={item.width}
					height={item.height}
					aria-hidden="true"
				>
					{#each [...item.edges.filter((e) => e.carrier !== 'line'), ...item.continuations] as edge, index (`${edge.key}:${index}`)}
						{@const isBranch = child(edge.from) || child(edge.to)}
						<g data-carrier={edge.carrier} data-from={edge.from} data-to={edge.to}>
							{#if edge.cycle}<path
									d={path(connectorPoints(edge))}
									fill="none"
									stroke="white"
									stroke-width="4"
								/>{/if}
							<path
								data-carrier-path
								d={path(connectorPoints(edge))}
								fill="none"
								stroke={edge.carrier === 'line'
									? paperLine(node(edge.to)!.stageId, [edge.from, edge.to])
									: edge.cycle
										? 'var(--color-paper-warning, #C8352D)'
										: `color-mix(in oklab, currentColor ${markColorLevel(node(edge.from)?.status ?? 'todo', 'connector', false, true)}%, white)`}
								stroke-width={edge.carrier === 'line'
									? isBranch
										? 3.5
										: 5
									: edge.cycle
										? 2
										: isBranch
											? 0.75
											: 1}
								stroke-dasharray={edge.cycle ? '1 4' : undefined}
								stroke-linecap={edge.cycle ? 'round' : undefined}
								stroke-linejoin="round"
								data-cycle={edge.cycle ? 'true' : undefined}
							/>
						</g>
					{/each}
					{#each item.lines as line (line.key)}
						<path
							data-paper-line
							data-family-branch={line.kind === 'family' ? '' : undefined}
							d={path(line.points)}
							fill="none"
							stroke={paperLine(line.stageId, line.taskIds, line.kind === 'family')}
							stroke-width={line.width}
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					{/each}
					{#each item.junctions ?? [] as junction, index (index)}
						<DiagramRing
							junction={ring(junction.point, junction.memberKeys.join(':'))}
							width={item.width}
							still
						/>
					{/each}
				</svg>
				{#each item.stations as station (station.id)}
					{@const n = node(station.id)!}
					{@const color = stagePaperColor(stage(n.stageId)!.color)}
					{@const sign = item.signs.find((s) => s.stationId === station.id)}
					<div
						class="paper-station"
						data-paper-station={station.id}
						data-reference={station.reference}
						style:left="{station.hitBox.x}px"
						style:top="{station.hitBox.y}px"
						style:width="{station.hitBox.w}px"
						style:height="{station.hitBox.h}px"
					>
						{#if sign?.kind === 'terminus'}<RouteMapTerminus
								{sign}
								still
							/>{:else if sign}<RouteMapInterchange {sign} {stages} still />{/if}
						<span class="relative flex"
							><RouteMapStationGlyph {color} size={n.parentId ? 4 : 6} still /></span
						>
					</div>
					<div
						class="paper-label"
						style:left="{station.labelBox.x}px"
						style:top="{station.labelBox.y}px"
						style:width="{station.labelBox.w}px"
					>
						{#each station.labelLines as line, index (index)}{#if index === 0}<small
									class="paper-reference">{station.reference}</small
								><span class="paper-reference-space">&nbsp;</span><span
									data-route-map-status={n.status}
									role="img"
									aria-label={taskStatusLabel(n.status)}
									class="paper-status"
									><TaskStatusIcon status={n.status} class="size-3 text-paper-ink" /><span
										class="sr-only">{taskStatusLabel(n.status)}</span
									></span
								>{/if}{line}<br />{/each}
					</div>
				{/each}
				{#each item.signs.filter((s) => !s.stationId) as sign (sign.stageId)}
					<div
						class="paper-station"
						aria-hidden="true"
						style:left="{sign.center.x - 5}px"
						style:top="{sign.center.y - 5}px"
						style:width="10px"
						style:height="10px"
					>
						<RouteMapTerminus {sign} still /><span class="relative flex"
							><RouteMapStationGlyph color="#20242B" size={6} still /></span
						>
					</div>
				{/each}
				{#each item.stageLabels as label, index (index)}
					<RouteMapStageLabel
						{label}
						stage={stage(label.stageId)!}
						index={data.stages.findIndex((s) => s.id === label.stageId)}
						still
					/>
				{/each}
			{/if}
			<svg
				class="paper-lines text-paper-ink-3"
				width={item.width}
				height={item.height}
				aria-hidden="true"
			>
				{#each (item.markers ?? []).flatMap((marker) => marker.stubs ?? []) as stub (`${stub.id}:${stub.kind}`)}
					<g
						data-continuation-pair={stub.id}
						data-direction={stub.kind}
						data-boundary={stub.boundary}
					>
						<path
							data-continuation-stub
							d={path(stub.points)}
							fill="none"
							stroke={stub.carrier === 'line'
								? paperLine(node(stub.to)!.stageId, [stub.from, stub.to])
								: stub.cycle
									? 'var(--color-paper-warning, #C8352D)'
									: `color-mix(in oklab, currentColor ${markColorLevel(node(stub.from)?.status ?? 'todo', 'connector', false, true)}%, white)`}
							stroke-width={stub.carrier === 'line'
								? child(stub.from) || child(stub.to)
									? 3.5
									: 5
								: stub.cycle
									? 2
									: child(stub.from) || child(stub.to)
										? 0.75
										: 1}
						/>
						{#if stub.ring}<DiagramRing
								junction={ring(stub.ring, stub.key)}
								width={item.width}
								still
							/>{/if}
					</g>
				{/each}
			</svg>
			{#each item.markers ?? [] as marker, index (`${marker.stationId}:${marker.kind}:${marker.relation}`)}
				<div
					class="continuation"
					data-continuation-station={marker.stationId}
					data-direction={marker.kind}
					data-relation={marker.relation}
					data-continuation={joinList(
						marker.pairs.map((p) => p.id),
						uiIntl()
					)}
					style:top="{(item.markerY ?? 0) + (marker.rowY ?? index * 10)}px"
				>
					{(marker.relation === 'workflow'
						? m.route_map_workflow_continuation
						: m.route_map_continuation)({
						pair: joinList(
							marker.pairs.map((p) => p.id),
							uiIntl()
						),
						direction: marker.kind === 'exit' ? m.route_map_exit() : m.route_map_entry(),
						reference:
							marker.textLines?.join('\n') ??
							joinList(
								marker.targets.map((t) => `${t.reference} ${t.title}`),
								uiIntl()
							)
					})}
				</div>
			{/each}
			{#each item.markerText ?? [] as part, index (index)}<div class="marker-text">
					{part.lines.join('\n')}
				</div>{/each}
			{#if item.titles.length}
				<div class:title-continuation={item.titleY !== undefined} style:top="{item.titleY ?? 0}px">
					{#each item.titles as title, index (index)}<div class="title-line">
							{m.route_map_title_continuation({ reference: title.reference, title: title.text })}
						</div>{/each}
				</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.route-paper-item {
		position: relative;
		font-size: 10px;
	}
	.paper-lines {
		overflow: visible;
		position: absolute;
		inset: 0;
	}
	.paper-station,
	.paper-label {
		position: absolute;
		text-align: center;
	}
	.paper-station {
		display: grid;
		place-items: center;
	}
	.paper-label {
		line-height: 14px;
	}
	.paper-status {
		display: inline-flex;
		width: 12px;
		height: 12px;
		margin-right: 3px;
		vertical-align: -2px;
	}
	.paper-reference {
		margin-right: 3px;
		color: var(--color-paper-ink-2);
	}
	.paper-reference-space {
		display: inline-block;
		width: 0;
	}
	.continuation {
		position: absolute;
		left: 0;
		max-width: 100%;
		font-size: 8px;
		line-height: 10px;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	.marker-text {
		white-space: pre-wrap;
		font-size: 8px;
		line-height: 10px;
	}
	.title-line {
		height: 16px;
		white-space: pre;
	}
	.title-continuation {
		position: absolute;
		left: 0;
		width: 100%;
	}
</style>
