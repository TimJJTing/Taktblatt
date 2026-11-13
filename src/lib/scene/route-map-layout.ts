import type { RouteMapModel, RouteMapNode } from '#lib/domain/route-map.ts';

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
	stationSize: number;
	hitSize: number;
	labelWidth: number;
	labelHeight: number;
	columnGap: number;
	stageGap: number;
	laneGap: number;
	clearance: number;
	measureText: (text: string) => number;
}
export interface RouteMapStation {
	id: string;
	columnId: string;
	rank: number;
	hitBox: RouteMapBox;
	labelBox: RouteMapBox;
	inPort: RouteMapPoint;
	outPort: RouteMapPoint;
}
export interface RouteMapLayout {
	stations: readonly RouteMapStation[];
	clearance: number;
	guides: readonly { stageId: string }[];
	loops: readonly { taskIds: readonly string[] }[];
}

function order(
	nodes: readonly RouteMapNode[],
	pairs: readonly { from: string; to: string }[]
): { node: RouteMapNode; rank: number }[] {
	const ids = new Set(nodes.map((n) => n.id));
	const adjacency = new Map(nodes.map((n) => [n.id, [] as string[]]));
	for (const p of pairs)
		if (ids.has(p.from) && ids.has(p.to) && p.from !== p.to) adjacency.get(p.from)!.push(p.to);
	const reachable = new Map<string, Set<string>>();
	for (const id of ids) {
		const seen = new Set<string>(),
			stack = [id];
		while (stack.length) {
			const current = stack.pop()!;
			if (seen.has(current)) continue;
			seen.add(current);
			stack.push(...adjacency.get(current)!);
		}
		reachable.set(id, seen);
	}
	const component = new Map<string, string>();
	for (const id of [...ids].sort())
		if (!component.has(id))
			for (const other of ids)
				if (reachable.get(id)!.has(other) && reachable.get(other)!.has(id))
					component.set(other, id);
	const ranks = new Map([...component.values()].map((id) => [id, 0]));
	for (let i = 0; i < ranks.size; i++)
		for (const p of pairs) {
			const from = component.get(p.from),
				to = component.get(p.to);
			if (from && to && from !== to) ranks.set(to, Math.max(ranks.get(to)!, ranks.get(from)! + 1));
		}
	return nodes
		.map((node) => ({ node, rank: ranks.get(component.get(node.id)!)! }))
		.sort(
			(a, b) =>
				a.rank - b.rank ||
				(a.node.start ?? '\uffff').localeCompare(b.node.start ?? '\uffff') ||
				a.node.createdAt.localeCompare(b.node.createdAt) ||
				a.node.id.localeCompare(b.node.id)
		);
}

export function routeMapLayout(model: RouteMapModel, metrics: RouteMapMetrics): RouteMapLayout {
	const parent = new Map(model.groups.flatMap((g) => g.taskIds.map((id) => [id, g.id] as const)));
	const roots = model.nodes.filter((n) => n.parentId === null);
	const groupPairs = model.effectivePairs.map((p) => ({
		from: parent.get(p.from) ?? p.from,
		to: parent.get(p.to) ?? p.to
	}));
	const ordered = order(roots, groupPairs);
	const stations: RouteMapStation[] = [];
	const cellWidth =
		Math.max(metrics.labelWidth, metrics.hitSize, 24) + metrics.columnGap + 2 * metrics.clearance;
	const hit = Math.max(24, metrics.hitSize);
	let column = 0;
	const stageIndex = new Map(model.stages.map((s, i) => [s.id, i]));
	const stageHeight = Math.max(
		metrics.stageGap,
		metrics.labelHeight + hit + metrics.laneGap + 2 * metrics.clearance
	);
	for (const entry of ordered) {
		const children = order(
			model.nodes.filter((n) => n.parentId === entry.node.id),
			model.effectivePairs
		);
		for (const [i, item] of [entry, ...children].entries()) {
			const x = metrics.clearance + column * cellWidth + metrics.labelWidth / 2;
			const y =
				metrics.clearance +
				model.edges.length +
				1 +
				(stageIndex.get(item.node.stageId) ?? 0) * stageHeight +
				(i ? metrics.laneGap : 0) +
				hit / 2;
			const hitBox = { x: x - hit / 2, y: y - hit / 2, w: hit, h: hit };
			stations.push({
				id: item.node.id,
				columnId: item.node.id,
				rank: item.rank,
				hitBox,
				labelBox: {
					x: x - metrics.labelWidth / 2,
					y: y + hit / 2,
					w: metrics.labelWidth,
					h: metrics.labelHeight
				},
				inPort: { x: x - hit / 2, y },
				outPort: { x: x + hit / 2, y }
			});
			column++;
		}
	}
	return {
		stations,
		clearance: metrics.clearance,
		guides: model.stages.map((s) => ({ stageId: s.id })),
		loops: model.groups
			.map((g) => ({ taskIds: g.taskIds.filter((id) => stations.some((s) => s.id === id)) }))
			.filter((g) => g.taskIds.length > 1)
	};
}
