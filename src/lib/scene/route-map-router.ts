import type { RouteMapEdge, RouteMapModel } from '#lib/domain/route-map.ts';
import type { RouteMapLayout, RouteMapPoint } from './route-map-layout.ts';

export interface RouteMapRoute extends RouteMapEdge {
	points: readonly RouteMapPoint[];
	carrier: 'line' | 'lead-in' | 'walkway';
	dock?: { hostId: string; side: 'above' | 'below'; point: RouteMapPoint };
	corridorId?: string;
	lane?: number;
	trunkId?: string;
}

/** A carrier describes a real dependency. Family strokes are separate scene lines. */
export function classifyRouteMapEdges(model: RouteMapModel): Omit<RouteMapRoute, 'points'>[] {
	const nodes = new Map(model.nodes.map((node) => [node.id, node]));
	return model.edges.map((edge) => {
		const source = nodes.get(edge.from)!,
			target = nodes.get(edge.to)!;
		const proxy = edge.stored.some(
			(stored) => stored.taskId !== edge.to || stored.dependencyId !== edge.from
		);
		const externalChild =
			source.parentId !== target.parentId && (source.parentId || target.parentId);
		return {
			...edge,
			carrier:
				!edge.cycle && !proxy && !externalChild && source.stageId === target.stageId
					? ('line' as const)
					: ('walkway' as const)
		};
	});
}

/** Trim orthogonal corners into 45-degree ramps without moving either endpoint. */
export function chamferRouteMapPath(
	points: readonly RouteMapPoint[],
	size: number
): RouteMapPoint[] {
	const path = points.filter(
		(point, index) => !index || point.x !== points[index - 1].x || point.y !== points[index - 1].y
	);
	if (path.length < 3) return [...path];
	const result: RouteMapPoint[] = [path[0]];
	for (let index = 1; index < path.length - 1; index++) {
		const a = path[index - 1],
			b = path[index],
			c = path[index + 1];
		const dx = b.x - a.x,
			dy = b.y - a.y,
			ex = c.x - b.x,
			ey = c.y - b.y;
		const orthogonal = (dx === 0 || dy === 0) && (ex === 0 || ey === 0) && dx * ex + dy * ey === 0;
		if (!orthogonal) {
			result.push(b);
			continue;
		}
		const incoming = Math.hypot(dx, dy),
			outgoing = Math.hypot(ex, ey);
		const distance = Math.min(size, incoming / 2, outgoing / 2);
		result.push(
			{ x: b.x - (dx / incoming) * distance, y: b.y - (dy / incoming) * distance },
			{ x: b.x + (ex / outgoing) * distance, y: b.y + (ey / outgoing) * distance }
		);
	}
	result.push(path.at(-1)!);
	return result.filter(
		(point, index) => !index || point.x !== result[index - 1].x || point.y !== result[index - 1].y
	);
}

function segmentHits(
	a: RouteMapPoint,
	b: RouteMapPoint,
	box: { x: number; y: number; w: number; h: number }
) {
	let low = 0,
		high = 1;
	for (const [position, delta, min, max] of [
		[a.x, b.x - a.x, box.x, box.x + box.w],
		[a.y, b.y - a.y, box.y, box.y + box.h]
	]) {
		if (!delta) {
			if (position < min || position > max) return false;
			continue;
		}
		const left = (min - position) / delta,
			right = (max - position) / delta;
		low = Math.max(low, Math.min(left, right));
		high = Math.min(high, Math.max(left, right));
		if (low > high) return false;
	}
	return true;
}

function pathClear(
	points: readonly RouteMapPoint[],
	layout: RouteMapLayout,
	from: string,
	to: string
) {
	return layout.stations.every((station) =>
		[station.hitBox, station.focusBox, station.labelBox, ...station.controlBoxes].every((box) => {
			const c = layout.clearance;
			return points.slice(1).every((b, index) => {
				if (
					(box === station.hitBox || box === station.focusBox) &&
					((station.id === from && index === 0) ||
						(station.id === to && index === points.length - 2))
				)
					return true;
				return !segmentHits(points[index], b, {
					x: box.x - c,
					y: box.y - c,
					w: box.w + 2 * c,
					h: box.h + 2 * c
				});
			});
		})
	);
}

