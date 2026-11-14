import type { RouteMapModel, RouteMapNode } from '#lib/domain/route-map.ts';
import {
	buildRouteMapRoutes,
	classifyRouteMapEdges,
	type RouteMapRoute
} from './route-map-router.ts';

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export interface RouteMapPoint {
	x: number;
	y: number;
}
export interface RouteMapBox {
	x: number;
	y: number;
	w: number;
	h: number;
}
export interface RouteMapMetrics {
	hitSize: number;
	labelWidth: number;
	labelHeight: number;
	columnGap: number;
	stageGap: number;
	laneGap: number;
	clearance: number;
	paper?: boolean;
	labelHeights?: ReadonlyMap<string, number>;
}
export interface RouteMapStation {
	id: string;
	columnId: string;
	column: number;
	rank: number;
	track: number;
	center: RouteMapPoint;
	hitBox: RouteMapBox;
	labelBox: RouteMapBox;
	focusBox: RouteMapBox;
	controlBoxes: readonly RouteMapBox[];
	inPort: RouteMapPoint;
	outPort: RouteMapPoint;
}
export interface RouteMapLine {
	key: string;
	stageId: string;
	taskIds: readonly string[];
	dependencyKeys: readonly string[];
	points: readonly RouteMapPoint[];
	width: number;
	kind?: 'dependency' | 'workflow' | 'family';
}

export interface RouteMapSign {
	kind: 'terminus' | 'interchange';
	stationId: string | null;
	stageId: string;
	center: RouteMapPoint;
	width: number;
	height: number;
	slots: number;
	outlineWidth: number;
	docks?: readonly {
		key: string;
		stageId: string;
		point: RouteMapPoint;
		carrier: RouteMapRoute['carrier'];
	}[];
}
export interface RouteMapStageLabel {
	stageId: string;
	hostId: string | null;
	role: 'start' | 'end' | 'both';
	box: RouteMapBox;
	titleBox?: RouteMapBox;
	progressBox?: RouteMapBox;
}
export interface RouteMapLayout {
	stations: readonly RouteMapStation[];
	clearance: number;
	width: number;
	height: number;
	stageYs: readonly number[];
	loops: readonly { taskIds: readonly string[] }[];
	columns: readonly {
		id: string;
		index: number;
		x: number;
		width: number;
		stationIds: readonly string[];
		routingOnly: boolean;
	}[];
	lines: readonly RouteMapLine[];
	signs: readonly RouteMapSign[];
	familyReturns: readonly {
		parentId: string;
		points: readonly RouteMapPoint[];
		columnIds: readonly string[];
	}[];
	gutters: readonly { x: number; width: number; risers: readonly { key: string; x: number }[] }[];
	corridors: readonly {
		id: string;
		trackY: number;
		laneCount: number;
		intervals: readonly { key: string; start: number; end: number; lane: number }[];
	}[];
	junctions: readonly { point: RouteMapPoint; memberKeys: readonly string[] }[];
	stageLabels: readonly RouteMapStageLabel[];
	routes: readonly RouteMapRoute[];
}
const compareNodes = (a: RouteMapNode, b: RouteMapNode) =>
	compareIds(a.start ?? '\uffff', b.start ?? '\uffff') ||
	compareIds(a.createdAt, b.createdAt) ||
	compareIds(a.id, b.id);

