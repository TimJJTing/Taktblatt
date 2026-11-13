import { GANTT_ROW_HEIGHT } from './paper-layout.ts';
import type {
	EdgeGeom,
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
		ringR: 3,
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
		top: GANTT_ROW_HEIGHT,
		rowHeight: GANTT_ROW_HEIGHT,
		barHalf: 2.5,
		dotR: 2,
		ringR: 2,
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

/** Each riser position keeps the identities of its joins and branches. */
type RiserPoints = Map<number, Set<string>>;

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

function chooseSlots(
	trunks: Trunk[],
	tracks: readonly Track[],
	incoming: ReadonlySet<string>,
	m: RouteMetrics
) {
	const placed: Trunk[] = [];
	const far = m.rowHeight / 2 + m.pitch;
	for (const trunk of trunks) {
		const out = Math.max(...trunk.sources.map((source) => source.outX));
		const hasSourceJoin = trunk.sources.some(
			(source) => source.center > trunk.minY && source.center < trunk.maxY
		);
		const firstSlot = hasSourceJoin ? Math.min(1, m.slots - 1) : 0;
		const between = tracks.filter(
			(track) => track.center > trunk.minY && track.center < trunk.maxY
		);
		const approaches = between.filter((track) => incoming.has(track.id));
		let best: number[] | undefined;
		for (let slot = firstSlot; slot < m.slots; slot++) {
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
			let approachHits = 0;
			for (const track of approaches) {
				if (x >= track.inX - far - m.pitch && x <= track.inX) approachHits++;
			}
			for (const track of between) {
				if (!track.span) continue;
				if (track.span.some((end) => Math.abs(x - end) < m.endZone)) ends++;
				if (x > track.span[0] && x < track.span[1]) bodies++;
			}
			const cost = [parallel, ends + approachHits, bodies, slot];
			if (
				!best ||
				(cost[0] - best[0] || cost[1] - best[1] || cost[2] - best[2] || cost[3] - best[3]) < 0
			) {
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
		const hook = branch.sources.some(
			(source) => classify(source, branch.target, branch.trunk.x, near, m.minSeg) === 'hook'
		);
		// The far lane can enter the next row band with the required bar clearance.
		for (const lane of hook ? [1, 0, 2] : [0, 1, 2]) {
			const distance = near + lane * m.pitch;
			const run = branchRun(branch, distance, m);
			// A direct entry has no horizontal gutter run to reserve.
			if (!run) {
				branch.distance = distance;
				assigned = true;
				break;
			}
			const laneY = branch.target.center - branch.dir * distance;
			if (laneY < m.top || laneY > m.top + m.rows * m.rowHeight) continue;
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

function addRiserPoint(positions: RiserPoints, y: number, key: string) {
	const keys = positions.get(y) ?? new Set<string>();
	keys.add(key);
	positions.set(y, keys);
}

function trunkJunctions(
	trunk: Trunk,
	positions: RiserPoints,
	edges: readonly EdgeGeom[],
	tracks: readonly Track[],
	m: RouteMetrics
): Junction[] {
	const junctions: Junction[] = [];
	for (const [y, keys] of positions) {
		const arms = new Set<string>();
		const members = new Set<string>();
		for (const edge of edges) {
			for (let i = 1; i < edge.points.length; i++) {
				const a = edge.points[i - 1];
				const b = edge.points[i];
				const dx = b.x.px - a.x.px;
				const dy = b.y.px - a.y.px;
				if (dx === 0 && dy === 0) continue;
				if (Math.abs((trunk.x - a.x.px) * dy - (y - a.y.px) * dx) > 1e-7) continue;
				if (
					trunk.x < Math.min(a.x.px, b.x.px) ||
					trunk.x > Math.max(a.x.px, b.x.px) ||
					y < Math.min(a.y.px, b.y.px) ||
					y > Math.max(a.y.px, b.y.px)
				)
					continue;
				members.add(edge.key);
				for (const p of [a, b]) {
					const xDirection = Math.sign(p.x.px - trunk.x);
					const yDirection = Math.sign(p.y.px - y);
					if (xDirection || yDirection) arms.add(`${xDirection},${yDirection}`);
				}
			}
		}
		if (arms.size < 3) continue;
		// A one-slot layout cannot provide the required source-join offset.
		if (trunk.slot === 0 && trunk.sources.some((source) => source.center === y)) continue;
		const nearPort = tracks.some((track) => {
			const dySquared = (y - track.center) ** 2;
			return (
				(trunk.x - track.inX) ** 2 + dySquared < (track.inR + m.ringR + 2) ** 2 ||
				(trunk.x - track.outX) ** 2 + dySquared < (track.outR + m.ringR + 2) ** 2
			);
		});
		if (nearPort) continue;
		// Branch roles sort before joins. Select one role without combining member identities.
		const role = [...keys].sort(compare)[0];
		junctions.push({
			key: JSON.stringify([trunk.key, 'junction', role]),
			trunk: trunk.key,
			point: point(trunk.x, y),
			kind: 'junction',
			edges: [...members]
		});
	}
	for (const source of trunk.sources) {
		if (trunk.x >= source.outX) continue;
		// Keep taps even when the source port is inside ordinary clearance.
		junctions.push({
			key: JSON.stringify([trunk.key, 'tap', source.id]),
			trunk: trunk.key,
			point: point(trunk.x, source.center),
			kind: 'tap',
			source: source.id
		});
	}
	return junctions;
}

/** Route resolved tracks at the current size. Width changes apply without a tween. */
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
	chooseSlots(trunks, tracks, new Set(valid.map((edge) => edge.to)), m);
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
	const riserPoints = new Map<string, RiserPoints>();
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
		const positions = riserPoints.get(trunk.key) ?? new Map<number, Set<string>>();
		addRiserPoint(positions, source.center, JSON.stringify(['join', source.id]));
		// A straight same-row edge has no riser exit.
		if (source.center !== target.center || target.inX < source.outX) {
			addRiserPoint(positions, ps[2].y.px, JSON.stringify(['branch', target.id, dir, variant]));
		}
		riserPoints.set(trunk.key, positions);
	}
	for (const trunk of trunks) {
		result.junctions.push(
			...trunkJunctions(
				trunk,
				riserPoints.get(trunk.key)!,
				result.edges.filter((edge) => edge.trunk === trunk.key),
				tracks,
				m
			)
		);
	}
	result.junctions.sort((a, b) => compare(a.key, b.key));
	return result;
}
