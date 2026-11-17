import type { SceneSegment } from '#lib/domain/print-model.ts';
import type { RouteMapModel } from '#lib/domain/route-map.ts';
import {
	routeMapLayout,
	type RouteMapBox,
	type RouteMapMetrics,
	type RouteMapPoint,
	type RouteMapStation,
	type RouteMapLine,
	type RouteMapSign,
	type RouteMapStageLabel
} from './route-map-layout.ts';
import {
	chamferRouteMapPath,
	routeMapChevron,
	routeMapSizes,
	type RouteMapRoute
} from './route-map-router.ts';

export const ROUTE_MAP_HEADING_LIMIT = 40;

export function boundedHeading(text: string): string {
	const characters = Array.from(text);
	return characters.length > ROUTE_MAP_HEADING_LIMIT
		? `${characters.slice(0, ROUTE_MAP_HEADING_LIMIT - 1).join('')}…`
		: text;
}

// Include CJK punctuation, full-width forms and supplementary ideographs and kana.
const EAST_ASIAN_WIDE =
	/[\u1100-\u11ff\u2e80-\ua4cf\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6\u{16fe0}-\u{16fff}\u{1aff0}-\u{1b2ff}\u{20000}-\u{3fffd}]/u;

export function routeMapPaperMeasureText(text: string): number {
	let width = 0;
	for (const character of text) {
		width += EAST_ASIAN_WIDE.test(character) ? 10 : 7;
	}
	return width;
}

// Mirror PrintRouteMap's text-xs, pb-1 and border-b; RouteMapKey's .paper, .map-key and svg;
// and StatusKey's gap-1, gap-x-4, gap-y-1 and size-3 classes.
// The semibold heading block has no margin and inherits the 16 px line height.
const PAPER_HEADER_LAYOUT = {
	baseFontSize: 10,
	textFontSize: 12,
	lineHeight: 16,
	signWidth: 24,
	signHeight: 20,
	statusSize: 12,
	entryGap: 4,
	columnGap: 16,
	rowGap: 4,
	paddingBottom: 4,
	borderBottom: 1
} as const;

export interface RouteMapPaperHeader {
	heading: string;
	keyEntries: readonly string[];
	statusEntries: readonly string[];
	readiness: string;
}
export function routeMapPaperHeaderHeight(
	header: RouteMapPaperHeader,
	width: number,
	measureText: (text: string) => number
): number {
	const available = Math.max(1, width);
	const layout = PAPER_HEADER_LAYOUT;
	const headerMeasure = (text: string) =>
		measureText(text) * (layout.textFontSize / layout.baseFontSize);
	const keyHeight = (
		entries: readonly string[],
		signWidth: number,
		signHeight: number,
		measure: (text: string) => number
	) => {
		let height = 0;
		let rowWidth = 0;
		let rowHeight = 0;
		for (const entry of entries) {
			const entryWidth = Math.min(available, signWidth + layout.entryGap + measure(entry));
			if (rowWidth && rowWidth + layout.columnGap + entryWidth > available) {
				height += rowHeight + layout.rowGap;
				rowWidth = 0;
				rowHeight = 0;
			}
			rowWidth += (rowWidth ? layout.columnGap : 0) + entryWidth;
			rowHeight = Math.max(
				rowHeight,
				signHeight,
				Math.max(
					1,
					wrap(entry, Math.max(1, available - signWidth - layout.entryGap), measure).length
				) * layout.lineHeight
			);
		}
		return height + rowHeight;
	};
	// Scale the 10 px paper metric for the 12 px heading, status labels and readiness text.
	return Math.ceil(
		Math.max(1, wrap(header.heading, available, headerMeasure).length) * layout.lineHeight +
			keyHeight(header.keyEntries, layout.signWidth, layout.signHeight, measureText) +
			keyHeight(header.statusEntries, layout.statusSize, layout.statusSize, headerMeasure) +
			Math.max(1, wrap(header.readiness, available, headerMeasure).length) * layout.lineHeight +
			layout.paddingBottom +
			layout.borderBottom
	);
}

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
	summaryText?: (parentId: string) => string;
	formatTargets?: (targets: RouteMapContinuationMarker['targets']) => string;
}
export interface RouteMapPaperStation extends RouteMapStation {
	collapsedParent: boolean;
	reference: string;
	labelLines: readonly string[];
	summaryLines?: readonly string[];
}
export interface RouteMapContinuation extends RouteMapRoute {
	id: string;
	boundary: string;
	kind: 'exit' | 'entry';
	stationId: string;
	relation?: 'dependency' | 'workflow';
	ring?: RouteMapPoint;
}
export interface RouteMapContinuationMarker {
	relation?: 'dependency' | 'workflow';
	stubs?: readonly RouteMapContinuation[];
	stationId: string;
	kind: 'exit' | 'entry';
	rowY?: number;
	rowHeight?: number;
	textLines?: readonly string[];
	targets: readonly { taskId: string; reference: string; title: string }[];
	pairs: readonly { id: string; boundary: string; key: string }[];
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
	markers?: readonly RouteMapContinuationMarker[];
	markerY?: number;
	titleY?: number;
	markerText?: readonly { lines: readonly string[] }[];
	lines: readonly RouteMapLine[];
	signs: readonly RouteMapSign[];
	stageLabels: readonly RouteMapStageLabel[];
}
export interface RouteMapPaper {
	columns: readonly { id: string; width: number }[];
	panels: readonly { id: string; columnIds: readonly string[] }[];
	segment: Omit<SceneSegment, 'items'> & { items: readonly RouteMapPaperItem[] };
}
function wrap(
	text: string,
	width: number,
	measure: (text: string) => number,
	firstWidth = width,
	trimWhitespace = false
): string[] {
	const result: string[] = [];
	let line = '';
	const limit = () => (result.length ? width : firstWidth);
	for (const token of text.replace(/\r\n?/g, '\n').match(/\n|[^\S\n]+|[^\s]+/gu) ?? []) {
		if (token === '\n') {
			result.push(line);
			line = '';
			continue;
		}
		const whitespace = /^\s+$/u.test(token);
		if (trimWhitespace && !line && whitespace) continue;
		if (
			trimWhitespace &&
			!result.length &&
			!line &&
			measure(token) > firstWidth &&
			measure(token) <= width
		)
			result.push('');
		if (line && measure(line + token) > limit()) {
			if (!trimWhitespace || line.trim()) result.push(trimWhitespace ? line.trim() : line);
			line = '';
			if (trimWhitespace && whitespace) continue;
		}
		for (const char of token) {
			if (line && measure(line + char) > limit()) {
				result.push(line);
				line = '';
			}
			line += char;
		}
	}
	if (line || text.endsWith('\n')) result.push(line);
	return trimWhitespace ? result.map((entry) => entry.trim()) : result;
}

