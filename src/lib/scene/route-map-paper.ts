import type { SceneSegment } from '#lib/domain/print-model.ts';
import type { RouteMapEdge, RouteMapModel } from '#lib/domain/route-map.ts';
import {
	routeMapLayout,
	type RouteMapMetrics,
	type RouteMapPoint,
	type RouteMapStation
} from './route-map-layout.ts';
import type { RouteMapRoute } from './route-map-router.ts';

export interface RouteMapPaperMetrics extends RouteMapMetrics {
	measureText: (text: string) => number;
	sheetWidth: number;
	sheetHeight: number;
	margin: number;
	repeatedLabelWidth: number;
	gutter: number;
	headerHeight: number;
	footerHeight: number;
	lineHeight: number;
}
export interface RouteMapPaperStation extends RouteMapStation {
	reference: string;
	labelLines: readonly string[];
}
export interface RouteMapContinuation extends RouteMapEdge {
	id: string;
	boundary: string;
	kind: 'exit' | 'entry';
	points: readonly RouteMapPoint[];
}
export interface RouteMapPaperItem {
	id: string;
	panelId: string;
	stageId?: string;
	lineY?: number;
	width: number;
	height: number;
	stations: readonly RouteMapPaperStation[];
	titles: readonly { taskId: string; reference: string; text: string }[];
	edges: readonly RouteMapRoute[];
	continuations: readonly RouteMapContinuation[];
	termini: readonly { stageId: string; toGo: number }[];
	markers?: readonly RouteMapContinuation[];
	markerY?: number;
}
export interface RouteMapPaper {
	columns: readonly { id: string; width: number }[];
	panels: readonly { id: string; columnIds: readonly string[] }[];
	segment: Omit<SceneSegment, 'items'> & { items: readonly RouteMapPaperItem[] };
}

