import type { RouteMapEdge, RouteMapModel } from '#lib/domain/route-map.ts';
import type { RouteMapLayout, RouteMapPoint } from './route-map-layout.ts';

export const routeMapSizes = {
	screen: {
		station: 8,
		rail: 8,
		branch: 6,
		branchGap: 2,
		path: 2,
		chevron: 5,
		capsule: { width: 16, height: 32, outline: 3 }
	},
	paper: {
		station: 6,
		rail: 5,
		branch: 3.5,
		branchGap: 1.5,
		path: 1,
		chevron: 3,
		capsule: { width: 10, height: 20, outline: 2 }
	}
} as const;

export interface RouteMapRoute extends RouteMapEdge {
	points: readonly RouteMapPoint[];
	chevron?: readonly RouteMapPoint[];
	carrier: 'line' | 'walkway';
	corridorId?: string;
	lane?: number;
}

/** A carrier describes a real dependency. Family strokes are separate scene lines. */
export function classifyRouteMapEdges(model: RouteMapModel): Omit<RouteMapRoute, 'points'>[] {
	return model.edges.map((edge) => ({
		...edge,
		carrier: edge.cycle || edge.crossStage ? 'walkway' : 'line'
	}));
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
	return (
		layout.stageLabels.every((label) =>
			points.slice(1).every(
				(b, index) =>
					!segmentHits(points[index], b, {
						x: label.box.x - layout.clearance,
						y: label.box.y - layout.clearance,
						w: label.box.w + 2 * layout.clearance,
						h: label.box.h + 2 * layout.clearance
					})
			)
		) &&
		layout.stations.every((station) =>
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
		)
	);
}

/** Index fixed reservations once. Straight paths query only their row or column. */
function createPathClearance(layout: RouteMapLayout, clearance: number) {
	const bucketSize = 64;
	const boxes = [
		...layout.stageLabels.map((label) => ({ ...label.box, owner: '', port: false })),
		...layout.stations.flatMap((station) => [
			{ ...station.hitBox, owner: station.id, port: true },
			{ ...station.focusBox, owner: station.id, port: true },
			{ ...station.labelBox, owner: station.id, port: false },
			...station.controlBoxes.map((box) => ({ ...box, owner: station.id, port: false }))
		])
	].map((box) => ({
		...box,
		x: box.x - clearance,
		y: box.y - clearance,
		w: box.w + 2 * clearance,
		h: box.h + 2 * clearance
	}));
	const byX = new Map<number, number[]>(),
		byY = new Map<number, number[]>();
	for (const [index, box] of boxes.entries()) {
		for (const [buckets, start, end] of [
			[byX, box.x, box.x + box.w],
			[byY, box.y, box.y + box.h]
		] as const) {
			for (let key = Math.floor(start / bucketSize); key <= Math.floor(end / bucketSize); key++) {
				const entries = buckets.get(key) ?? [];
				entries.push(index);
				buckets.set(key, entries);
			}
		}
	}
	return (points: readonly RouteMapPoint[], from: string, to: string) => {
		for (let index = 1; index < points.length; index++) {
			const a = points[index - 1],
				b = points[index];
			const horizontal = a.y === b.y;
			const start = horizontal ? a.y : Math.min(a.x, b.x);
			const end = horizontal ? a.y : Math.max(a.x, b.x);
			const buckets = horizontal ? byY : byX;
			const seen = a.x !== b.x && a.y !== b.y ? new Set<number>() : undefined;
			const minX = Math.min(a.x, b.x),
				maxX = Math.max(a.x, b.x);
			const minY = Math.min(a.y, b.y),
				maxY = Math.max(a.y, b.y);
			for (let key = Math.floor(start / bucketSize); key <= Math.floor(end / bucketSize); key++) {
				for (const id of buckets.get(key) ?? []) {
					if (seen?.has(id)) continue;
					seen?.add(id);
					const box = boxes[id];
					if (
						box.port &&
						((box.owner === from && index === 1) ||
							(box.owner === to && index === points.length - 1))
					)
						continue;
					if (box.x > maxX || box.x + box.w < minX || box.y > maxY || box.y + box.h < minY)
						continue;
					if (segmentHits(a, b, box)) return false;
				}
			}
		}
		return true;
	};
}