function clipLine(points: readonly RouteMapPoint[], left: number, right: number): RouteMapPoint[] {
	const result: RouteMapPoint[] = [];
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1],
			b = points[i];
		const dx = b.x - a.x;
		if (!dx && (a.x < left || a.x > right)) continue;
		const start = dx ? Math.max(0, Math.min((left - a.x) / dx, (right - a.x) / dx)) : 0;
		const end = dx ? Math.min(1, Math.max((left - a.x) / dx, (right - a.x) / dx)) : 1;
		if (start > end) continue;
		const at = (t: number) => ({ x: a.x + dx * t, y: a.y + (b.y - a.y) * t });
		if (!result.length) result.push(at(start));
		result.push(at(end));
	}
	return result;
}
/** Allocate a missing family rail after all paper paths and labels are reserved. */
function restoredFamilyRoute(
	item: RouteMapPaperItem,
	line: RouteMapLine,
	isChild: (id: string) => boolean,
	allowCrossings = false
): readonly RouteMapPoint[] | undefined {
	type Segment = readonly [RouteMapPoint, RouteMapPoint];
	const segments = (points: readonly RouteMapPoint[]): Segment[] =>
		points.slice(1).map((point, index): Segment => [points[index], point]);
	const source = item.stations.find((station) => station.id === line.taskIds[0])!.center;
	const target = item.stations.find((station) => station.id === line.taskIds[1])!.center;
	// Leave 1 px between strokes and 2 px more for the rendered bend curves.
	const gap = 3;
	const padding = line.width / 2 + gap;
	const bottom = Math.min(item.height, item.markerY ?? item.height, item.titleY ?? item.height);
	const inside = (point: RouteMapPoint) =>
		point.x >= padding &&
		point.x <= item.width - padding &&
		point.y >= padding &&
		point.y <= bottom - padding;
	const inflate = (box: RouteMapBox, margin: number): RouteMapBox => ({
		x: box.x - margin,
		y: box.y - margin,
		w: box.w + 2 * margin,
		h: box.h + 2 * margin
	});
	const boxes = [
		...item.stations.flatMap((station) => [
			station.labelBox,
			...(line.taskIds.includes(station.id) ? [] : [station.hitBox, station.focusBox])
		]),
		...item.stageLabels.map((label) => label.box),
		...item.signs
			.filter((sign) => !sign.stationId || !line.taskIds.includes(sign.stationId))
			.map((sign) => ({
				x: sign.center.x - sign.width / 2,
				y: sign.center.y - sign.height / 2,
				w: sign.width,
				h: sign.height
			}))
	].map((box) => inflate(box, padding));
	const routeWidth = (route: RouteMapRoute) =>
		route.cycle
			? 4
			: route.carrier === 'line'
				? isChild(route.from) || isChild(route.to)
					? routeMapSizes.paper.branch
					: routeMapSizes.paper.rail
				: routeMapSizes.paper.path;
	const paths: {
		points: readonly RouteMapPoint[];
		ids: readonly string[];
		width: number;
	}[] = [
		...item.lines.map((entry) => ({
			points: entry.points,
			ids: entry.taskIds,
			width: entry.width
		})),
		...[...item.edges, ...item.continuations].flatMap((route) => [
			{ points: route.points, ids: [route.from, route.to], width: routeWidth(route) },
			...(route.chevron?.length
				? [{ points: route.chevron, ids: [], width: routeMapSizes.paper.path }]
				: [])
		]),
		...(item.markers ?? []).flatMap((marker) =>
			(marker.stubs ?? []).map((stub) => ({
				points: stub.points,
				ids: [stub.from, stub.to],
				width: Math.max(routeWidth(stub), stub.ring ? 4 : 0)
			}))
		)
	];
	// A shared station permits only the first 16 px of a common departure.
	const outsideStations = (parts: readonly Segment[], centers: readonly RouteMapPoint[]) => {
		let result = [...parts];
		for (const center of centers)
			result = result.flatMap(([a, b]): Segment[] => {
				const dx = b.x - a.x,
					dy = b.y - a.y;
				const lengthSquared = dx * dx + dy * dy;
				if (!lengthSquared) return [];
				const x = a.x - center.x,
					y = a.y - center.y;
				const dot = x * dx + y * dy;
				const discriminant = dot * dot - lengthSquared * (x * x + y * y - 16 * 16);
				if (discriminant <= 0) return [[a, b]];
				const low = Math.max(0, (-dot - Math.sqrt(discriminant)) / lengthSquared);
				const high = Math.min(1, (-dot + Math.sqrt(discriminant)) / lengthSquared);
				if (low >= high) return [[a, b]];
				const at = (t: number) => ({ x: a.x + t * dx, y: a.y + t * dy });
				return [
					...(low > 0 ? [[a, at(low)] as const] : []),
					...(high < 1 ? [[at(high), b] as const] : [])
				];
			});
		return result;
	};
	const reservations = paths.map((path) => {
		const shared = item.stations
			.filter((station) => line.taskIds.includes(station.id) && path.ids.includes(station.id))
			.map((station) => station.center);
		const parts = outsideStations(segments(path.points), shared);
		const radius = (line.width + path.width) / 2 + gap;
		return {
			shared,
			parts,
			radius,
			boxes: parts.map(([a, b]) =>
				inflate(
					{
						x: Math.min(a.x, b.x),
						y: Math.min(a.y, b.y),
						w: Math.abs(b.x - a.x),
						h: Math.abs(b.y - a.y)
					},
					radius
				)
			)
		};
	});
	// Open bounds let a reserved corridor use the exact clearance boundary.
	const hitsBox = ([a, b]: Segment, box: RouteMapBox) => {
		let low = 0,
			high = 1;
		for (const [position, delta, min, max] of [
			[a.x, b.x - a.x, box.x, box.x + box.w],
			[a.y, b.y - a.y, box.y, box.y + box.h]
		]) {
			if (!delta) {
				if (position <= min || position >= max) return false;
				continue;
			}
			const first = (min - position) / delta,
				last = (max - position) / delta;
			low = Math.max(low, Math.min(first, last));
			high = Math.min(high, Math.max(first, last));
			if (low >= high) return false;
		}
		return true;
	};
	const clear = (points: readonly RouteMapPoint[], partial = false) => {
		if (!points.every(inside)) return false;
		const parts = segments(points);
		if (boxes.some((box) => parts.some((part) => hitsBox(part, box)))) return false;
		return reservations.every((reservation) =>
			outsideStations(parts, reservation.shared).every((part) =>
				reservation.boxes.every((box, index) => {
					if (!hitsBox(part, box)) return true;
					if (!allowCrossings) return false;
					const [a, b] = part,
						[c, d] = reservation.parts[index];
					const dx = b.x - a.x,
						dy = b.y - a.y,
						ex = d.x - c.x,
						ey = d.y - c.y;
					const length = Math.hypot(dx, dy),
						otherLength = Math.hypot(ex, ey);
					// Grid steps must not allow a parallel run through many short segments.
					if (!length || !otherLength || Math.abs(dx * ex + dy * ey) > 1e-6 * length * otherLength)
						return false;
					if (partial) return true;
					// Cross the complete stroke band. Do not turn or join at the crossing.
					const first = ((a.x - c.x) * ey - (a.y - c.y) * ex) / otherLength;
					const last = ((b.x - c.x) * ey - (b.y - c.y) * ex) / otherLength;
					const along = ((c.x - a.x) * dy - (c.y - a.y) * dx) / (dx * ey - dy * ex);
					return (
						Math.min(first, last) <= -reservation.radius &&
						Math.max(first, last) >= reservation.radius &&
						along * otherLength >= reservation.radius &&
						(1 - along) * otherLength >= reservation.radius
					);
				})
			)
		);
	};
	const obstacles = [...boxes, ...reservations.flatMap((reservation) => reservation.boxes)];
	const coordinates = (axis: 'x' | 'y', limit: number) =>
		[
			...new Set([
				padding,
				limit - padding,
				source[axis],
				target[axis],
				...[source, target].flatMap((point) => [point[axis] - 16, point[axis] + 16]),
				...obstacles.flatMap((box) => [box[axis], box[axis] + (axis === 'x' ? box.w : box.h)])
			])
		]
			.filter((value) => value >= padding && value <= limit - padding)
			.sort((a, b) => a - b);
	const xs = coordinates('x', item.width),
		ys = coordinates('y', bottom);
	const count = xs.length * ys.length;
	// Bound each search. The caller retries crossings, then uses family-cut strokes.
	if (!inside(source) || !inside(target) || count > 131072) return;
	const pointAt = (node: number) => ({
		x: xs[node % xs.length],
		y: ys[Math.floor(node / xs.length)]
	});
	const nodeAt = (point: RouteMapPoint) => ys.indexOf(point.y) * xs.length + xs.indexOf(point.x);
	const start = nodeAt(source),
		goal = nodeAt(target);
	const costs = new Float64Array(count * 2).fill(Infinity);
	const previous = new Int32Array(count * 2).fill(-1);
	const heap: { state: number; cost: number; priority: number }[] = [];
	const push = (state: number, cost: number, prior: number) => {
		if (cost >= costs[state]) return;
		costs[state] = cost;
		previous[state] = prior;
		const point = pointAt(Math.floor(state / 2));
		const entry = {
			state,
			cost,
			priority: cost + Math.abs(target.x - point.x) + Math.abs(target.y - point.y)
		};
		heap.push(entry);
		let at = heap.length - 1;
		while (at && heap[Math.floor((at - 1) / 2)].priority > entry.priority) {
			const parent = Math.floor((at - 1) / 2);
			heap[at] = heap[parent];
			at = parent;
		}
		heap[at] = entry;
	};
	const pop = () => {
		const first = heap[0],
			last = heap.pop()!;
		if (heap.length) {
			let at = 0;
			while (at * 2 + 1 < heap.length) {
				let child = at * 2 + 1;
				if (child + 1 < heap.length && heap[child + 1].priority < heap[child].priority) child++;
				if (heap[child].priority >= last.priority) break;
				heap[at] = heap[child];
				at = child;
			}
			heap[at] = last;
		}
		return first;
	};
	const segmentClear = new Map<number, boolean>();
	push(start * 2, 0, -1);
	push(start * 2 + 1, 0, -1);
	let visits = 0;
	while (heap.length && visits++ < 32768) {
		const entry = pop();
		if (costs[entry.state] !== entry.cost) continue;
		const node = Math.floor(entry.state / 2);
		if (node === goal) {
			const points: RouteMapPoint[] = [];
			for (let state = entry.state; state >= 0; state = previous[state])
				points.push(pointAt(Math.floor(state / 2)));
			points.reverse();
			const simple = points.filter(
				(point, index) =>
					!index ||
					index === points.length - 1 ||
					((points[index - 1].x !== point.x || point.x !== points[index + 1].x) &&
						(points[index - 1].y !== point.y || point.y !== points[index + 1].y))
			);
			const rounded = chamferRouteMapPath(simple, 5);
			if (clear(rounded)) return rounded;
			if (clear(simple)) return simple;
			return;
		}
		const x = node % xs.length,
			y = Math.floor(node / xs.length);
		for (const [next, axis] of [
			[x ? node - 1 : -1, 0],
			[x + 1 < xs.length ? node + 1 : -1, 0],
			[y ? node - xs.length : -1, 1],
			[y + 1 < ys.length ? node + xs.length : -1, 1]
		]) {
			if (next < 0) continue;
			const key = Math.min(node, next) * count + Math.max(node, next);
			let allowed = segmentClear.get(key);
			if (allowed === undefined) {
				allowed = clear([pointAt(node), pointAt(next)], true);
				segmentClear.set(key, allowed);
			}
			if (!allowed) continue;
			const a = pointAt(node),
				b = pointAt(next);
			push(
				next * 2 + axis,
				entry.cost + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + (entry.state % 2 === axis ? 0 : 8),
				entry.state
			);
		}
	}
}