/** Collapse cycles before assigning the longest-path dependency column. */
function dependencyOrder(
	nodes: readonly RouteMapNode[],
	pairs: readonly { from: string; to: string; weight?: number }[],
	compare: (a: RouteMapNode, b: RouteMapNode) => number = compareNodes
) {
	const ids = new Set(nodes.map((n) => n.id));
	const outgoing = new Map(nodes.map((n) => [n.id, [] as string[]]));
	for (const pair of pairs)
		if (ids.has(pair.from) && ids.has(pair.to)) outgoing.get(pair.from)!.push(pair.to);
	const reach = new Map<string, Set<string>>();
	for (const node of nodes) {
		const seen = new Set<string>(),
			stack = [node.id];
		while (stack.length) {
			const id = stack.pop()!;
			if (seen.has(id)) continue;
			seen.add(id);
			stack.push(...outgoing.get(id)!);
		}
		reach.set(node.id, seen);
	}
	const component = new Map<string, string>();
	for (const node of [...nodes].sort(compare))
		if (!component.has(node.id))
			for (const other of nodes)
				if (reach.get(node.id)!.has(other.id) && reach.get(other.id)!.has(node.id))
					component.set(other.id, node.id);
	const groups = new Map<string, RouteMapNode[]>();
	for (const node of nodes) {
		const id = component.get(node.id)!;
		groups.set(id, [...(groups.get(id) ?? []), node]);
	}
	const ranks = new Map([...groups.keys()].map((id) => [id, 0]));
	const left = new Set(groups.keys()),
		result: { node: RouteMapNode; rank: number }[] = [];
	while (left.size) {
		const ready = [...left]
			.filter(
				(id) =>
					!pairs.some(
						(p) =>
							component.get(p.to) === id &&
							component.get(p.from) !== id &&
							left.has(component.get(p.from)!)
					)
			)
			.sort((a, b) => compare(groups.get(a)!.sort(compare)[0], groups.get(b)!.sort(compare)[0]));
		const id = ready[0];
		left.delete(id);
		const rank = ranks.get(id)!;
		result.push(
			...groups
				.get(id)!
				.sort(compare)
				.map((node) => ({ node, rank }))
		);
		for (const pair of pairs)
			if (
				component.get(pair.from) === id &&
				component.get(pair.to) !== id &&
				component.has(pair.to)
			) {
				const to = component.get(pair.to)!;
				ranks.set(to, Math.max(ranks.get(to)!, rank + (pair.weight ?? 1)));
			}
	}
	return result;
}

/** Add date-priority workflow adjacency only where no real same-stage predecessor exists. */
function stageWorkflow(model: RouteMapModel) {
	const result: { key: string; from: string; to: string; kind: 'workflow' | 'family' }[] = [];
	for (const stage of model.stages)
		for (const parentId of new Set(
			model.nodes.filter((node) => node.stageId === stage.id).map((node) => node.parentId)
		)) {
			const nodes = model.nodes.filter(
				(node) => node.stageId === stage.id && node.parentId === parentId
			);
			const ids = new Set(nodes.map((node) => node.id));
			const actual = classifyRouteMapEdges(model).filter(
				(edge) => edge.carrier === 'line' && ids.has(edge.from) && ids.has(edge.to)
			);
			const order = dependencyOrder(nodes, actual, compareNodes);
			for (let index = 1; index < order.length; index++) {
				const from = order[index - 1].node.id,
					to = order[index].node.id;
				if (actual.some((edge) => edge.to === to)) continue;
				const seen = new Set<string>(),
					stack = [to];
				const global = [...model.edges.filter((edge) => !edge.cycle), ...result];
				while (stack.length) {
					const id = stack.pop()!;
					if (seen.has(id)) continue;
					seen.add(id);
					stack.push(...global.filter((edge) => edge.from === id).map((edge) => edge.to));
				}
				if (seen.has(from)) continue;
				result.push({
					key: `workflow:${from}->${to}`,
					from,
					to,
					kind: parentId ? 'family' : 'workflow'
				});
			}
		}
	return result;
}

