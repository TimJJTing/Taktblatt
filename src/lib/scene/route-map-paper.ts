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
	width: number;
	height: number;
	stations: readonly RouteMapPaperStation[];
	titles: readonly { taskId: string; reference: string; text: string }[];
	edges: readonly RouteMapRoute[];
	continuations: readonly RouteMapContinuation[];
	termini: readonly { stageId: string; toGo: number }[];
}
export interface RouteMapPaper {
	columns: readonly { id: string; width: number }[];
	panels: readonly { id: string; columnIds: readonly string[] }[];
	segment: Omit<SceneSegment, 'items'> & { items: readonly RouteMapPaperItem[] };
}

function wrap(text: string, width: number, measure: (text: string) => number): string[] {
	const result: string[] = [];
	let line = '';
	for (const char of text) {
		if (line && measure(line + char) > width) {
			result.push(line);
			line = '';
		}
		line += char;
	}
	if (line) result.push(line);
	return result;
}
export function routeMapPaper(model: RouteMapModel, metrics: RouteMapPaperMetrics): RouteMapPaper {
	const width =
		metrics.sheetWidth - 2 * metrics.margin - metrics.repeatedLabelWidth - 2 * metrics.gutter;
	const height =
		metrics.sheetHeight - 2 * metrics.margin - metrics.headerHeight - metrics.footerHeight;
	const layout = routeMapLayout(model, metrics);
	const byId = new Map(model.nodes.map((n) => [n.id, n]));
	const columns = layout.stations.map((s) => ({
		id: s.columnId,
		width: Math.min(
			width,
			Math.max(
				metrics.hitSize + 2 * metrics.clearance,
				Math.min(metrics.labelWidth, metrics.measureText(byId.get(s.id)!.title)) +
					2 * metrics.clearance +
					metrics.columnGap
			)
		)
	}));
	const panels: { id: string; columnIds: string[] }[] = [];
	let used = 0;
	for (const column of columns) {
		if (!panels.length || used + column.width > width) {
			panels.push({ id: `panel:${column.id}:${width}:${height}`, columnIds: [] });
			used = 0;
		}
		panels[panels.length - 1].columnIds.push(column.id);
		used += column.width;
	}
	if (!panels.length) panels.push({ id: `panel:empty:${width}:${height}`, columnIds: [] });
	const items: RouteMapPaperItem[] = [];
	const stationItems = new Map<string, RouteMapPaperItem>();
	const mutableContinuations = new Map<string, RouteMapContinuation[]>();
	for (const [i, station] of layout.stations.entries()) {
		const panel = panels.find((p) => p.columnIds.includes(station.columnId))!;
		const column = columns[i];
		const node = byId.get(station.id)!;
		const reference = `R${i + 1}`;
		const labelWidth = Math.min(metrics.labelWidth, column.width - 2 * metrics.clearance);
		const hit = Math.max(24, metrics.hitSize);
		const x = metrics.clearance + (column.width - 2 * metrics.clearance) / 2;
		const y = metrics.clearance + hit / 2;
		const hitBox = { x: x - hit / 2, y: y - hit / 2, w: hit, h: hit };
		const labelBox = {
			x: x - labelWidth / 2,
			y: y + hit / 2,
			w: labelWidth,
			h: metrics.labelHeight
		};
		const lines = wrap(node.title, labelWidth, metrics.measureText);
		const paperStation = {
			...station,
			reference,
			labelLines: lines.slice(0, 2),
			hitBox,
			labelBox,
			inPort: { x: hitBox.x, y },
			outPort: { x: hitBox.x + hit, y }
		};
		const item: RouteMapPaperItem = {
			id: `station:${station.id}`,
			panelId: panel.id,
			width: column.width,
			height: Math.min(height, labelBox.y + labelBox.h + metrics.clearance),
			stations: [paperStation],
			titles: [],
			edges: [],
			continuations: [],
			termini: []
		};
		items.push(item);
		stationItems.set(station.id, item);
		mutableContinuations.set(item.id, []);
		if (lines.length > 2) {
			const titleLines = wrap(node.title, width, metrics.measureText);
			const count = Math.max(1, Math.floor(height / metrics.lineHeight));
			for (let start = 0; start < titleLines.length; start += count) {
				const titles = titleLines
					.slice(start, start + count)
					.map((text) => ({ taskId: station.id, reference, text }));
				items.push({
					id: `title:${station.id}:${start}`,
					panelId: panel.id,
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
	for (const edge of model.edges) {
		const from = stationItems.get(edge.from),
			to = stationItems.get(edge.to);
		if (!from || !to) continue;
		const source = from.stations[0],
			target = to.stations[0];
		const boundary = `${from.id}:${to.id}`,
			id = `continuation:${edge.key}`;
		mutableContinuations.get(from.id)!.push({
			...edge,
			id,
			boundary,
			kind: 'exit',
			points: [source.outPort, { x: from.width, y: source.outPort.y }]
		});
		mutableContinuations.get(to.id)!.push({
			...edge,
			id,
			boundary,
			kind: 'entry',
			points: [{ x: 0, y: target.inPort.y }, target.inPort]
		});
	}
	for (const item of items)
		(item as { continuations: readonly RouteMapContinuation[] }).continuations =
			mutableContinuations.get(item.id) ?? [];
	const finalPanel = panels[panels.length - 1];
	items.push({
		id: 'termini',
		panelId: finalPanel.id,
		width: Math.max(1, width),
		height: Math.min(
			height,
			Math.max(metrics.lineHeight, model.stages.length * metrics.lineHeight)
		),
		stations: [],
		titles: [],
		edges: [],
		continuations: [],
		termini: model.stages.map((s) => ({ stageId: s.id, toGo: s.toGo }))
	});
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