/** Return one endpoint stroke where a family rail meets a paper boundary. */
function paperFamilyCut(
	item: RouteMapPaperItem,
	line: RouteMapLine,
	stationId: string,
	exit: boolean,
	key = `${line.key}:${item.id}`
): RouteMapLine {
	const station = item.stations.find((station) => station.id === stationId)!;
	const laneY = Math.max(3, station.center.y - 16);
	const points = exit
		? [station.center, { x: station.center.x + 16, y: laneY }, { x: item.width, y: laneY }]
		: [{ x: 0, y: laneY }, { x: station.center.x - 16, y: laneY }, station.center];
	return { ...line, key, points };
}

/**
 * Return a clear family rail. Retry with perpendicular crossings if needed.
 * If neither search finds a route, return a family-cut stroke at each station.
 */
export function restorePaperFamilyRail(
	item: RouteMapPaperItem,
	line: RouteMapLine,
	isChild: (id: string) => boolean
): RouteMapLine[] {
	const points =
		restoredFamilyRoute(item, line, isChild) ?? restoredFamilyRoute(item, line, isChild, true);
	if (points) return [{ ...line, points }];
	return [
		paperFamilyCut(item, line, line.taskIds[0], true, `${line.key}:${item.id}:exit`),
		paperFamilyCut(item, line, line.taskIds[1], false, `${line.key}:${item.id}:entry`)
	];
}

