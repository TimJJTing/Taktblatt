<script lang="ts">
	import StageBadge from '#lib/components/diagram/StageBadge.svelte';
	import StationDot from '#lib/components/diagram/StationDot.svelte';
	import { markColorLevel, stagePaperColor } from '#lib/components/plan/colors.ts';
	import type { DiagramPaperProps } from '#lib/components/diagram/view-contract.ts';
	import type { RouteMapNode } from '#lib/domain/route-map.ts';
	import { joinList } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import type { Stage } from '#lib/domain/schema.ts';
	import type { RouteMapPaperItem } from '#lib/scene/route-map-paper.ts';
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
			.filter((entry) => visible.some((item) => item.stageId === entry.id))
			.map((entry) => bounded(entry.title))
	);
	const panelNames = $derived(
		[...new Set(visible.map((item) => item.panelId))].map((id) =>
			String(data.panels.findIndex((panel) => panel.id === id) + 1)
		)
	);

	const reference = (id: string) =>
		items.flatMap((item) => item.stations).find((station) => station.id === id)?.reference ?? id;
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
		].map(reference)
	);
	const paperLine = (stageId: string, ids: string[]) => {
		const statuses = ids.map((id) => node(id)?.status);
		const dim =
			statuses.includes('canceled') ||
			(statuses.length > 1 && statuses.every((status) => status === 'done'));
		return `color-mix(in oklab, ${stagePaperColor(stage(stageId)!.color)} ${markColorLevel(dim ? 'done' : 'todo', 'line', false, true)}%, white)`;
	};
	const points = (line: readonly { x: number; y: number }[]) =>
		line.map((p) => `${p.x},${p.y}`).join(' ');
</script>