/** The center ports remain stable. The visible path stops at its open destination sign. */
export function routeMapChevron(points: readonly RouteMapPoint[], paper: boolean): RouteMapPoint[] {
	const sizes = routeMapSizes[paper ? 'paper' : 'screen'];
	const target = points.at(-1)!,
		previous = points.at(-2)!;
	const dx = target.x - previous.x,
		dy = target.y - previous.y;
	const length = Math.hypot(dx, dy);
	if (!length) return [];
	const ux = dx / length,
		uy = dy / length;
	// Clear the capsule rectangle, station target and focus outline with the whole sign.
	const halfWidth = paper ? Math.max(sizes.capsule.width / 2 + 4, 9) : 24;
	const halfHeight = paper ? Math.max(sizes.capsule.height / 2 + 4, 9) : 24;
	const distance = Math.min(
		ux ? halfWidth / Math.abs(ux) : Infinity,
		uy ? halfHeight / Math.abs(uy) : Infinity
	);
	const tip = { x: target.x - ux * distance, y: target.y - uy * distance };
	const arm = sizes.chevron / Math.SQRT2;
	return [
		{ x: tip.x - ux * arm - uy * arm, y: tip.y - uy * arm + ux * arm },
		tip,
		{ x: tip.x - ux * arm + uy * arm, y: tip.y - uy * arm - ux * arm }
	];
}

/** Remove grid subdivisions without changing the path or its endpoint directions. */
function simplifyPath(points: readonly RouteMapPoint[]): RouteMapPoint[] {
	const result: RouteMapPoint[] = [];
	for (const point of points) {
		if (result.at(-1)?.x === point.x && result.at(-1)?.y === point.y) continue;
		while (result.length > 1) {
			const a = result.at(-2)!,
				b = result.at(-1)!;
			const dx = b.x - a.x,
				dy = b.y - a.y;
			const ex = point.x - b.x,
				ey = point.y - b.y;
			if (Math.abs(dx * ey - dy * ex) > 1e-6 || dx * ex + dy * ey <= 0) break;
			result.pop();
		}
		result.push(point);
	}
	return result;
}

/** Merge subdivisions and reversals before reserving a continuous straight run. */
function pathRuns(points: readonly RouteMapPoint[]): [RouteMapPoint, RouteMapPoint][] {
	const runs: [RouteMapPoint, RouteMapPoint][] = [];
	for (let index = 1; index < points.length; index++) {
		const a = points[index - 1],
			b = points[index];
		const dx = b.x - a.x,
			dy = b.y - a.y;
		const length = Math.hypot(dx, dy);
		if (!length) continue;
		const last = runs.at(-1);
		if (last) {
			const ex = last[1].x - last[0].x,
				ey = last[1].y - last[0].y;
			const existing = Math.hypot(ex, ey);
			if (
				Math.abs(dx * ey - dy * ex) <= 1e-6 * length * existing &&
				Math.abs(ex * (a.y - last[0].y) - ey * (a.x - last[0].x)) <= 1e-6 * existing
			) {
				const origin = last[0];
				const end = ((b.x - origin.x) * ex + (b.y - origin.y) * ey) / existing;
				if (end < 0)
					last[0] = { x: origin.x + (end * ex) / existing, y: origin.y + (end * ey) / existing };
				if (end > existing)
					last[1] = { x: origin.x + (end * ex) / existing, y: origin.y + (end * ey) / existing };
				continue;
			}
		}
		runs.push([a, b]);
	}
	return runs;
}

