import type { routeFocusModel } from '#lib/domain/route.ts';
import type { EdgeRef } from './types.ts';
export interface KanbanRect {
	x: number;
	y: number;
	w: number;
	h: number;
}
export interface KanbanPoint {
	x: number;
	y: number;
}
export interface KanbanCardGeometry {
	box: KanbanRect;
	station: KanbanPoint;
}
export interface KanbanPath extends EdgeRef {
	points: KanbanPoint[];
}
function intersects(a: KanbanRect, b: KanbanRect) {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function route(start: KanbanPoint, end: KanbanPoint, boxes: KanbanRect[]): KanbanPoint[] {
	const xs = [
		...new Set([start.x, end.x, ...boxes.flatMap((b) => [b.x - 2, b.x, b.x + b.w, b.x + b.w + 2])])
	].sort((a, b) => a - b);
	const ys = [
		...new Set([start.y, end.y, ...boxes.flatMap((b) => [b.y - 2, b.y, b.y + b.h, b.y + b.h + 2])])
	].sort((a, b) => a - b);
	const clear = (a: KanbanPoint, b: KanbanPoint) =>
		boxes.every((box) =>
			a.x === b.x
				? !(
						a.x > box.x &&
						a.x < box.x + box.w &&
						Math.max(a.y, b.y) > box.y &&
						Math.min(a.y, b.y) < box.y + box.h
					)
				: !(
						a.y > box.y &&
						a.y < box.y + box.h &&
						Math.max(a.x, b.x) > box.x &&
						Math.min(a.x, b.x) < box.x + box.w
					)
		);
	const key = (x: number, y: number) => `${x},${y}`;
	const origin = key(xs.indexOf(start.x), ys.indexOf(start.y));
	const target = key(xs.indexOf(end.x), ys.indexOf(end.y));
	const queue = [origin];
	const previous = new Map<string, string | null>([[origin, null]]);
	for (let i = 0; i < queue.length && !previous.has(target); i++) {
		const current = queue[i];
		const [x, y] = current.split(',').map(Number);
		for (const [nx, ny] of [
			[x - 1, y],
			[x + 1, y],
			[x, y - 1],
			[x, y + 1]
		]) {
			if (nx < 0 || ny < 0 || nx >= xs.length || ny >= ys.length) continue;
			const next = key(nx, ny);
			if (previous.has(next) || !clear({ x: xs[x], y: ys[y] }, { x: xs[nx], y: ys[ny] })) continue;
			previous.set(next, current);
			queue.push(next);
		}
	}
	if (!previous.has(target)) return [];
	const points: KanbanPoint[] = [];
	let current: string | null = target;
	while (current !== null) {
		const [x, y] = current.split(',').map(Number);
		points.push({ x: xs[x], y: ys[y] });
		current = previous.get(current) ?? null;
	}
	return points.reverse();
}
export function kanbanScene(input: {
	edges: readonly EdgeRef[];
	route: ReturnType<typeof routeFocusModel>;
	cards: ReadonlyMap<string, KanbanCardGeometry>;
	viewport: KanbanRect;
}): { paths: KanbanPath[]; litCardIds: Set<string>; dimmedCardIds: Set<string> } {
	const litCardIds = new Set(
		[...input.cards.keys()].filter((id) => input.route.onRouteRowIds.has(id))
	);
	const dimmedCardIds = new Set(
		[...input.cards.keys()].filter((id) => input.route.active && !litCardIds.has(id))
	);
	const paths: KanbanPath[] = [];
	if (input.route.active)
		for (const edge of input.edges) {
			if (!input.route.litLineKeys.has(edge.key)) continue;
			const a = input.cards.get(edge.from),
				b = input.cards.get(edge.to);
			if (!a || !b || !intersects(a.box, input.viewport) || !intersects(b.box, input.viewport))
				continue;
			const boxes = [...input.cards.values()]
				.map((c) => c.box)
				.filter((box) => intersects(box, input.viewport));
			const start = { x: a.box.x, y: a.station.y };
			const end = { x: b.box.x, y: b.station.y };
			const middle = route(start, end, boxes);
			const points = middle.length ? [a.station, ...middle, b.station] : [];
			if (points.length) paths.push({ ...edge, points });
		}
	return { paths, litCardIds, dimmedCardIds };
}
