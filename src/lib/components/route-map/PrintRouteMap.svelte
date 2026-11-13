<script lang="ts">
	import StationDot from '#lib/components/diagram/StationDot.svelte';
	import { stagePaperColor } from '#lib/components/plan/colors.ts';
	import type { DiagramPaperProps } from '#lib/components/diagram/view-contract.ts';
	import type { RouteMapNode } from '#lib/domain/route-map.ts';
	import { joinList } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import type { Stage } from '#lib/domain/schema.ts';
	import type { RouteMapPaperItem } from '#lib/scene/route-map-paper.ts';
	import { m } from '#lib/paraglide/messages.js';

	let { segment, from, to }: DiagramPaperProps = $props();
	const data = $derived(segment.data as { stages: Stage[]; nodes: RouteMapNode[] });
	const items = $derived(segment.items as RouteMapPaperItem[]);
	const node = (id: string) => data.nodes.find((entry) => entry.id === id);
	const stage = (id: string) => data.stages.find((entry) => entry.id === id);
	const visible = $derived(items.slice(from, to));
	const headings = $derived.by(() => {
		const stageIds = new Set(visible.flatMap((item) => (item.stageId ? [item.stageId] : [])));
		const parentIds = new Set(
			visible.flatMap((item) =>
				item.stations.flatMap((station) => {
					const parent = node(station.id)?.parentId;
					return parent ? [parent] : [];
				})
			)
		);
		return [
			...data.stages.filter((entry) => stageIds.has(entry.id)).map((entry) => entry.title),
			...data.nodes.filter((entry) => parentIds.has(entry.id)).map((entry) => entry.title)
		].filter(Boolean);
	});
	const reference = (id: string) =>
		items.flatMap((item) => item.stations).find((station) => station.id === id)?.reference ?? id;
	const points = (line: readonly { x: number; y: number }[]) =>
		line.map((p) => `${p.x},${p.y}`).join(' ');
</script>

<div data-fragment="route-map-scene">
	<div data-part="repeat" class="border-b border-paper-rule pb-1 text-xs font-semibold">
		{m.diagram_view_route_map()}
		{#if headings.length}<span class="font-normal"> — {joinList(headings, uiIntl())}</span>{/if}
	</div>
	{#each items.slice(from, to) as item, i (item.id)}
		<div data-item={from + i} class="route-paper-item" style:height={`${item.height}px`}>
			{#if item.stageId}
				<svg class="paper-lines" width={item.width} height={item.height} aria-hidden="true">
					{#if item.stations.length > 1 && stage(item.stageId)}
						<line
							x1={item.stations[0].inPort.x}
							x2={item.stations[item.stations.length - 1].outPort.x}
							y1={item.stations[0].inPort.y}
							y2={item.stations[0].inPort.y}
							stroke={stagePaperColor(stage(item.stageId)!.color)}
						/>
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
							stroke="currentColor"
							class={edge.cycle ? 'text-paper-warning' : undefined}
							data-cycle={edge.cycle ? 'true' : undefined}
							stroke-width={edge.cycle ? 2 : 1}
							stroke-dasharray={edge.cycle ? '1 4' : undefined}
							stroke-linecap={edge.cycle ? 'round' : undefined}
						/>
					{/each}
				</svg>
				{#each item.continuations as continuation (`${continuation.id}:${continuation.kind}`)}
					{@const point =
						continuation.kind === 'exit' ? continuation.points.at(-1)! : continuation.points[0]}
					<span
						class="continuation"
						data-continuation={continuation.id}
						data-direction={continuation.kind}
						style:left={`${Math.max(0, Math.min(item.width - 40, point.x))}px`}
						style:top={`${Math.max(0, point.y - 11)}px`}
					>
						{m.route_map_continuation({
							direction: continuation.kind === 'exit' ? '→' : '←',
							reference: reference(
								continuation.kind === 'exit' ? continuation.to : continuation.from
							)
						})}
					</span>
				{/each}
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
			{#each item.titles as title, titleIndex (titleIndex)}
				<div class="title-line"><span>{title.reference}</span> {title.text}</div>
			{/each}
			{#each item.termini as terminus (terminus.stageId)}
				<div>{stage(terminus.stageId)?.title}: {m.route_map_to_go({ count: terminus.toGo })}</div>
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
	}
	.title-line {
		height: 16px;
		white-space: pre;
	}
</style>