export function routeMapPaper(model: RouteMapModel, metrics: RouteMapPaperMetrics): RouteMapPaper {
	const width =
		metrics.sheetWidth - 2 * metrics.margin - metrics.repeatedLabelWidth - 2 * metrics.gutter;
	const height =
		metrics.sheetHeight - 2 * metrics.margin - metrics.headerHeight - metrics.footerHeight;
	const nodes = new Map(model.nodes.map((n) => [n.id, n]));
	const summaries = new Map(
		model.groups
			.filter((group) => group.taskIds.length > 1)
			.map((group) => [group.id, metrics.summaryText?.(group.id) ?? ''])
	);
	const summaryLines = (id: string, labelWidth: number) =>
		wrap(summaries.get(id) ?? '', labelWidth, metrics.measureText, labelWidth, true);
	const summaryHeight = Math.max(
		0,
		...[...summaries.keys()].map((id) => summaryLines(id, metrics.labelWidth).length * 14)
	);
	// Reserve the largest paper label before the single whole-scene routing pass.
	const layout = routeMapLayout(model, {
		...metrics,
		paper: true,
		labelHeight: Math.max(28, metrics.labelHeight) + summaryHeight
	});
	const refs = new Map(layout.stations.map((s, i) => [s.id, `R${i + 1}`]));
	const labelLines = (id: string, width: number) =>
		wrap(
			nodes.get(id)!.title,
			width,
			metrics.measureText,
			Math.max(1, width - metrics.measureText(refs.get(id)!) - 3 - 15),
			true
		);
	// Fit each complete column once. Vertical fragments keep the same panel membership.
	const columns = layout.columns.map((col) => ({
		id: col.id,
		width: Math.min(
			width,
			Math.max(
				col.routingOnly
					? metrics.labelWidth + metrics.columnGap
					: metrics.hitSize + metrics.clearance * 2 + 32,
				...col.stationIds.map(
					(id) =>
						Math.min(metrics.labelWidth, metrics.measureText(nodes.get(id)!.title)) +
						metrics.columnGap +
						metrics.clearance * 2
				)
			)
		)
	}));
	const panels: { id: string; columnIds: string[] }[] = [];
	let used = 0;
	for (const col of columns) {
		if (!panels.length || used + col.width > width) {
			panels.push({ id: `panel:${col.id}:${width}:${height}`, columnIds: [] });
			used = 0;
		}
		panels.at(-1)!.columnIds.push(col.id);
		used += col.width;
	}
	if (!panels.length) panels.push({ id: `panel:empty:${width}:${height}`, columnIds: [] });
	const items: RouteMapPaperItem[] = [];
	const empty = (id: string, panelId: string, w: number, h: number): RouteMapPaperItem => ({
		id,
		panelId,
		width: w,
		height: h,
		stations: [],
		titles: [],
		edges: [],
		continuations: [],
		lines: [],
		signs: [],
		stageLabels: []
	});
	const stationItems = new Map<string, RouteMapPaperItem>();
	const wholePanels = new Set<RouteMapPaperItem>();
	const colMap = new Map(columns.map((c) => [c.id, c]));
	for (const panel of panels) {
		let offset = 0;
		const xs = new Map<string, number>();
		for (const id of panel.columnIds) {
			const w = colMap.get(id)!.width;
			xs.set(id, offset + w / 2);
			offset += w;
		}
		let panelWidth = Math.max(1, offset);
		const nativeColumns = layout.columns.filter((c) => panel.columnIds.includes(c.id));
		const nativeWidths = nativeColumns.map((column, index) =>
			index < nativeColumns.length - 1
				? nativeColumns[index + 1].x - column.x
				: metrics.labelWidth + metrics.clearance * 2 + 8
		);
		const nativeWidth = nativeWidths.reduce((sum, value) => sum + value, 0);
		const left = (nativeColumns[0]?.x ?? 0) - metrics.labelWidth / 2 - metrics.clearance - 4;
		const members = layout.stations.filter((s) => panel.columnIds.includes(s.columnId));
		const local = new Set(members.map((s) => s.id));
		const decorative = layout.signs.filter(
			(s) =>
				s.stationId === null &&
				(!model.nodes.some((n) => n.stageId === s.stageId)
					? panel === panels[0]
					: panel.columnIds.includes(layout.columns.findLast((c) => c.x <= s.center.x)!.id))
		);
		const signs = layout.signs.filter((s) => s.stationId && local.has(s.stationId));
		signs.push(...decorative);
		const labels = layout.stageLabels.filter((l) =>
			l.hostId ? local.has(l.hostId) : decorative.some((s) => s.stageId === l.stageId)
		);
		const edges = layout.routes.filter((r) => local.has(r.from) && local.has(r.to));
		const lines = layout.lines
			.filter((line) => line.kind !== 'workflow' || line.taskIds.every((id) => local.has(id)))
			.filter(
				(line) =>
					!line.dependencyKeys.length ||
					line.dependencyKeys.every((key) => edges.some((edge) => edge.key === key))
			)
			.filter(
				(l) =>
					l.taskIds.some((id) => local.has(id)) || decorative.some((s) => s.stageId === l.stageId)
			)
			.map((l) => ({ ...l, points: clipLine(l.points, left, left + nativeWidth) }))
			.filter((l) => l.points.length > 1);
		const points = [...edges, ...lines].flatMap((r) => r.points);
		const boxes = [...members.flatMap((s) => [s.hitBox, s.labelBox]), ...labels.map((l) => l.box)];
		const top = Math.min(
			Infinity,
			...members
				.filter((station) =>
					[
						...layout.routes,
						...layout.lines
							.filter((line) => line.kind === 'workflow')
							.map((line) => ({ from: line.taskIds[0], to: line.taskIds[1] }))
					].some(
						(edge) =>
							(edge.from === station.id && !local.has(edge.to)) ||
							(edge.to === station.id && !local.has(edge.from))
					)
				)
				.map((station) => station.center.y - 12 - metrics.clearance),
			...points.map((p) => p.y - metrics.clearance),
			...boxes.map((b) => b.y - metrics.clearance),
			...signs.map((s) => s.center.y - s.height / 2 - metrics.clearance)
		);
		const bottom = Math.max(
			1,
			...points.map((p) => p.y + metrics.clearance),
			...boxes.map((b) => b.y + b.h + metrics.clearance),
			...signs.map((s) => s.center.y + s.height / 2 + metrics.clearance)
		);
		const fitsWidth =
			nativeWidth <= width &&
			points.every((p) => p.x >= left && p.x <= left + nativeWidth) &&
			boxes.every((b) => b.x >= left && b.x + b.w <= left + nativeWidth) &&
			signs.every(
				(s) => s.center.x - s.width / 2 >= left && s.center.x + s.width / 2 <= left + nativeWidth
			);
		// Keep the shared paper geometry intact when the complete panel fits.
		if ((members.length || decorative.length) && fitsWidth && bottom - top <= height) {
			panelWidth = nativeWidth;
			for (const [i, col] of nativeColumns.entries()) colMap.get(col.id)!.width = nativeWidths[i];
			const point = (p: RouteMapPoint) => ({ x: p.x - left, y: p.y - top });
			const box = (b: RouteMapStation['hitBox']) => ({ ...b, ...point(b) });
			const item = empty(`whole:${panel.id}`, panel.id, panelWidth, bottom - top);
			item.lineY = 0;
			item.stations = members.map((s) => ({
				...s,
				center: point(s.center),
				inPort: point(s.inPort),
				outPort: point(s.outPort),
				hitBox: { ...point({ x: s.center.x - 4, y: s.center.y - 4 }), w: 8, h: 8 },
				focusBox: { ...point({ x: s.center.x - 4, y: s.center.y - 4 }), w: 8, h: 8 },
				labelBox: box(s.labelBox),
				controlBoxes: [],
				collapsedParent:
					model.groups.some((g) => g.id === s.id && g.taskIds.length > 1) &&
					!model.nodes.some((n) => n.parentId === s.id),
				reference: refs.get(s.id)!,
				labelLines: labelLines(s.id, s.labelBox.w).slice(0, 2),
				summaryLines: summaryLines(s.id, s.labelBox.w)
			}));
			item.edges = edges.map((r) => ({ ...r, points: r.points.map(point) }));
			item.lines = lines.map((l) => ({ ...l, points: l.points.map(point) }));
			item.signs = signs.map((s) => ({ ...s, center: point(s.center) }));
			item.stageLabels = labels.map((l) => ({
				...l,
				box: box(l.box)
			}));
			items.push(item);
			wholePanels.add(item);
			for (const s of item.stations) stationItems.set(s.id, item);
			continue;
		}
		// Fragment global rows. Stage membership never creates a paper band.
		const rows = [...new Set(members.map((station) => station.track))].sort((a, b) => a - b);
		for (const row of rows) {
			const group = members.filter((station) => station.track === row);
			const localIds = new Set(group.map((station) => station.id));
			const localEdges = layout.routes.filter(
				(route) => localIds.has(route.from) && localIds.has(route.to)
			);
			const y = 24 + 3 * localEdges.length;
			const item = empty(
				`row:${panel.id}:${row}`,
				panel.id,
				panelWidth,
				y + 15 + metrics.labelHeight + 4 + 20 + 4
			);
			item.lineY = y;
			item.stations = group.map((station) => {
				const x = xs.get(station.columnId)!;
				const labelWidth = Math.min(
					metrics.labelWidth,
					colMap.get(station.columnId)!.width - 2 * metrics.clearance
				);
				const center = { x, y };
				const hitBox = { x: x - 4, y: y - 4, w: 8, h: 8 };
				const name = labelLines(station.id, labelWidth).slice(0, 2);
				const summary = summaryLines(station.id, labelWidth);
				return {
					...station,
					center,
					inPort: center,
					outPort: center,
					hitBox,
					focusBox: hitBox,
					controlBoxes: [],
					labelBox: {
						x: x - labelWidth / 2,
						y: y + 15,
						w: labelWidth,
						h: (Math.max(1, name.length) + summary.length) * 14
					},
					collapsedParent:
						model.groups.some((group) => group.id === station.id && group.taskIds.length > 1) &&
						!model.nodes.some((node) => node.parentId === station.id),
					reference: refs.get(station.id)!,
					labelLines: name,
					summaryLines: summary
				};
			});
			item.height = Math.max(
				item.height,
				...item.stations.map((station) => station.labelBox.y + station.labelBox.h + 4 + 20 + 4)
			);
			const local = new Map(item.stations.map((station) => [station.id, station]));
			item.edges = localEdges.map((route, index) => {
				const source = local.get(route.from)!.center,
					target = local.get(route.to)!.center;
				if (
					source.x < target.x &&
					!item.stations.some(
						(station) => station.center.x > source.x && station.center.x < target.x
					)
				)
					return { ...route, points: [source, target] };
				const laneY = 8 + 3 * index;
				return {
					...route,
					points: chamferRouteMapPath(
						[
							source,
							{ x: source.x + 12, y: source.y - 12 },
							{ x: source.x + 12, y: laneY },
							{ x: target.x - 12, y: laneY },
							{ x: target.x - 12, y: target.y - 12 },
							target
						],
						5
					)
				};
			});
			item.lines = layout.lines
				.filter((line) => line.taskIds.every((id) => local.has(id)))
				.map((line, index) => {
					const route = item.edges.find((edge) => edge.key === line.key);
					if (route) return { ...line, points: route.points };
					const source = local.get(line.taskIds[0])!.center,
						target = local.get(line.taskIds[1])!.center;
					if (
						source.x < target.x &&
						!item.stations.some(
							(station) => station.center.x > source.x && station.center.x < target.x
						)
					)
						return { ...line, points: [source, target] };
					const laneY = Math.max(3, source.y - 16 - 3 * (index % 3));
					return {
						...line,
						points: chamferRouteMapPath(
							[
								source,
								{ x: source.x + 12, y: source.y - 12 },
								{ x: source.x + 12, y: laneY },
								{ x: target.x - 12, y: laneY },
								{ x: target.x - 12, y: target.y - 12 },
								target
							],
							5
						)
					};
				});
			item.signs = signs
				.filter((sign) => sign.stationId && local.has(sign.stationId))
				.map((sign) => ({ ...sign, center: local.get(sign.stationId!)!.center }));
			item.stageLabels = labels
				.filter((label) => label.hostId && local.has(label.hostId))
				.map((label) => {
					const station = local.get(label.hostId!)!;
					return {
						...label,
						box: {
							x: station.labelBox.x,
							y: station.labelBox.y + station.labelBox.h + 4,
							w: station.labelBox.w,
							h: 20
						}
					};
				});
			const previous = items.at(-1);
			const previousIds = new Set(previous?.stations.map((station) => station.id) ?? []);
			const separated =
				!model.edges.some(
					(edge) =>
						(previousIds.has(edge.from) && localIds.has(edge.to)) ||
						(localIds.has(edge.from) && previousIds.has(edge.to))
				) &&
				!model.nodes.some(
					(node) =>
						node.parentId &&
						((previousIds.has(node.parentId) && localIds.has(node.id)) ||
							(localIds.has(node.parentId) && previousIds.has(node.id)))
				);
			if (
				previous &&
				previous.panelId === item.panelId &&
				previous.id.startsWith('row:') &&
				previous.height + item.height <= height &&
				separated
			) {
				const dy = previous.height;
				const point = (point: RouteMapPoint) => ({ ...point, y: point.y + dy });
				const box = (box: RouteMapStation['hitBox']) => ({ ...box, y: box.y + dy });
				previous.stations = [
					...previous.stations,
					...item.stations.map((station) => ({
						...station,
						center: point(station.center),
						inPort: point(station.inPort),
						outPort: point(station.outPort),
						hitBox: box(station.hitBox),
						focusBox: box(station.focusBox),
						labelBox: box(station.labelBox)
					}))
				];
				previous.edges = [
					...previous.edges,
					...item.edges.map((edge) => ({ ...edge, points: edge.points.map(point) }))
				];
				previous.lines = [
					...previous.lines,
					...item.lines.map((line) => ({ ...line, points: line.points.map(point) }))
				];
				previous.signs = [
					...previous.signs,
					...item.signs.map((sign) => ({ ...sign, center: point(sign.center) }))
				];
				previous.stageLabels = [
					...previous.stageLabels,
					...item.stageLabels.map((label) => ({ ...label, box: box(label.box) }))
				];
				previous.height += item.height;
				for (const station of item.stations) stationItems.set(station.id, previous);
			} else {
				items.push(item);
				for (const station of item.stations) stationItems.set(station.id, item);
			}
		}
		// A fragmented panel keeps each empty stage in one complete placeholder item.
		for (const sign of decorative) {
			const size = sign.width;
			const center = { x: panelWidth / 2, y: metrics.clearance + size / 2 };
			const labelWidth = Math.min(metrics.labelWidth, panelWidth - 2 * metrics.clearance);
			const box = {
				x: center.x - labelWidth / 2,
				y: center.y + 15,
				w: labelWidth,
				h: 20
			};
			const item = empty(
				`empty-stage:${panel.id}:${sign.stageId}`,
				panel.id,
				panelWidth,
				box.y + box.h + metrics.clearance
			);
			item.lineY = center.y;
			item.stageId = sign.stageId;
			item.signs = [{ ...sign, center }];
			item.stageLabels = labels
				.filter((label) => label.hostId === null && label.stageId === sign.stageId)
				.map((label) => ({ ...label, box }));
			items.push(item);
		}
	}

	const missingFamilyRails: { item: RouteMapPaperItem; line: RouteMapLine }[] = [];
	// Keep family rails after row merging and at each endpoint fragment.
	for (const line of layout.lines.filter((line) => line.kind === 'family')) {
		const from = stationItems.get(line.taskIds[0])!,
			to = stationItems.get(line.taskIds[1])!;
		if (from === to) {
			// Merged rows can share an item without their original cross-row rail.
			if (wholePanels.has(from) || from.lines.some((entry) => entry.key === line.key)) continue;
			missingFamilyRails.push({ item: from, line });
			continue;
		}
		for (const [item, id, exit] of [
			[from, line.taskIds[0], true],
			[to, line.taskIds[1], false]
		] as const) {
			if (wholePanels.has(item)) continue;
			item.lines = [...item.lines, paperFamilyCut(item, line, id, exit)];
		}
	}

	let pairNumber = 0;
	const paperConnections = [
		...layout.routes.map((route) => ({ ...route, relation: 'dependency' as const })),
		...layout.lines
			.filter((line) => line.kind === 'workflow')
			.map((line) => ({
				key: line.key,
				from: line.taskIds[0],
				to: line.taskIds[1],
				cycle: false,
				crossStage: false,
				stored: [],
				carrier: 'line' as const,
				points: line.points,
				relation: 'workflow' as const
			}))
	];
	for (const route of paperConnections) {
		const from = stationItems.get(route.from)!,
			to = stationItems.get(route.to)!;
		if (from === to) continue;
		const boundary = `${from.id}:${to.id}`,
			id = `C${++pairNumber}`;
		for (const [item, kind, stationId] of [
			[from, 'exit', route.from],
			[to, 'entry', route.to]
		] as const) {
			const s = item.stations.find((s) => s.id === stationId)!;
			const d = 12;
			const a = { x: s.center.x + (kind === 'exit' ? d : -d), y: s.center.y - d };
			const end = { x: a.x + (kind === 'exit' ? 12 : -12), y: a.y };
			let points = kind === 'exit' ? [s.center, a, end] : [end, a, s.center];

			const laneY = kind === 'exit' ? points.at(-1)!.y : points[0].y;
			const stub =
				kind === 'exit'
					? [
							{ x: item.width - 12, y: laneY },
							{ x: item.width, y: laneY }
						]
					: [
							{ x: 0, y: laneY },
							{ x: 12, y: laneY }
						];
			points = kind === 'exit' ? [...points.slice(0, -1), ...stub] : [...stub, ...points.slice(1)];
			const continuation: RouteMapContinuation = {
				...route,
				id,
				boundary,
				kind,
				stationId,
				points,
				...(route.carrier === 'walkway'
					? { ring: kind === 'exit' ? points.at(-1)! : points[0] }
					: {})
			};
			item.continuations = [...item.continuations, continuation];
		}
	}
	const stubLanes = (marker: RouteMapContinuationMarker) =>
		Math.max(
			1,
			Math.min(
				marker.pairs.length,
				6,
				Math.floor((height - 10 - metrics.clearance * 2 - 4) / 3) + 1
			)
		);
	const stubHeight = (marker: RouteMapContinuationMarker) =>
		metrics.clearance * 2 + 4 + 3 * (stubLanes(marker) - 1);
	const attachStubs = (
		marker: RouteMapContinuationMarker,
		source: RouteMapPaperItem,
		destination: RouteMapPaperItem
	) => {
		marker.stubs = source.continuations
			.filter(
				(c) =>
					c.stationId === marker.stationId &&
					c.kind === marker.kind &&
					c.relation === marker.relation
			)
			.map((c, i) => {
				const points = c.kind === 'exit' ? c.points.slice(-2) : c.points.slice(0, 2);
				const local =
					destination === source
						? points
						: points.map((p) => ({ ...p, y: metrics.clearance + 2 + 3 * (i % stubLanes(marker)) }));
				return {
					...c,
					points: local,
					chevron: undefined,
					...(c.ring ? { ring: c.kind === 'exit' ? local[1] : local[0] } : {})
				};
			});
	};
	// One marker names all targets at a station and side. Extra rows form legal items.
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		const markers: RouteMapContinuationMarker[] = [];
		for (const c of item.continuations) {
			let marker = markers.find(
				(m) => m.stationId === c.stationId && m.kind === c.kind && m.relation === c.relation
			);
			if (!marker) {
				marker = {
					stationId: c.stationId,
					kind: c.kind,
					relation: c.relation,
					targets: [],
					pairs: []
				};
				markers.push(marker);
			}
			const target = c.kind === 'exit' ? c.to : c.from;
			if (!marker.targets.some((t) => t.taskId === target))
				marker.targets = [
					...marker.targets,
					{ taskId: target, reference: refs.get(target)!, title: nodes.get(target)!.title }
				];
			marker.pairs = [...marker.pairs, { id: c.id, boundary: c.boundary, key: c.key }];
		}

		const extra: RouteMapPaperItem[] = [];
		let destination = item;
		item.markers = [];
		item.markerY = item.height;
		for (const marker of markers) {
			const targets =
				metrics.formatTargets?.(marker.targets) ??
				marker.targets.map((t) => `${t.reference} ${t.title}`).join(' ');
			const text = [...marker.pairs.map((p) => p.id), targets].join(', ');
			const rows = Math.max(
				1,
				Math.ceil((metrics.measureText(text) + metrics.measureText(' from → and ')) / item.width)
			);
			const rowHeight = rows * 10;
			if (rowHeight + stubHeight(marker) > height) {
				const lines = wrap(
					targets,
					Math.max(
						1,
						item.width -
							metrics.measureText(marker.pairs.map((p) => p.id).join(' ')) -
							metrics.measureText(' from → ')
					),
					metrics.measureText
				);
				const capacity = Math.max(1, Math.floor((height - stubHeight(marker)) / 10));
				const first = empty(
					`markers:${item.id}:${extra.length}`,
					item.panelId,
					item.width,
					Math.min(capacity, lines.length) * 10 + stubHeight(marker)
				);
				first.stageId = nodes.get(marker.stationId)!.stageId;
				first.markerY = stubHeight(marker);
				marker.rowY = 0;
				marker.rowHeight = first.height - first.markerY;
				marker.textLines = lines.slice(0, capacity);
				first.markers = [marker];
				attachStubs(marker, item, first);
				extra.push(first);
				for (let start = capacity; start < lines.length; start += capacity) {
					const chunk = lines.slice(start, start + capacity);
					const part = empty(
						`marker-text:${item.id}:${extra.length}`,
						item.panelId,
						item.width,
						chunk.length * 10
					);
					part.stageId = nodes.get(marker.stationId)!.stageId;
					part.markerText = [{ lines: chunk }];
					extra.push(part);
				}
				continue;
			}
			if (destination !== item || destination.height + rowHeight > height) {
				destination = empty(`markers:${item.id}:${extra.length}`, item.panelId, item.width, 0);
				destination.stageId = nodes.get(marker.stationId)!.stageId;
				destination.markers = [];
				destination.height = stubHeight(marker);
				destination.markerY = destination.height;
				extra.push(destination);
			}
			attachStubs(marker, item, destination);
			marker.rowY = destination.height - (destination.markerY ?? 0);
			marker.rowHeight = rowHeight;
			destination.markers = [...(destination.markers ?? []), marker];
			destination.height += rowHeight;
		}
		items.splice(i + 1, 0, ...extra);
	}
	// Full titles use measured physical rows and retain every character.
	for (const s of layout.stations) {
		const item = stationItems.get(s.id)!,
			station = item.stations.find((t) => t.id === s.id)!;
		const title = nodes.get(s.id)!.title;
		if (labelLines(s.id, station.labelBox.w).length <= 2 && title.trim()) continue;
		const lines = wrap(
			title,
			Math.max(1, width - metrics.measureText(`${station.reference} `)),
			metrics.measureText
		);
		const count = Math.max(1, Math.floor(height / metrics.lineHeight));
		if (
			wholePanels.has(item) &&
			item.height + lines.length * metrics.lineHeight <= height &&
			lines.every((line) => metrics.measureText(`${station.reference} ${line}`) <= item.width)
		) {
			item.titleY ??= item.height;
			item.titles = [
				...item.titles,
				...lines.map((text) => ({ taskId: s.id, reference: station.reference, text }))
			];
			item.height += lines.length * metrics.lineHeight;
			continue;
		}
		let at = items.indexOf(item) + 1;
		for (let start = 0; start < lines.length; start += count) {
			const titles = lines
				.slice(start, start + count)
				.map((text) => ({ taskId: s.id, reference: station.reference, text }));
			const part = empty(
				`title:${s.id}:${start}`,
				item.panelId,
				width,
				titles.length * metrics.lineHeight
			);
			part.stageId = nodes.get(s.id)!.stageId;
			part.titles = titles;
			items.splice(at++, 0, part);
		}
	}
	for (const item of items) {
		// Rebuild destination signs after paper translations and fragment routing.
		item.edges = item.edges.map((edge) => ({
			...edge,
			chevron:
				edge.carrier === 'walkway' && !edge.cycle ? routeMapChevron(edge.points, true) : undefined
		}));
		item.continuations = item.continuations.map((edge) => ({
			...edge,
			chevron:
				edge.carrier === 'walkway' && !edge.cycle && edge.kind === 'entry'
					? routeMapChevron(edge.points, true)
					: undefined
		}));
		item.stations = item.stations.map((station) => ({
			...station,
			labelBox: {
				...station.labelBox,
				h: (Math.max(1, station.labelLines.length) + (station.summaryLines?.length ?? 0)) * 14
			}
		}));
		item.stageLabels = item.stageLabels.map((label) => {
			const station = item.stations.find((station) => station.id === label.hostId);
			return station
				? { ...label, box: { ...label.box, y: station.labelBox.y + station.labelBox.h + 4 } }
				: label;
		});
	}
	// Continuations, stubs and final label bounds must exist before corridor allocation.
	for (const { item, line } of missingFamilyRails) {
		item.lines = [
			...item.lines,
			...restorePaperFamilyRail(item, line, (id) => !!nodes.get(id)?.parentId)
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