function wrap(text: string, width: number, measure: (text: string) => number): string[] {
	const result: string[] = [];
	let line = '';
	for (const char of text.replace(/\r\n?/g, '\n')) {
		if (char === '\n') {
			result.push(line);
			line = '';
			continue;
		}
		if (line && measure(line + char) > width) {
			result.push(line);
			line = '';
		}
		line += char;
	}
	if (line || text.endsWith('\n')) result.push(line);
	return result;
}
export function routeMapPaper(model: RouteMapModel, metrics: RouteMapPaperMetrics): RouteMapPaper {
	const width =
		metrics.sheetWidth - 2 * metrics.margin - metrics.repeatedLabelWidth - 2 * metrics.gutter;
	const height =
		metrics.sheetHeight - 2 * metrics.margin - metrics.headerHeight - metrics.footerHeight;
	const layout = routeMapLayout(model, metrics);
	const byId = new Map(model.nodes.map((node) => [node.id, node]));
	const columns = layout.stations.map((station) => ({
		id: station.columnId,
		width: Math.min(
			width,
			Math.max(
				metrics.hitSize + 2 * metrics.clearance + metrics.columnGap,
				Math.min(metrics.labelWidth, metrics.measureText(byId.get(station.id)!.title)) +
					2 * metrics.clearance +
					metrics.columnGap
			)
		)
	}));
	const panels: { id: string; columnIds: string[] }[] = [];
	let used = 0;
	const stationByColumn = new Map(layout.stations.map((station) => [station.columnId, station]));
	const capacity = Math.max(1, Math.floor((height / 2 - metrics.clearance * 2) / 6) + 1);
	for (const column of columns) {
		const candidate = [...(panels.at(-1)?.columnIds ?? []), column.id];
		const ids = new Set(candidate.map((id) => stationByColumn.get(id)!.id));
		const exceedsCapacity = model.stages.some(
			(stage) =>
				model.edges.filter(
					(edge) =>
						ids.has(edge.from) &&
						ids.has(edge.to) &&
						byId.get(edge.from)?.stageId === stage.id &&
						byId.get(edge.to)?.stageId === stage.id
				).length > capacity
		);
		if (!panels.length || used + column.width > width || exceedsCapacity) {
			panels.push({ id: `panel:${column.id}:${width}:${height}`, columnIds: [] });
			used = 0;
		}
		panels[panels.length - 1].columnIds.push(column.id);
		used += column.width;
	}
	if (!panels.length) panels.push({ id: `panel:empty:${width}:${height}`, columnIds: [] });
	const columnById = new Map(columns.map((column) => [column.id, column]));
	const references = new Map(layout.stations.map((station, i) => [station.id, `R${i + 1}`]));
	const items: RouteMapPaperItem[] = [];
	const stationItems = new Map<string, RouteMapPaperItem>();
	for (const panel of panels) {
		const panelWidth = Math.max(
			panel.columnIds.length ? 1 : width,
			panel.columnIds.reduce((sum, id) => sum + columnById.get(id)!.width, 0)
		);
		for (const stage of model.stages) {
			const stations = panel.columnIds
				.map((id) => stationByColumn.get(id)!)
				.filter((station) => byId.get(station.id)!.stageId === stage.id);
			const ids = new Set(stations.map((station) => station.id));
			const localEdges = model.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
			const trackHeight = Math.min(
				height / 2,
				(localEdges.length + 1) * 6 + metrics.clearance + 24
			);
			const hit = Math.max(24, metrics.hitSize);
			const y = 16 + trackHeight + metrics.clearance + hit / 2;
			let offset = 0;
			const positions = new Map<string, number>();
			for (const id of panel.columnIds) {
				const column = columnById.get(id)!;
				positions.set(id, offset + column.width / 2);
				offset += column.width;
			}
			const placed: RouteMapPaperStation[] = stations.map((station) => {
				const column = columnById.get(station.columnId)!;
				const x = positions.get(station.columnId)!;
				const labelWidth = Math.min(
					metrics.labelWidth,
					column.width - 2 * metrics.clearance - metrics.columnGap
				);
				const stationY =
					y + (byId.get(station.id)!.parentId ? hit + metrics.labelHeight + metrics.clearance : 0);
				const hitBox = { x: x - hit / 2, y: stationY - hit / 2, w: hit, h: hit };
				return {
					...station,
					reference: references.get(station.id)!,
					labelLines: wrap(byId.get(station.id)!.title, labelWidth, metrics.measureText).slice(
						0,
						2
					),
					hitBox,
					labelBox: {
						x: x - labelWidth / 2,
						y: stationY + hit / 2,
						w: labelWidth,
						h: metrics.labelHeight
					},
					inPort: { x: x - hit / 2, y: stationY },
					outPort: { x: x + hit / 2, y: stationY }
				};
			});
			const placedById = new Map(placed.map((station) => [station.id, station]));
			const edges = localEdges.map((edge, i) => {
				const source = placedById.get(edge.from)!;
				const target = placedById.get(edge.to)!;
				const sx = source.outPort.x + metrics.clearance + 1;
				const tx = target.inPort.x - metrics.clearance - 1;
				const channel = 16 + metrics.clearance + 6 * i;
				return {
					...edge,
					points: [
						source.outPort,
						{ x: sx, y: source.outPort.y },
						{ x: sx, y: channel },
						{ x: tx, y: channel },
						{ x: tx, y: target.inPort.y },
						target.inPort
					]
				};
			});
			const item: RouteMapPaperItem = {
				id: `band:${panel.id}:${stage.id}`,
				panelId: panel.id,
				stageId: stage.id,
				lineY: y,
				width: panelWidth,
				height: Math.min(
					height,
					y +
						hit / 2 +
						metrics.labelHeight +
						metrics.clearance +
						(placed.some((station) => byId.get(station.id)!.parentId)
							? hit + metrics.labelHeight + metrics.clearance
							: 0)
				),
				stations: placed,
				titles: [],
				edges,
				continuations: [],
				termini: []
			};
			items.push(item);
			for (const station of placed) stationItems.set(station.id, item);
			for (const station of placed) {
				const title = byId.get(station.id)!.title;
				if (wrap(title, station.labelBox.w, metrics.measureText).length <= 2) continue;
				const lines = wrap(
					title,
					Math.max(1, width - metrics.measureText(`${station.reference} `)),
					metrics.measureText
				);
				const count = Math.max(1, Math.floor(height / metrics.lineHeight));
				for (let start = 0; start < lines.length; start += count) {
					const titles = lines
						.slice(start, start + count)
						.map((text) => ({ taskId: station.id, reference: station.reference, text }));
					items.push({
						id: `title:${station.id}:${start}`,
						panelId: panel.id,
						stageId: stage.id,
						width,
						height: titles.length * metrics.lineHeight,
						stations: [],
						titles,
						edges: [],
						continuations: [],
						termini: []
					});
				}
			}
		}
	}
	const continuations = new Map(items.map((item) => [item.id, [] as RouteMapContinuation[]]));
	const bandByPanelStage = new Map(
		items
			.filter((item) => item.id.startsWith('band:'))
			.map((item) => [`${item.panelId}:${item.stageId}`, item])
	);
	const panelIndex = new Map(panels.map((panel, i) => [panel.id, i]));
	let pairNumber = 0;
	for (const edge of model.edges) {
		const from = stationItems.get(edge.from),
			to = stationItems.get(edge.to);
		if (!from || !to || from === to) continue;
		const source = from.stations.find((station) => station.id === edge.from)!;
		const target = to.stations.find((station) => station.id === edge.to)!;
		const start = panelIndex.get(from.panelId)!,
			end = panelIndex.get(to.panelId)!;
		const step = Math.sign(end - start);
		const path: RouteMapPaperItem[] = [from];
		if (step) {
			for (let i = start + step; i !== end; i += step) {
				path.push(bandByPanelStage.get(`${panels[i].id}:${from.stageId}`)!);
			}
		}
		path.push(to);
		for (let i = 0; i < path.length - 1; i++) {
			const left = path[i],
				right = path[i + 1];
			const boundary = `${left.id}:${right.id}`;
			const id = `C${++pairNumber}`;
			const exit =
				i === 0
					? [source.outPort, { x: source.outPort.x + metrics.clearance, y: source.outPort.y }]
					: [
							{ x: step < 0 ? 1 : left.width - 1, y: 0 },
							{ x: step < 0 ? 0 : left.width, y: 0 }
						];
			const entry =
				i === path.length - 2
					? [{ x: target.inPort.x - metrics.clearance, y: target.inPort.y }, target.inPort]
					: [
							{ x: step < 0 ? right.width : 0, y: 0 },
							{ x: step < 0 ? right.width - 1 : 1, y: 0 }
						];
			continuations.get(left.id)!.push({ ...edge, id, boundary, kind: 'exit', points: exit });
			continuations.get(right.id)!.push({ ...edge, id, boundary, kind: 'entry', points: entry });
		}
	}

	for (const item of items)
		(item as { continuations: readonly RouteMapContinuation[] }).continuations =
			continuations.get(item.id) ?? [];
	// Keep marker rows in the band when they fit. Put the other rows in legal splits.
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		const markers = item.continuations;
		const inBand = Math.max(0, Math.floor((height - item.height) / 10));
		if (inBand && markers.length) {
			item.markerY = item.height;
			item.markers = markers.slice(0, inBand);
			item.height += item.markers.length * 10;
		}
		const count = Math.max(1, Math.floor((height - 16) / 10));
		const extra: RouteMapPaperItem[] = [];
		for (let start = Math.min(inBand, markers.length); start < markers.length; start += count) {
			const rows = markers.slice(start, start + count);
			extra.push({
				id: `markers:${item.id}:${start}`,
				panelId: item.panelId,
				stageId: item.stageId,
				width: item.width,
				height: 16 + rows.length * 10,
				stations: [],
				titles: [],
				edges: [],
				continuations: [],
				markers: rows,
				markerY: 16,
				termini: []
			});
		}
		items.splice(i + 1, 0, ...extra);
	}
	for (const stage of model.stages) {
		const band = items.findLast((item) => item.id.startsWith('band:') && item.stageId === stage.id);
		if (band)
			(band as { termini: RouteMapPaperItem['termini'] }).termini = [
				{ stageId: stage.id, toGo: stage.toGo }
			];
	}

	return {
		columns,
		panels,
		segment: {
			kind: 'scene',
			id: 'route-map-scene',
			diagram: 'route-map',
			orientation: 'landscape',
			keep: 1,
			gap: 0,
			breakBefore: false,
			items
		}
	};
}