/** Reserve a shared routing grid beside rails, including an outer return corridor. */
function createWalkwayRouter(layout: RouteMapLayout, paper: boolean) {
	const stations = new Map(layout.stations.map((station) => [station.id, station]));
	const sizes = routeMapSizes[paper ? 'paper' : 'screen'];
	const gap = sizes.rail / 2 + sizes.path / 2 + 1;
	const margin = layout.clearance + 2;
	const clearPath = createPathClearance(layout, layout.clearance);
	const clearSignPath = createPathClearance(layout, 0);
	const directions = [
		[1, 0],
		[0, 1],
		[Math.SQRT1_2, Math.SQRT1_2],
		[Math.SQRT1_2, -Math.SQRT1_2]
	] as const;
	const describeRun = (a: RouteMapPoint, b: RouteMapPoint) => {
		const dx = b.x - a.x,
			dy = b.y - a.y;
		const tolerance = 1e-6 * Math.hypot(dx, dy);
		const axis =
			Math.abs(dy) <= tolerance ? 0 : Math.abs(dx) <= tolerance ? 1 : dx * dy > 0 ? 2 : 3;
		const [ux, uy] = directions[axis];
		const start = a.x * ux + a.y * uy,
			end = b.x * ux + b.y * uy;
		return {
			axis,
			coordinate: a.y * ux - a.x * uy,
			start: Math.min(start, end),
			end: Math.max(start, end)
		};
	};
	type RailRun = Omit<ReturnType<typeof describeRun>, 'axis'> & { width: number };
	const railReach = Math.max(1, ...layout.lines.map((line) => line.width / 2 + 1));
	const railRuns = directions.map(() => new Map<number, RailRun[]>());
	for (const line of layout.lines)
		for (const [a, b] of pathRuns(line.points)) {
			const { axis, ...run } = describeRun(a, b);
			const bucket = Math.floor(run.coordinate / railReach);
			const entries = railRuns[axis].get(bucket) ?? [];
			entries.push({ ...run, width: line.width });
			railRuns[axis].set(bucket, entries);
		}
	const clearRails = (points: readonly RouteMapPoint[], allowance?: number) => {
		for (let index = 1; index < points.length; index++) {
			const a = points[index - 1],
				b = points[index];
			if (a.x === b.x && a.y === b.y) continue;
			const run = describeRun(a, b);
			const first = Math.floor((run.coordinate - railReach) / railReach);
			const last = Math.floor((run.coordinate + railReach) / railReach);
			for (let bucket = first; bucket <= last; bucket++) {
				for (const other of railRuns[run.axis].get(bucket) ?? []) {
					if (Math.abs(run.coordinate - other.coordinate) > other.width / 2 + 1) continue;
					if (
						Math.min(run.end, other.end) - Math.max(run.start, other.start) >
						(allowance ?? other.width) + 1e-6
					)
						return false;
				}
			}
		}
		return true;
	};
	const boxes = [
		...layout.stations.flatMap((station) => [
			station.hitBox,
			station.focusBox,
			station.labelBox,
			...station.controlBoxes
		]),
		...layout.stageLabels.map((label) => label.box)
	];
	const left = Math.max(
		1,
		Math.min(...layout.stations.map((station) => station.labelBox.x)) - layout.clearance - 4
	);
	// The final canvas adds 4 px around route points. Keep return lanes inside that bound.
	const right = Math.max(...boxes.map((box) => box.x + box.w));
	const top = 1,
		bottom = layout.height - 4;
	const inside = (point: RouteMapPoint) =>
		point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
	const ports = new Map(
		layout.stations.map((station) => {
			const distance =
				Math.max(station.focusBox.w, station.focusBox.h) / 2 +
				layout.clearance +
				(paper ? 1 : sizes.chevron);
			return [
				station.id,
				[
					[1, 0],
					[-1, 0],
					[1, -1],
					[-1, -1],
					[0, -1],
					[1, 1],
					[-1, 1],
					[0, 1]
				]
					.map(([dx, dy]) => ({
						x: station.center.x + dx * distance,
						y: station.center.y + dy * (dx ? distance : distance + sizes.chevron)
					}))
					.filter(inside)
			] as const;
		})
	);
	// A descending exit turns beside the focus outline, before the name reservation.
	const exits = new Map(
		layout.stations.map((station) => {
			const distance = Math.max(station.focusBox.w, station.focusBox.h) / 2 + layout.clearance + 1;
			return [
				station.id,
				ports
					.get(station.id)!
					.map((point) =>
						point.y > station.center.y && point.x !== station.center.x
							? {
									x: station.center.x + Math.sign(point.x - station.center.x) * distance,
									y: station.center.y + distance
								}
							: point
					)
					.filter(inside)
			] as const;
		})
	);
	const createGrid = () => {
		const sorted = (values: readonly number[], min: number, max: number) =>
			[...new Set(values)].filter((value) => value >= min && value <= max).sort((a, b) => a - b);
		const xs = sorted(
			[
				left,
				right,
				...boxes.flatMap((box) => [box.x - margin, box.x + box.w + margin]),
				...[...ports.values()].flat().map((point) => point.x),
				...[...exits.values()].flat().map((point) => point.x),
				...layout.stations.map((station) => station.center.x),
				...layout.gutters.flatMap((gutter) => gutter.risers.map((riser) => riser.x))
			],
			left,
			right
		);
		const ys = sorted(
			[
				top,
				bottom,
				...boxes.flatMap((box) => [box.y - margin, box.y + box.h + margin]),
				...[...ports.values()].flat().map((point) => point.y),
				...[...exits.values()].flat().map((point) => point.y),
				...layout.stations.flatMap((station) => [
					station.center.y - gap,
					station.center.y,
					station.center.y + gap
				]),
				...layout.lines.flatMap((line) =>
					line.points.flatMap((point) => [point.y - gap, point.y + gap])
				)
			],
			top,
			bottom
		);
		const xIndex = new Map(xs.map((x, index) => [x, index]));
		const yIndex = new Map(ys.map((y, index) => [y, index]));
		const count = xs.length * ys.length;
		const nodeAt = (point: RouteMapPoint) =>
			yIndex.get(point.y)! * xs.length + xIndex.get(point.x)!;
		const pointAt = (node: number) => ({
			x: xs[node % xs.length],
			y: ys[Math.floor(node / xs.length)]
		});
		const clearSegments = new Map<number, boolean>();
		const segmentClear = (from: number, to: number) => {
			const key = Math.min(from, to) * count + Math.max(from, to);
			let clear = clearSegments.get(key);
			if (clear === undefined) {
				const points = [pointAt(from), pointAt(to)];
				// Grid subdivisions must not permit a long run along a rail in short steps.
				clear = clearPath(points, '', '') && clearRails(points, 0);
				clearSegments.set(key, clear);
			}
			return clear;
		};
		return { xs, ys, count, nodeAt, pointAt, segmentClear };
	};
	let sharedGrid: ReturnType<typeof createGrid> | undefined;
	const arrivals = new Map<string, Set<string>>();
	type OccupiedRun = {
		from: string;
		to: string;
		first: boolean;
		last: boolean;
		coordinate: number;
		start: number;
		end: number;
	};
	// A query visits only nearby parallel tracks. Projection intervals reject distant runs.
	const occupied = directions.map(() => new Map<number, OccupiedRun[]>());
	const maxRejectedGoals = 4;
	const maxCheapCandidates = 64;
	const maxSceneVisits = 32768;
	let sceneVisits = 0;
	let searchGeneration = 0;
	let searchBuffers:
		| {
				costs: Float64Array;
				previous: Int32Array;
				seen: Uint32Array;
		  }
		| undefined;
	const risers = new Map(
		layout.gutters.flatMap((gutter) => gutter.risers.map((riser) => [riser.key, riser.x] as const))
	);
	const upperTrack = Math.min(...layout.stations.map((station) => station.center.y));
	const arrivalKey = (points: readonly RouteMapPoint[]) => JSON.stringify(points.slice(-2));
	return (route: RouteMapRoute): readonly RouteMapPoint[] => {
		const source = stations.get(route.from)!,
			target = stations.get(route.to)!;
		const forward = !route.cycle && source.column < target.column;
		const betweenEndpointRows = forward && source.center.y !== target.center.y;
		const used = arrivals.get(route.to) ?? new Set<string>();
		let rejectedGoals = 0,
			cheapAttempts = 0;
		// Undefined is blocked. True commits the search to a shared final approach.
		const occupiedSegment = (
			a: RouteMapPoint,
			b: RouteMapPoint,
			first: boolean,
			last: boolean,
			allowance: number
		): boolean | undefined => {
			if (a.x === b.x && a.y === b.y) return false;
			const run = describeRun(a, b);
			let final = false;
			const firstBucket = Math.floor((run.coordinate - sizes.path) / sizes.path);
			const lastBucket = Math.floor((run.coordinate + sizes.path) / sizes.path);
			for (let bucket = firstBucket; bucket <= lastBucket; bucket++) {
				const nearby = occupied[run.axis].get(bucket);
				if (!nearby) continue;
				for (const other of nearby) {
					if (Math.abs(run.coordinate - other.coordinate) > sizes.path) continue;
					const overlap = Math.min(run.end, other.end) - Math.max(run.start, other.start);
					if (overlap <= allowance + 1e-6) continue;
					if (first && route.from === other.from && other.first) continue;
					if (last && route.to === other.to && other.last) {
						final = true;
						continue;
					}
					return;
				}
			}
			return final;
		};
		const occupiedClear = (points: readonly RouteMapPoint[]) => {
			const runs = pathRuns(points);
			return runs.every(
				([a, b], index) =>
					occupiedSegment(a, b, index === 0, index === runs.length - 1, 8) !== undefined
			);
		};
		const accept = (points: readonly RouteMapPoint[]) => {
			if (
				!points.every(inside) ||
				(forward && (points[1].x < source.center.x || points.at(-2)!.x > target.center.x)) ||
				!clearPath(points, route.from, route.to) ||
				!clearRails(points) ||
				!occupiedClear(points)
			)
				return false;
			if (route.cycle) return true;
			const chevron = routeMapChevron(points, paper),
				tip = chevron[1];
			const previous = points.at(-2)!,
				end = points.at(-1)!;
			return (
				!!tip &&
				(end.x - tip.x) * (tip.x - previous.x) + (end.y - tip.y) * (tip.y - previous.y) > 0 &&
				clearSignPath(chevron, '', '') &&
				clearRails(chevron)
			);
		};
		const settle = (points: readonly RouteMapPoint[]) => {
			used.add(arrivalKey(points));
			arrivals.set(route.to, used);
			const runs = pathRuns(points);
			for (const [index, [a, b]] of runs.entries()) {
				const { axis, ...run } = describeRun(a, b);
				const bucket = Math.floor(run.coordinate / sizes.path);
				const nearby = occupied[axis].get(bucket) ?? [];
				nearby.push({
					...run,
					from: route.from,
					to: route.to,
					first: index === 0,
					last: index === runs.length - 1
				});
				occupied[axis].set(bucket, nearby);
			}
			return points;
		};
		const minY = Math.min(source.center.y, target.center.y),
			maxY = Math.max(source.center.y, target.center.y);
		const compact = (points: readonly RouteMapPoint[]) =>
			points.every((point) => point.y >= minY && point.y <= maxY);
		if (
			accept(route.points) &&
			(!betweenEndpointRows || compact(route.points)) &&
			!used.has(arrivalKey(route.points))
		)
			return settle(route.points);
		const starts = exits
			.get(source.id)!
			.filter(
				(point) =>
					(!forward || point.x >= source.center.x) &&
					clearPath([source.center, point], source.id, '') &&
					clearRails([source.center, point]) &&
					occupiedSegment(source.center, point, true, false, 8) !== undefined
			);
		const ends = ports
			.get(target.id)!
			.filter(
				(point) =>
					(!forward || point.x <= target.center.x) &&
					clearPath([point, target.center], '', target.id) &&
					clearRails([point, target.center]) &&
					occupiedSegment(point, target.center, false, true, 8) !== undefined &&
					(route.cycle || clearSignPath(routeMapChevron([point, target.center], paper), '', ''))
			);
		if (!starts.length || !ends.length) return settle(route.points);
		// Cheap candidates use the same complete acceptance checks as the grid.
		const cheap = (candidate: readonly RouteMapPoint[]) => {
			cheapAttempts++;
			const points = simplifyPath(candidate);
			if (
				(betweenEndpointRows && !compact(points)) ||
				used.has(arrivalKey(points)) ||
				!accept(points)
			)
				return;
			const rounded = chamferRouteMapPath(points, paper ? 5 : 8);
			return settle(
				accept(rounded) && (!betweenEndpointRows || compact(rounded)) ? rounded : points
			);
		};
		const pairs = starts
			.flatMap((start) =>
				ends.map((end) => ({
					start,
					end,
					cost:
						Math.hypot(start.x - source.center.x, start.y - source.center.y) +
						Math.abs(end.x - start.x) +
						Math.abs(end.y - start.y) +
						Math.hypot(end.x - target.center.x, end.y - target.center.y)
				}))
			)
			.sort((a, b) => a.cost - b.cost);
		candidates: {
			for (const { start, end } of pairs) {
				const dx = Math.abs(end.x - start.x),
					dy = Math.abs(end.y - start.y);
				if (dx === 0 || dy === 0 || Math.abs(dx - dy) < 1e-6) {
					const result = cheap([source.center, start, end, target.center]);
					if (result) return result;
					if (cheapAttempts >= maxCheapCandidates) break candidates;
				}
				for (const corner of [
					{ x: end.x, y: start.y },
					{ x: start.x, y: end.y }
				]) {
					const result = cheap([source.center, start, corner, end, target.center]);
					if (result) return result;
					if (cheapAttempts >= maxCheapCandidates) break candidates;
				}
			}
			const pitch = sizes.path + 1;
			for (const { start, end } of pairs) {
				const direction = Math.sign(target.center.x - source.center.x) || 1;
				const sx =
					risers.get(route.key + ':out') ??
					source.center.x +
						(Math.sign(start.x - source.center.x) || direction) * (source.labelBox.w / 2 + margin);
				const tx =
					risers.get(route.key + ':in') ??
					target.center.x +
						(Math.sign(end.x - target.center.x) || -direction) * (target.labelBox.w / 2 + margin);
				const bases = [
					...new Set([
						Math.min(start.y, end.y),
						upperTrack -
							Math.max(
								source.center.y - Math.min(...exits.get(source.id)!.map((point) => point.y)),
								target.center.y - Math.min(...ports.get(target.id)!.map((point) => point.y))
							)
					])
				];
				for (const base of bases)
					for (let lane = 0; lane < 6; lane++) {
						const y = base - lane * pitch;
						if (y < top) continue;
						for (const middle of [
							[start, { x: start.x, y }, { x: end.x, y }, end],
							[start, { x: sx, y: start.y }, { x: sx, y }, { x: tx, y }, { x: tx, y: end.y }, end]
						]) {
							const result = cheap([source.center, ...middle, target.center]);
							if (result) return result;
							if (cheapAttempts >= maxCheapCandidates) break candidates;
						}
					}
			}
		}
		const { xs, ys, count, nodeAt, pointAt, segmentClear } = (sharedGrid ??= createGrid());
		const padding = Math.max(source.labelBox.w, target.labelBox.w) + 2 * margin;
		const regionLeft = Math.max(left, Math.min(source.center.x, target.center.x) - padding);
		const regionRight = Math.min(right, Math.max(source.center.x, target.center.x) + padding);
		const regionBottom = Math.min(
			bottom,
			Math.max(source.labelBox.y + source.labelBox.h, target.labelBox.y + target.labelBox.h) +
				margin +
				sizes.capsule.height +
				sizes.rail
		);
		const occupiedEdges = new Map<number, number>();
		const occupiedEdge = (from: number, to: number, first: boolean, last: boolean) => {
			const key =
				(Math.min(from, to) * count + Math.max(from, to)) * 4 + (first ? 1 : 0) + (last ? 2 : 0);
			let result = occupiedEdges.get(key);
			if (result === undefined) {
				const clear = occupiedSegment(pointAt(from), pointAt(to), first, last, 0);
				result = clear === undefined ? -1 : clear ? 1 : 0;
				occupiedEdges.set(key, result);
			}
			return result;
		};
		// Phase 0 is the first run, 1 is the body, and 2 is a shared final approach.
		// Retain the axis and phase so a body cannot borrow an endpoint exemption.
		const search = (betweenRows: boolean, distinct: boolean): RouteMapPoint[] | undefined => {
			const allowed = (point: RouteMapPoint) =>
				point.x >= regionLeft &&
				point.x <= regionRight &&
				point.y <= regionBottom &&
				(!betweenRows || (point.y >= minY && point.y <= maxY));
			const seeds = starts.filter(allowed);
			const goals = new Set(
				ends
					.filter(
						(point) =>
							allowed(point) && (!distinct || !used.has(arrivalKey([point, target.center])))
					)
					.map(nodeAt)
			);
			if (
				!goals.size ||
				!seeds.length ||
				rejectedGoals >= maxRejectedGoals ||
				sceneVisits >= maxSceneVisits
			)
				return;
			// Generations reuse the buffers without clearing every state for each route.
			const { costs, previous, seen } = (searchBuffers ??= {
				costs: new Float64Array(count * 9),
				previous: new Int32Array(count * 9),
				seen: new Uint32Array(count * 9)
			});
			const generation = ++searchGeneration;
			type Entry = { state: number; cost: number; priority: number };
			const heap: Entry[] = [];
			const before = (a: Entry, b: Entry) =>
				a.priority < b.priority || (a.priority === b.priority && a.state < b.state);
			const push = (entry: Entry) => {
				let index = heap.length;
				heap.push(entry);
				while (index) {
					const parent = Math.floor((index - 1) / 2);
					if (!before(entry, heap[parent])) break;
					heap[index] = heap[parent];
					index = parent;
				}
				heap[index] = entry;
			};
			const pop = () => {
				const first = heap[0],
					last = heap.pop()!;
				if (heap.length) {
					let index = 0;
					while (index * 2 + 1 < heap.length) {
						let child = index * 2 + 1;
						if (child + 1 < heap.length && before(heap[child + 1], heap[child])) child++;
						if (!before(heap[child], last)) break;
						heap[index] = heap[child];
						index = child;
					}
					heap[index] = last;
				}
				return first;
			};
			const visit = (node: number, axis: number, phase: number, cost: number, prior: number) => {
				const state = node * 9 + phase * 3 + axis;
				if (seen[state] === generation && cost >= costs[state]) return;
				seen[state] = generation;
				costs[state] = cost;
				previous[state] = prior;
				const point = pointAt(node);
				push({
					state,
					cost,
					priority: cost + Math.hypot(target.center.x - point.x, target.center.y - point.y)
				});
			};
			for (const point of seeds) {
				const axis = point.y === source.center.y ? 0 : point.x === source.center.x ? 1 : 2;
				visit(
					nodeAt(point),
					axis,
					0,
					Math.hypot(point.x - source.center.x, point.y - source.center.y),
					-1
				);
			}
			while (heap.length) {
				if (sceneVisits >= maxSceneVisits) return;
				sceneVisits++;
				const entry = pop();
				if (entry.cost !== costs[entry.state]) continue;
				const node = Math.floor(entry.state / 9),
					point = pointAt(node),
					incoming = entry.state % 3,
					phase = Math.floor(entry.state / 3) % 3;
				if (goals.has(node)) {
					const points: RouteMapPoint[] = [target.center];
					for (let state = entry.state; state >= 0; state = previous[state])
						points.push(pointAt(Math.floor(state / 9)));
					points.push(source.center);
					const candidate = simplifyPath(points.reverse());
					if (accept(candidate)) return candidate;
					if (++rejectedGoals >= maxRejectedGoals) return;
				}
				const x = node % xs.length,
					y = Math.floor(node / xs.length);
				for (const [next, axis] of [
					[x ? node - 1 : -1, 0],
					[x + 1 < xs.length ? node + 1 : -1, 0],
					[y ? node - xs.length : -1, 1],
					[y + 1 < ys.length ? node + xs.length : -1, 1]
				]) {
					if (
						next < 0 ||
						(phase === 2 && axis !== incoming) ||
						!allowed(pointAt(next)) ||
						!segmentClear(node, next)
					)
						continue;
					const end = pointAt(next);
					const first = phase === 0 && axis === incoming;
					const last = axis === 0 ? point.y === target.center.y : point.x === target.center.x;
					const occupancy = occupiedEdge(node, next, first, last);
					if (occupancy < 0) continue;
					const nextPhase = occupancy === 1 || phase === 2 ? 2 : first ? 0 : 1;
					visit(
						next,
						axis,
						nextPhase,
						entry.cost + Math.hypot(end.x - point.x, end.y - point.y) + (incoming === axis ? 0 : 8),
						entry.state
					);
				}
			}
		};
		for (const betweenRows of betweenEndpointRows ? [true, false] : [false]) {
			for (const distinct of used.size ? [true, false] : [false]) {
				const points = search(betweenRows, distinct);
				if (!points || !accept(points)) continue;
				const diagonal = chamferRouteMapPath(points, paper ? 5 : 8);
				return settle(accept(diagonal) && (!betweenRows || compact(diagonal)) ? diagonal : points);
			}
		}
		return settle(route.points);
	};
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
): Pick<RouteMapLayout, 'routes' | 'corridors' | 'gutters'> {
	const stations = new Map(layout.stations.map((station) => [station.id, station]));
	const edges = family
		? family.map((edge) => ({
				...edge,
				cycle: false,
				crossStage: false,
				stored: [],
				carrier: 'line' as const
			}))
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
	const routeWalkway =
		!family && layout.lines.length ? createWalkwayRouter(layout, metrics.paper) : undefined;
	return {
		routes: routes.map((route) => {
			if (route.carrier !== 'walkway') return route;
			const points = routeWalkway ? routeWalkway(route) : route.points;
			return {
				...route,
				points,
				...(!route.cycle ? { chevron: routeMapChevron(points, metrics.paper) } : {})
			};
		}),
		corridors: layout.corridors,
		gutters: layout.gutters
	};
}

export function routeMapRoutes(
	_model: RouteMapModel,
	layout: RouteMapLayout
): readonly RouteMapRoute[] {
	return layout.routes;
}