<div>
	<div data-part="repeat" class="border-b border-paper-rule pb-1 text-xs font-semibold">
		{#if parentReferences.length}
			{m.route_map_print_header_parents({
				panels: joinList(panelNames, uiIntl()),
				stages: bounded(joinList(headings, uiIntl())),
				parents: bounded(joinList(parentReferences, uiIntl()))
			})}
		{:else}
			{m.route_map_print_header({
				panels: joinList(panelNames, uiIntl()),
				stages: bounded(joinList(headings, uiIntl()))
			})}
		{/if}
	</div>
	{#each items.slice(from, to) as item, i (item.id)}
		<div data-item={from + i} class="route-paper-item" style:height={`${item.height}px`}>
			{#if item.stageId && item.lineY !== undefined}
				{#if stage(item.stageId)}
					<div class="stage-heading">
						<StageBadge
							color={stage(item.stageId)!.color}
							label={m.stage_badge({ n: data.stages.findIndex((s) => s.id === item.stageId) + 1 })}
							still
						/> <span>{bounded(stage(item.stageId)!.title)}</span>
					</div>
				{/if}
				<svg class="paper-lines" width={item.width} height={item.height} aria-hidden="true">
					{#if stage(item.stageId)}
						{@const roots = item.stations.filter((station) => !node(station.id)?.parentId)}
						{#if roots.length === 0}
							<line
								x1="0"
								x2={item.width}
								y1={item.lineY}
								y2={item.lineY}
								stroke={paperLine(item.stageId, [])}
							/>
						{:else}
							{#each roots.slice(1) as station, i (station.id)}
								<line
									x1={roots[i].outPort.x}
									x2={station.inPort.x}
									y1={item.lineY}
									y2={item.lineY}
									stroke={paperLine(item.stageId, [roots[i].id, station.id])}
								/>
							{/each}
							<line
								x1="0"
								x2={roots[0].inPort.x}
								y1={item.lineY}
								y2={item.lineY}
								stroke={paperLine(item.stageId, [roots[0].id])}
							/>
							<line
								x1={roots.at(-1)!.outPort.x}
								x2={item.width}
								y1={item.lineY}
								y2={item.lineY}
								stroke={paperLine(item.stageId, [roots.at(-1)!.id])}
							/>
						{/if}
						{#each item.stations.filter((station) => node(station.id)?.parentId) as child (child.id)}
							<line
								x1={child.inPort.x + child.hitBox.w / 2}
								x2={child.inPort.x + child.hitBox.w / 2}
								y1={item.lineY}
								y2={child.inPort.y}
								stroke={paperLine(item.stageId, [node(child.id)!.parentId!, child.id])}
							/>
						{/each}
					{/if}
					{#each [...item.edges, ...item.continuations] as edge, edgeIndex (edgeIndex)}
						{#if edge.cycle}<polyline
								points={points(edge.points)}
								fill="none"
								stroke="white"
								stroke-width="4"
							/>{/if}
						<polyline
							points={points(edge.points)}
							fill="none"
							stroke={edge.cycle
								? 'currentColor'
								: `color-mix(in oklab, #505663 ${markColorLevel(node(edge.from)?.status ?? 'todo', 'connector', false, true)}%, white)`}
							class={edge.cycle ? 'text-paper-warning' : undefined}
							data-cycle={edge.cycle ? 'true' : undefined}
							stroke-width={edge.cycle ? 2 : 1}
							stroke-dasharray={edge.cycle ? '1 4' : undefined}
							stroke-linecap={edge.cycle ? 'round' : undefined}
						/>
					{/each}
				</svg>
				{#each item.stations as station (station.id)}
					<div
						class="paper-station"
						style:left={`${station.hitBox.x}px`}
						style:top={`${station.hitBox.y}px`}
						style:width={`${station.hitBox.w}px`}
						style:height={`${station.hitBox.h}px`}
					>
						{#if node(station.id) && stage(node(station.id)!.stageId)}
							<StationDot
								status={node(station.id)!.status}
								color={stagePaperColor(stage(node(station.id)!.stageId)!.color)}
								size={12}
								still
							/>
						{/if}
					</div>
					<div
						class="paper-label"
						style:left={`${station.labelBox.x}px`}
						style:top={`${station.labelBox.y}px`}
						style:width={`${station.labelBox.w}px`}
					>
						{#each station.labelLines as line, lineIndex (lineIndex)}{line}<br />{/each}
						<small>{station.reference}</small>
					</div>
				{/each}
			{/if}
			{#if item.stageId && item.lineY === undefined && item.markers?.length && stage(item.stageId)}
				<div class="stage-heading">{bounded(stage(item.stageId)!.title)}</div>
			{/if}
			{#each item.markers ?? [] as continuation, markerIndex (`${continuation.id}:${continuation.kind}`)}
				{@const point =
					continuation.kind === 'exit' ? continuation.points.at(-1)! : continuation.points[0]}
				<span
					class="continuation"
					data-continuation={continuation.id}
					data-direction={continuation.kind}
					style:left={`${Math.max(0, Math.min(point.x, item.width - 80))}px`}
					style:top={`${(item.markerY ?? 16) + markerIndex * 10}px`}
				>
					{m.route_map_continuation({
						pair: continuation.id,
						direction: continuation.kind === 'exit' ? m.route_map_exit() : m.route_map_entry(),
						reference: reference(continuation.kind === 'exit' ? continuation.to : continuation.from)
					})}
				</span>
			{/each}
			{#each item.titles as title, titleIndex (titleIndex)}
				<div class="title-line">
					{m.route_map_title_continuation({ reference: title.reference, title: title.text })}
				</div>
			{/each}
			{#each item.termini as terminus (terminus.stageId)}
				<div class="terminus">{m.route_map_to_go({ count: terminus.toGo })}</div>
			{/each}
		</div>
	{/each}
</div>

<style>
	.route-paper-item {
		position: relative;
		overflow: hidden;
		font-size: 10px;
	}
	.stage-heading {
		position: absolute;
		top: 0;
		left: 0;
		display: flex;
		align-items: center;
		gap: 4px;
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
	}
	.terminus {
		position: absolute;
		right: 0;
		top: 0;
		white-space: nowrap;
	}
	.paper-lines {
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
	.continuation {
		position: absolute;
		font-size: 8px;
		white-space: nowrap;
		max-width: 100%;
		overflow: hidden;
	}
	.title-line {
		height: 16px;
		white-space: pre;
	}
</style>
