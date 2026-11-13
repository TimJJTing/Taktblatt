const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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
	hitSize: number;
	labelWidth: number;
	labelHeight: number;
	columnGap: number;
	stageGap: number;
	laneGap: number;
	clearance: number;
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
	routing: ReadonlyMap<string, { fromX: number; toX: number; channelY: number }>;
	width: number;
	height: number;
	terminusLeft: number;
	stageYs: readonly number[];
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
	const compare = (a: RouteMapNode, b: RouteMapNode) =>
		(a.start ?? '\uffff').localeCompare(b.start ?? '\uffff') ||
		compareIds(a.createdAt, b.createdAt) ||
		compareIds(a.id, b.id);
	const groups = new Map<string, RouteMapNode[]>();
	for (const node of nodes) {
		const key = component.get(node.id)!;
		groups.set(key, [...(groups.get(key) ?? []), node]);
	}
	return [...groups.entries()]
		.map(([id, members]) => ({
			id,
			members: members.sort(compare),
			key: [...members].sort(compare)[0],
			rank: ranks.get(id)!
		}))
		.sort((a, b) => a.rank - b.rank || compare(a.key, b.key) || compareIds(a.id, b.id))
		.flatMap(({ members, rank }) => members.map((node) => ({ node, rank })));
}

export function routeMapLayout(model: RouteMapModel, metrics: RouteMapMetrics): RouteMapLayout {
	const parent = new Map(model.groups.flatMap((g) => g.taskIds.map((id) => [id, g.id] as const)));
	const roots = model.nodes.filter((n) => n.parentId === null);
	const groupPairs = model.effectivePairs.map((p) => ({
		from: parent.get(p.from) ?? p.from,
		to: parent.get(p.to) ?? p.to
	}));
	const ordered = order(roots, groupPairs);
	const entries = ordered.flatMap((entry) => [
		entry,
		...order(
			model.nodes.filter((n) => n.parentId === entry.node.id),
			model.effectivePairs
		)
	]);
	const index = new Map(entries.map((entry, i) => [entry.node.id, i]));
	const stageIndex = new Map(model.stages.map((stage, i) => [stage.id, i]));
	const gutters: string[][] = Array.from({ length: entries.length + 1 }, () => []);
	const channels: string[][] = Array.from({ length: model.stages.length + 1 }, () => []);
	const routingIndices = new Map<string, { from: number; to: number; channel: number }>();
	for (const edge of [...model.edges].sort((a, b) => compareIds(a.key, b.key))) {
		const from = index.get(edge.from);
		const to = index.get(edge.to);
		if (from === undefined || to === undefined) continue;
		const fromStage = stageIndex.get(entries[from].node.stageId) ?? 0;
		const toStage = stageIndex.get(entries[to].node.stageId) ?? 0;
		const straight =
			from < to &&
			fromStage === toStage &&
			Boolean(entries[from].node.parentId) === Boolean(entries[to].node.parentId) &&
			!entries
				.slice(from + 1, to)
				.some((entry) => entry.node.stageId === entries[from].node.stageId);
		if (straight) continue;
		const fromGutter = from + 1;
		const toGutter = to;
		const channel = from < to ? toStage : fromStage + 1;
		gutters[fromGutter].push(edge.key + ':out');
		gutters[toGutter].push(edge.key + ':in');
		channels[channel].push(edge.key);
		routingIndices.set(edge.key, { from: fromGutter, to: toGutter, channel });
	}
	const pitch = 6;
	const gapSize = (count: number, minimum: number) =>
		Math.max(minimum, count * pitch + 2 * metrics.clearance);
	const hit = Math.max(24, metrics.hitSize);
	const cellWidth = Math.max(metrics.labelWidth, hit) + 2 * metrics.clearance;
	const gutterStarts: number[] = [];
	const centers: number[] = [];
	let x = 0;
	for (let i = 0; i <= entries.length; i++) {
		gutterStarts.push(x);
		x += gapSize(gutters[i].length, metrics.columnGap);
		if (i < entries.length) {
			centers.push(x + cellWidth / 2);
			x += cellWidth;
		}
	}
	const channelStarts: number[] = [];
	const stageYs: number[] = [];
	const branchOffset = hit + metrics.labelHeight + 2 * metrics.clearance + metrics.laneGap;
	const hasBranches = model.nodes.some((node) => node.parentId !== null);
	const bandHeight =
		hit + metrics.labelHeight + 2 * metrics.clearance + 24 + (hasBranches ? branchOffset : 0);
	let y = 0;
	for (let i = 0; i <= model.stages.length; i++) {
		channelStarts.push(y);
		y += gapSize(channels[i].length, Math.max(metrics.laneGap, metrics.stageGap - bandHeight));
		if (i < model.stages.length) {
			stageYs.push(y + metrics.clearance + 24 + hit / 2);
			y += bandHeight;
		}
	}
	const stations: RouteMapStation[] = entries.map((entry, i) => {
		const centerX = centers[i];
		const centerY =
			(stageYs[stageIndex.get(entry.node.stageId) ?? 0] ?? metrics.clearance + hit / 2) +
			(entry.node.parentId ? branchOffset : 0);
		return {
			id: entry.node.id,
			columnId: entry.node.id,
			rank: entry.rank,
			hitBox: { x: centerX - hit / 2, y: centerY - hit / 2, w: hit, h: hit },
			labelBox: {
				x: centerX - metrics.labelWidth / 2,
				y: centerY + hit / 2,
				w: metrics.labelWidth,
				h: metrics.labelHeight
			},
			inPort: { x: centerX - hit / 2, y: centerY },
			outPort: { x: centerX + hit / 2, y: centerY }
		};
	});
	const routing = new Map<string, { fromX: number; toX: number; channelY: number }>();
	for (const [key, track] of routingIndices) {
		routing.set(key, {
			fromX:
				gutterStarts[track.from] +
				metrics.clearance +
				(gutters[track.from].indexOf(key + ':out') + 0.5) * pitch,
			toX:
				gutterStarts[track.to] +
				metrics.clearance +
				(gutters[track.to].indexOf(key + ':in') + 0.5) * pitch,
			channelY:
				channelStarts[track.channel] +
				metrics.clearance +
				(channels[track.channel].indexOf(key) + 0.5) * pitch
		});
	}
	return {
		stations,
		clearance: metrics.clearance,
		routing,
		width: x,
		height: y,
		terminusLeft: Math.max(x, 100) + 24,
		stageYs,

		loops: model.groups
			.map((g) => ({
				taskIds: entries
					.filter((entry) => g.taskIds.includes(entry.node.id))
					.map((entry) => entry.node.id)
			}))
			.filter((g) => g.taskIds.length > 1)
	};
}
