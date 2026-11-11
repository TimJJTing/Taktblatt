import type {
	EdgeRef,
	Junction,
	Pt,
	RouteDebug,
	RouteMetrics,
	RouteResult,
	Track
} from './types.ts';

/** Screen metrics for layered diagrams. The adapter supplies its body offset. */
export function SCREEN_ROUTE_METRICS(width: number, rows: number): RouteMetrics {
	return {
		width,
		rows,
		top: 28,
		rowHeight: 28,
		barHalf: 4,
		dotR: 3,
		stub: 6,
		pitch: 4,
		minSeg: 6,
		clearance: 5,
		endZone: 6,
		slots: 7
	};
}

/** Paper metrics use the same routing rules with smaller signs and gutters. */
export function PRINT_ROUTE_METRICS(width: number, rows: number): RouteMetrics {
	return {
		width,
		rows,
		top: 18,
		rowHeight: 18,
		barHalf: 2.5,
		dotR: 2,
		stub: 4,
		pitch: 3,
		minSeg: 4,
		clearance: 3,
		endZone: 4,
		slots: 7
	};
}

interface Trunk {
	key: string;
	sources: Track[];
	edges: EdgeRef[];
	minY: number;
	maxY: number;
	first: number;
	x: number;
	slot: number;
}

interface Branch {
	key: string;
	trunk: Trunk;
	target: Track;
	sources: Track[];
	dir: number;
	lane: number;
	distance: number;
	overflow: boolean;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const point = (x: number, y: number): Pt => ({ x: { f: 0, px: x }, y: { f: 0, px: y } });
const overlaps = (a: number, b: number, c: number, d: number) =>
	Math.max(Math.min(a, b), Math.min(c, d)) < Math.min(Math.max(a, b), Math.max(c, d));

function classify(
	source: Track,
	target: Track,
	trunkX: number,
	distance: number,
	minSeg: number
): RouteDebug['variant'] {
	if (source.center === target.center && target.inX >= source.outX) return 'direct';
	const delta = target.inX - trunkX;
	if (source.center === target.center || delta < -distance) return 'hook';
	return delta >= distance + minSeg ? 'forward' : 'direct';
}

function branchRun(branch: Branch, distance: number, m: RouteMetrics): [number, number] | null {
	const { trunk, target } = branch;
	let run: [number, number] | null = null;
	for (const source of branch.sources) {
		const variant = classify(source, target, trunk.x, distance, m.minSeg);
		if (variant === 'direct') continue;
		const end = variant === 'hook' ? Math.max(0, target.inX - m.stub) : target.inX - distance;
		run = [
			Math.min(run?.[0] ?? trunk.x, trunk.x, end),
			Math.max(run?.[1] ?? trunk.x, trunk.x, end)
		];
	}
	return run;
}

function chooseSlots(trunks: Trunk[], tracks: readonly Track[], m: RouteMetrics) {
	const placed: Trunk[] = [];
	for (const trunk of trunks) {
		const out = Math.max(...trunk.sources.map((source) => source.outX));
		let best = Infinity;
		for (let slot = 0; slot < m.slots; slot++) {
			const x = Math.max(
				0,
				Math.min(out + m.stub + slot * m.pitch, m.width - 1 - (m.slots - 1 - slot) * m.pitch)
			);
			const parallel = placed.filter(
				(other) =>
					Math.abs(x - other.x) < m.pitch &&
					overlaps(trunk.minY, trunk.maxY, other.minY, other.maxY)
			).length;
			let ends = 0;
			let bodies = 0;
			for (const track of tracks) {
				if (!track.span || track.center <= trunk.minY || track.center >= trunk.maxY) continue;
				if (track.span.some((end) => Math.abs(x - end) < m.endZone)) ends++;
				if (x > track.span[0] && x < track.span[1]) bodies++;
			}
			const cost = 1000 * parallel + 100 * ends + bodies + 0.1 * slot;
			if (cost < best) {
				best = cost;
				trunk.x = x;
				trunk.slot = slot;
			}
		}
		placed.push(trunk);
	}
}

function chooseLanes(branches: Branch[], m: RouteMetrics) {
	const reservations = new Map<number, [number, number][]>();
	const near = m.rowHeight / 2 - m.pitch;
	branches.sort(
		(a, b) =>
			Math.abs(b.trunk.x - b.target.inX) - Math.abs(a.trunk.x - a.target.inX) ||
			compare(a.key, b.key)
	);
	for (const branch of branches) {
		const reserve = (distance: number, run: [number, number]) => {
			const y = Math.round((branch.target.center - branch.dir * distance) * 1000);
			const runs = reservations.get(y) ?? [];
			runs.push(run);
			reservations.set(y, runs);
		};
		let assigned = false;
		for (let lane = 0; lane < 2; lane++) {
			const distance = near + lane * m.pitch;
			const run = branchRun(branch, distance, m);
			// A direct entry has no horizontal gutter run to reserve.
			if (!run) {
				branch.distance = distance;
				assigned = true;
				break;
			}
			const y = Math.round((branch.target.center - branch.dir * distance) * 1000);
			if ((reservations.get(y) ?? []).some((other) => overlaps(...run, ...other))) continue;
			branch.lane = lane;
			branch.distance = distance;
			reserve(distance, run);
			assigned = true;
			break;
		}
		if (assigned) continue;
		branch.overflow = true;
		reserve(near, branchRun(branch, near, m)!);
	}
}

/** Route resolved tracks. Recompute at each layout size before tweening the scene. */
export function routeTracks(
	tracks: readonly Track[],
	edges: readonly EdgeRef[],
	m: RouteMetrics
): RouteResult {
	const byId = new Map(tracks.map((track) => [track.id, track]));
	const valid = edges
		.filter((edge) => byId.has(edge.from) && byId.has(edge.to))
		.toSorted((a, b) => compare(a.key, b.key));
	const outgoing = new Map<string, EdgeRef[]>();
	for (const edge of valid) {
		const list = outgoing.get(edge.from) ?? [];
		list.push(edge);
		outgoing.set(edge.from, list);
	}
	const grouped = new Map<string, Trunk>();
	for (const [id, list] of outgoing) {
		const targets = [...new Set(list.map((edge) => edge.to))].sort(compare);
		const key = JSON.stringify(targets);
		const source = byId.get(id)!;
		let trunk = grouped.get(key);
		if (!trunk) {
			trunk = {
				key,
				sources: [],
				edges: [],
				minY: Infinity,
				maxY: -Infinity,
				first: Infinity,
				x: 0,
				slot: 0
			};
			grouped.set(key, trunk);
		}
		trunk.sources.push(source);
		trunk.edges.push(...list);
		trunk.first = Math.min(trunk.first, source.center);
		for (const track of [source, ...targets.map((target) => byId.get(target)!)]) {
			trunk.minY = Math.min(trunk.minY, track.center);
			trunk.maxY = Math.max(trunk.maxY, track.center);
		}
	}
	const trunks = [...grouped.values()].sort(
		(a, b) => a.maxY - a.minY - (b.maxY - b.minY) || a.first - b.first || compare(a.key, b.key)
	);
	chooseSlots(trunks, tracks, m);
	const branches = new Map<string, Branch>();
	const edgeBranches = new Map<string, Branch>();
	for (const trunk of trunks) {
		for (const edge of trunk.edges) {
			const source = byId.get(edge.from)!;
			const target = byId.get(edge.to)!;
			// Links on one row use the gutter below that row when they must go backward.
			const dir = target.center > source.center ? 1 : -1;
			const key = JSON.stringify([trunk.key, target.id, dir]);
			let branch = branches.get(key);
			if (!branch) {
				branch = {
					key,
					trunk,
					target,
					sources: [],
					dir,
					lane: 0,
					distance: m.rowHeight / 2 - m.pitch,
					overflow: false
				};
				branches.set(key, branch);
			}
			branch.sources.push(source);
			edgeBranches.set(edge.key, branch);
		}
	}
	chooseLanes([...branches.values()], m);
	const result: RouteResult = { edges: [], junctions: [], debug: [] };
	const riserPoints = new Map<string, { joins: number[]; ends: number[] }>();
	for (const edge of valid) {
		const source = byId.get(edge.from)!;
		const branch = edgeBranches.get(edge.key)!;
		const { trunk, target, dir } = branch;
		const delta = target.inX - trunk.x;
		const distance = branch.distance;
		const laneY = target.center - dir * distance;
		const variant = classify(source, target, trunk.x, distance, m.minSeg);
		let ps: Pt[];
		const start = point(source.outX, source.center);
		const riser = point(trunk.x, source.center);
		const end = point(target.inX, target.center);
		if (source.center === target.center && target.inX >= source.outX) {
			ps = [start, start, start, start, start, end];
		} else if (variant === 'hook') {
			const entryX = Math.max(0, target.inX - m.stub);
			ps = [
				start,
				riser,
				point(trunk.x, laneY),
				point(entryX, laneY),
				point(entryX, target.center),
				end
			];
		} else if (variant === 'forward') {
			const turn = point(target.inX - distance, laneY);
			ps = [start, riser, point(trunk.x, laneY), turn, turn, end];
		} else {
			const turn = point(trunk.x, target.center - dir * Math.abs(delta));
			ps = [start, riser, turn, turn, turn, end];
		}
		result.edges.push({ ...edge, trunk: trunk.key, points: ps });
		result.debug.push({
			key: edge.key,
			variant,
			slot: trunk.slot,
			lane: variant === 'direct' ? 0 : branch.lane,
			overflow: variant === 'direct' ? false : branch.overflow
		});
		const positions = riserPoints.get(trunk.key) ?? { joins: [], ends: [] };
		positions.joins.push(source.center);
		positions.ends.push(ps[2].y.px);
		riserPoints.set(trunk.key, positions);
	}
	for (const trunk of trunks) {
		const positions = riserPoints.get(trunk.key)!;
		const ys = [...positions.joins, ...positions.ends];
		const min = Math.min(...ys);
		const max = Math.max(...ys);
		for (const y of new Set(ys)) {
			if (y <= min || y >= max) continue;
			const junction: Junction = {
				key: JSON.stringify([trunk.key, y]),
				trunk: trunk.key,
				point: point(trunk.x, y)
			};
			result.junctions.push(junction);
		}
	}
	result.junctions.sort((a, b) => compare(a.key, b.key));
	return result;
}