/** Round bends while keeping the settled route points as the geometry contract. */
export function routeMapPath(points: readonly RouteMapPoint[], radius = 6): string {
	if (!points.length) return '';
	let result = `M ${points[0].x} ${points[0].y}`;
	for (let i = 1; i < points.length - 1; i++) {
		const a = points[i - 1],
			b = points[i],
			c = points[i + 1];
		const incoming = Math.hypot(b.x - a.x, b.y - a.y),
			outgoing = Math.hypot(c.x - b.x, c.y - b.y);
		if (!incoming || !outgoing) continue;
		const r = Math.min(radius, incoming / 3, outgoing / 3);
		result += ` L ${b.x + ((a.x - b.x) * r) / incoming} ${b.y + ((a.y - b.y) * r) / incoming} Q ${b.x} ${b.y} ${b.x + ((c.x - b.x) * r) / outgoing} ${b.y + ((c.y - b.y) * r) / outgoing}`;
	}
	const end = points.at(-1)!;
	return `${result} L ${end.x} ${end.y}`;
}

/** Route in reserved gutters and row corridors, independent of stage membership. */
export function buildRouteMapRoutes(
	model: RouteMapModel,
	layout: RouteMapLayout,
	metrics: { paper: boolean; pitch: number },
	family?: readonly { key: string; from: string; to: string }[]
): Pick<RouteMapLayout, 'routes' | 'corridors' | 'gutters' | 'junctions'> {
	const stations = new Map(layout.stations.map((station) => [station.id, station]));
	const edges = family
		? family.map((edge) => ({ ...edge, cycle: false, stored: [], carrier: 'line' as const }))
		: classifyRouteMapEdges(model);
	const routes = edges.map((edge): RouteMapRoute => {
		const source = stations.get(edge.from)!,
			target = stations.get(edge.to)!;
		const direct =
			source.column < target.column &&
			source.track === target.track &&
			!layout.stations.some(
				(station) =>
					station.track === source.track &&
					station.column > source.column &&
					station.column < target.column
			);
		if (direct) return { ...edge, points: [source.center, target.center] };
		const rise = target.center.y - source.center.y;
		if (source.column < target.column && rise) {
			const run =
				rise > 0
					? source.labelBox.w / 2 + layout.clearance + 3
					: source.focusBox.w / 2 + layout.clearance + 1;
			const endRun =
				rise < 0
					? target.labelBox.w / 2 + layout.clearance + 3
					: target.focusBox.w / 2 + layout.clearance + 1;
			if (target.center.x - source.center.x >= run + Math.abs(rise) + endRun) {
				const candidate = [
					source.center,
					{ x: source.center.x + run, y: source.center.y },
					{ x: source.center.x + run + Math.abs(rise), y: target.center.y },
					target.center
				];
				if (pathClear(candidate, layout, edge.from, edge.to)) return { ...edge, points: candidate };
			}
		}
		const corridor = layout.corridors.find((entry) =>
			entry.intervals.some((interval) => interval.key === edge.key)
		)!;
		const lane = corridor.intervals.find((interval) => interval.key === edge.key)!.lane;
		const sx = layout.gutters
			.flatMap((gutter) => gutter.risers)
			.find((riser) => riser.key === `${edge.key}:out`)!.x;
		const tx = layout.gutters
			.flatMap((gutter) => gutter.risers)
			.find((riser) => riser.key === `${edge.key}:in`)!.x;
		if (edge.carrier === 'walkway' && !edge.cycle && source.column < target.column && rise) {
			const direction = Math.sign(rise);
			const depth = Math.max(target.focusBox.w, target.focusBox.h) / 2 + layout.clearance + 1;
			const entry = { x: target.center.x - depth, y: target.center.y - direction * depth };
			if (sx < entry.x && Math.abs(rise) >= depth) {
				const transfer = chamferRouteMapPath(
					[
						source.center,
						{ x: sx, y: source.center.y },
						{ x: sx, y: entry.y },
						entry,
						target.center
					],
					metrics.paper ? 5 : 8
				);
				if (pathClear(transfer, layout, edge.from, edge.to))
					return { ...edge, corridorId: corridor.id, lane, points: transfer };
			}
		}
		const top =
			corridor.trackY -
			Math.max(20, source.hitBox.h / 2 + layout.clearance + 8) -
			lane * metrics.pitch;
		return {
			...edge,
			corridorId: corridor.id,
			lane,
			points: chamferRouteMapPath(
				[
					source.center,
					{ x: sx, y: source.center.y },
					{ x: sx, y: top },
					{ x: tx, y: top },
					{ x: tx, y: target.center.y },
					target.center
				],
				metrics.paper ? 5 : 8
			)
		};
	});
	return { routes, corridors: layout.corridors, gutters: layout.gutters, junctions: [] };
}

export function routeMapRoutes(
	_model: RouteMapModel,
	layout: RouteMapLayout
): readonly RouteMapRoute[] {
	return layout.routes;
}