export function routeMapLayout(model: RouteMapModel, metrics: RouteMapMetrics): RouteMapLayout {
	const paper = metrics.paper ?? false;
	const clearance = Math.max(metrics.clearance, paper ? 3 : 5);
	const lanePitch = paper ? 3 : 4;
	const hit = paper ? 8 : Math.max(24, metrics.hitSize);
	const owner = new Map(model.groups.flatMap((g) => g.taskIds.map((id) => [id, g.id] as const)));
	const roots = model.nodes.filter((node) => !node.parentId);
	const workflow = stageWorkflow(model);
	const orderingPairs = [
		...model.effectivePairs.filter(
			(pair) =>
				!model.edges.some((edge) => edge.cycle && edge.from === pair.from && edge.to === pair.to)
		),
		...workflow
	];
	const stageOrder = new Map(model.stages.map((stage, index) => [stage.id, index]));
	const compare = (a: RouteMapNode, b: RouteMapNode) =>
		stageOrder.get(a.stageId)! - stageOrder.get(b.stageId)! || compareNodes(a, b);
	const childOrders = new Map(
		roots.map((root) => {
			const children = model.nodes.filter((node) => node.parentId === root.id);
			return [root.id, dependencyOrder(children, orderingPairs, compare)] as const;
		})
	);
	const childOffset = new Map(
		[...childOrders.values()].flatMap((children) =>
			children.map(({ node, rank }) => [node.id, rank + 1] as const)
		)
	);
	const pairs = orderingPairs
		.map((pair) => ({
			from: owner.get(pair.from) ?? pair.from,
			to: owner.get(pair.to) ?? pair.to,
			weight: 1 + (childOffset.get(pair.from) ?? 0),
			workflow: 'key' in pair
		}))
		.filter(
			(pair) =>
				pair.from !== pair.to &&
				(pair.workflow ||
					!model.edges.some(
						(edge) =>
							edge.cycle &&
							(owner.get(edge.from) ?? edge.from) === pair.from &&
							(owner.get(edge.to) ?? edge.to) === pair.to
					))
		);
	const ordered = dependencyOrder(roots, pairs, compare);
	const rootRanks = new Map(ordered.map(({ node, rank }) => [node.id, rank]));
	const columnsById = new Map(ordered.map(({ node, rank }) => [node.id, rank]));
	for (const [parent, children] of childOrders)
		for (const { node, rank } of children)
			columnsById.set(node.id, rootRanks.get(parent)! + rank + 1);
	const tracks = new Map<string, number>(),
		occupied = new Map<number, Set<number>>();
	const occupy = (id: string, preferred: number) => {
		const column = columnsById.get(id)!;
		const used = occupied.get(column) ?? new Set<number>();
		let row = preferred;
		while (used.has(row)) row++;
		used.add(row);
		occupied.set(column, used);
		tracks.set(id, row);
	};
	for (const { node } of ordered) {
		const predecessors = pairs
			.filter((p) => p.to === node.id && tracks.has(p.from))
			.map((p) => tracks.get(p.from)!);
		occupy(node.id, predecessors.length ? Math.min(...predecessors) : 0);
	}
	for (const { node: parent } of ordered)
		for (const { node } of childOrders.get(parent.id)!) {
			const predecessors = model.edges
				.filter((edge) => edge.to === node.id && tracks.has(edge.from))
				.map((edge) => tracks.get(edge.from)!);
			occupy(
				node.id,
				Math.max(tracks.get(parent.id)! + 1, predecessors.length ? Math.min(...predecessors) : 0)
			);
		}
	const orderedNodes = [
		...ordered.flatMap(({ node }) => [
			node,
			...childOrders.get(node.id)!.map((child) => child.node)
		])
	];
	const familyEdges = ordered.flatMap(({ node: parent }) => {
		const first = childOrders.get(parent.id)![0]?.node;
		return first
			? [
					{
						key: `family:${parent.id}:${first.id}`,
						from: parent.id,
						to: first.id,
						kind: 'family' as const
					}
				]
			: [];
	});
	const actual = classifyRouteMapEdges(model);
	const allEdges = [...actual, ...workflow, ...familyEdges];
	const lastColumn = Math.max(0, ...columnsById.values());
	const nonstraight = allEdges.filter((edge) => {
		const from = columnsById.get(edge.from)!,
			to = columnsById.get(edge.to)!;
		return (
			from >= to ||
			tracks.get(edge.from) !== tracks.get(edge.to) ||
			orderedNodes.some(
				(node) =>
					tracks.get(node.id) === tracks.get(edge.from) &&
					columnsById.get(node.id)! > from &&
					columnsById.get(node.id)! < to
			)
		);
	});
	const boundaries = new Map<number, { out: string[]; incoming: string[]; width: number }>();
	for (let column = -1; column <= lastColumn; column++) {
		const out = nonstraight
			.filter((edge) => columnsById.get(edge.from) === column)
			.map((edge) => edge.key)
			.sort(compareIds);
		const incoming = nonstraight
			.filter((edge) => columnsById.get(edge.to)! - 1 === column)
			.map((edge) => edge.key)
			.sort(compareIds);
		boundaries.set(column, {
			out,
			incoming,
			width: Math.max(16, 2 * clearance + lanePitch * (out.length + incoming.length + 1))
		});
	}
	const columnXs = new Map<number, number>();
	let x = metrics.labelWidth / 2 + Math.max(8, boundaries.get(-1)!.width);
	for (let column = 0; column <= lastColumn; column++) {
		columnXs.set(column, x);
		x += metrics.labelWidth + boundaries.get(column)!.width;
	}
	const gutters: RouteMapLayout['gutters'][number][] = [];
	for (let column = -1; column <= lastColumn; column++) {
		const boundary = boundaries.get(column)!;
		const left = column < 0 ? 0 : columnXs.get(column)! + metrics.labelWidth / 2;
		gutters.push({
			x: left,
			width: boundary.width,
			risers: [
				...boundary.out.map((key, index) => ({
					key: `${key}:out`,
					x: left + clearance + lanePitch * (index + 0.5)
				})),
				...boundary.incoming.map((key, index) => ({
					key: `${key}:in`,
					x: left + boundary.width - clearance - lanePitch * (index + 0.5)
				}))
			]
		});
	}
	const rowCount = Math.max(0, ...tracks.values()) + 1;
	const corridors: RouteMapLayout['corridors'][number][] = [];
	const rowTop = new Map<number, number>();
	for (let row = 0; row < rowCount; row++) {
		const members = nonstraight
			.filter(
				(edge) =>
					('kind' in edge && edge.kind === 'family'
						? Math.max(tracks.get(edge.from)!, tracks.get(edge.to)!)
						: Math.min(tracks.get(edge.from)!, tracks.get(edge.to)!)) === row
			)
			.map((edge) => ({
				key: edge.key,
				start: Math.min(columnsById.get(edge.from)!, columnsById.get(edge.to)!),
				end: Math.max(columnsById.get(edge.from)!, columnsById.get(edge.to)!) + 0.5,
				lane: 0
			}))
			.sort((a, b) => a.start - b.start || a.end - b.end || compareIds(a.key, b.key));
		const lanes: (typeof members)[] = [];
		for (const member of members) {
			let lane = lanes.findIndex((items) =>
				items.every((other) => other.end <= member.start || member.end <= other.start)
			);
			if (lane < 0) {
				lane = lanes.length;
				lanes.push([]);
			}
			member.lane = lane;
			lanes[lane].push(member);
		}
		rowTop.set(row, hit / 2 + clearance + 8 + Math.max(0, lanes.length - 1) * lanePitch);
		corridors.push({ id: `row:${row}`, trackY: 0, laneCount: lanes.length, intervals: members });
	}
	const hasChildren = (id: string) =>
		model.groups.some((group) => group.id === id && group.taskIds.length > 1);
	const titleHeight = (node: RouteMapNode) =>
		(paper ? metrics.labelHeight : metrics.labelHeights?.get(node.id)) ??
		Math.min(
			metrics.labelHeight,
			Array.from(node.title).reduce((sum, char) => sum + (char.codePointAt(0)! > 255 ? 12 : 6), 0) >
				metrics.labelWidth - 24
				? 32
				: 16
		);
	const workflowLinks = [...actual.filter((edge) => edge.carrier === 'line'), ...workflow];
	const endpoint = (id: string) =>
		!workflowLinks.some((edge) => edge.to === id) ||
		!workflowLinks.some((edge) => edge.from === id);
	const belowTransfers = new Set(
		actual
			.filter(
				(edge) =>
					edge.carrier === 'walkway' &&
					!edge.cycle &&
					columnsById.get(edge.from)! < columnsById.get(edge.to)! &&
					tracks.get(edge.from)! > tracks.get(edge.to)!
			)
			.map((edge) => edge.to)
	);
	const labelOffset = (node: RouteMapNode) =>
		Math.max(
			hit / 2 + clearance,
			paper ? 15 : 21,
			belowTransfers.has(node.id) ? hit / 2 + 2 * clearance + 6 : 0
		);
	const crossStageIds = new Set(
		model.edges
			.filter(
				(edge) =>
					model.nodes.find((node) => node.id === edge.from)!.stageId !==
					model.nodes.find((node) => node.id === edge.to)!.stageId
			)
			.flatMap((edge) => [edge.from, edge.to])
	);
	const rowYs = new Map<number, number>();
	let bottom = clearance + 4;
	for (let row = 0; row < rowCount; row++) {
		const y = bottom + rowTop.get(row)!;
		rowYs.set(row, y);
		corridors[row] = { ...corridors[row], trackY: y };
		bottom =
			y +
			Math.max(
				0,
				...orderedNodes
					.filter((node) => tracks.get(node.id) === row)
					.map(
						(node) =>
							labelOffset(node) +
							titleHeight(node) +
							(!paper && hasChildren(node.id) ? 24 : 0) +
							(endpoint(node.id) || crossStageIds.has(node.id) ? 24 : 0)
					)
			) +
			12;
	}
	// A descending branch clears its source label. An ascending branch clears its target label.
	for (let column = 1; column <= lastColumn; column++) {
		let next = columnXs.get(column)!;
		for (const edge of [
			...actual.filter((edge) => edge.carrier === 'line'),
			...workflow,
			...familyEdges
		].filter(
			(edge) => columnsById.get(edge.to) === column && columnsById.get(edge.from)! < column
		)) {
			const from = columnsById.get(edge.from)!;
			const rise = Math.abs(rowYs.get(tracks.get(edge.to)!)! - rowYs.get(tracks.get(edge.from)!)!);
			if (rise)
				next = Math.max(next, columnXs.get(from)! + rise + metrics.labelWidth / 2 + clearance + 32);
		}
		const shift = next - columnXs.get(column)!;
		if (shift)
			for (let later = column; later <= lastColumn; later++)
				columnXs.set(later, columnXs.get(later)! + shift);
	}
	x = columnXs.get(lastColumn)! + metrics.labelWidth + boundaries.get(lastColumn)!.width;
	for (let column = -1; column <= lastColumn; column++) {
		const gutter = gutters[column + 1];
		const nextLeft = column < 0 ? 0 : columnXs.get(column)! + metrics.labelWidth / 2;
		const delta = nextLeft - gutter.x;
		gutters[column + 1] = {
			...gutter,
			x: nextLeft,
			risers: gutter.risers.map((riser) => ({ ...riser, x: riser.x + delta }))
		};
	}
	const stations: RouteMapStation[] = orderedNodes.map((node) => {
		const column = columnsById.get(node.id)!,
			track = tracks.get(node.id)!,
			center = { x: columnXs.get(column)!, y: rowYs.get(track)! };
		const hitBox = { x: center.x - hit / 2, y: center.y - hit / 2, w: hit, h: hit };
		const labelBox = {
			x: center.x - metrics.labelWidth / 2,
			y: center.y + labelOffset(node),
			w: metrics.labelWidth,
			h: titleHeight(node) + (!paper && hasChildren(node.id) ? 24 : 0)
		};
		return {
			id: node.id,
			columnId: `column:${column}`,
			column,
			rank: column,
			track,
			center,
			hitBox,
			labelBox,
			focusBox: { x: hitBox.x - 4, y: hitBox.y - 4, w: hit + 8, h: hit + 8 },
			controlBoxes:
				!paper && hasChildren(node.id)
					? [{ x: center.x - 20, y: labelBox.y + titleHeight(node), w: 40, h: 24 }]
					: [],
			inPort: center,
			outPort: center
		};
	});
	const columns = [...columnXs].map(([index, x]) => ({
		id: `column:${index}`,
		index,
		x,
		width: columnXs.has(index + 1)
			? columnXs.get(index + 1)! - x
			: metrics.labelWidth + boundaries.get(index)!.width,
		stationIds: stations.filter((s) => s.column === index).map((s) => s.id),
		routingOnly: !stations.some((s) => s.column === index)
	}));
	const layout: RouteMapLayout = {
		stations,
		clearance,
		width: x - metrics.labelWidth / 2,
		height: bottom,
		stageYs: [],
		loops: [],
		columns,
		lines: [],
		signs: [],
		familyReturns: [],
		gutters,
		corridors,
		junctions: [],
		stageLabels: [],
		routes: []
	};
	layout.routes = buildRouteMapRoutes(model, layout, { paper, pitch: lanePitch }).routes;
	layout.lines = [
		...layout.routes
			.filter((route) => route.carrier === 'line')
			.map((route) => ({
				key: route.key,
				stageId: model.nodes.find((node) => node.id === route.to)!.stageId,
				taskIds: [route.from, route.to],
				dependencyKeys: [route.key],
				points: route.points,
				width: model.nodes.find((node) => node.id === route.to)!.parentId
					? paper
						? 3.5
						: 6
					: paper
						? 5
						: 8,
				kind: 'dependency' as const
			})),
		...[...workflow, ...familyEdges].map((edge) => ({
			key: edge.key,
			stageId: model.nodes.find((node) => node.id === edge.to)!.stageId,
			taskIds: [edge.from, edge.to],
			dependencyKeys: [],
			points: buildRouteMapRoutes(model, layout, { paper, pitch: lanePitch }, [edge]).routes[0]
				.points,
			width: model.nodes.find((node) => node.id === edge.to)!.parentId
				? paper
					? 3.5
					: 6
				: paper
					? 5
					: 8,
			kind: edge.kind
		}))
	];
	layout.signs = stations.flatMap((station) => {
		const node = model.nodes.find((node) => node.id === station.id)!;
		const cross = model.edges.some(
			(edge) =>
				(edge.from === station.id || edge.to === station.id) &&
				model.nodes.find((n) => n.id === (edge.from === station.id ? edge.to : edge.from))!
					.stageId !== node.stageId
		);
		const terminus = endpoint(station.id);
		if (!cross && !terminus) return [];
		return [
			{
				kind: cross ? ('interchange' as const) : ('terminus' as const),
				stationId: station.id,
				stageId: node.stageId,
				center: station.center,
				width: paper
					? cross
						? node.parentId
							? 7.5
							: 10
						: 12
					: cross
						? node.parentId
							? 12
							: 16
						: 20,
				height: paper
					? cross
						? node.parentId
							? 15
							: 20
						: 12
					: cross
						? node.parentId
							? 24
							: 32
						: 20,
				slots: 1,
				outlineWidth: paper ? 2 : 3
			}
		];
	});
	layout.stageLabels = stations
		.filter(
			(station) =>
				endpoint(station.id) ||
				layout.signs.some((sign) => sign.stationId === station.id && sign.kind === 'interchange')
		)
		.map((station) => ({
			stageId: model.nodes.find((node) => node.id === station.id)!.stageId,
			hostId: station.id,
			role: 'start' as const,
			box: {
				x: station.labelBox.x,
				y: station.labelBox.y + station.labelBox.h + 4,
				w: station.labelBox.w,
				h: 20
			}
		}));
	// Keep the canvas at the rendered content and focus bounds, without an unused end gutter.
	layout.width = Math.max(
		1,
		...stations.flatMap((station) => [
			station.labelBox.x + station.labelBox.w + 4,
			station.focusBox.x + station.focusBox.w,
			...station.controlBoxes.map((box) => box.x + box.w + 4)
		]),
		...layout.signs.map((sign) => sign.center.x + sign.width / 2),
		...layout.stageLabels.map((label) => label.box.x + label.box.w),
		...[...layout.routes, ...layout.lines].flatMap((line) =>
			line.points.map((point) => point.x + 4)
		)
	);
	return layout;
}
