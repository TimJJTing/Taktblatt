import type { DependencyLine, GanttRow } from '#lib/domain/gantt.ts';
import { ganttScene, type GanttScene } from './gantt-scene.ts';
import { PRINT_ROUTE_METRICS } from './route-tracks.ts';
import type { EdgeGeom, Pt, Track, Junction } from './types.ts';

export interface GanttPaperLayout {
	scene: GanttScene;
	/** Measured sheet content width, including the label column. */
	width: number;
}

export interface GanttContinuation extends EdgeGeom {
	kind: 'exit' | 'entry' | 'pass-through';
	riserX: number;
	stubs: readonly Pt[][];
	ticks: readonly Pt[][];
}

/** Share the whole-segment route for the current paper geometry. */
export function createGanttPaperCache(): {
	get(rows: readonly GanttRow[], lines: readonly DependencyLine[], width: number): GanttPaperLayout;
} {
	let previousKey: string | undefined;
	let previous: GanttPaperLayout | undefined;
	return {
		get(rows, lines, width) {
			const key = JSON.stringify([
				width,
				rows.map((r) => [r.id, r.stageId, r.status, r.row, r.level, r.mark]),
				lines.map((l) => [l.key, l.fromId, l.toId, l.cycle])
			]);
			if (previous && key === previousKey) return previous;
			const scene = ganttScene(rows, lines, {
				...PRINT_ROUTE_METRICS(Math.max(0, width - 150), rows.length),
				top: 22,
				media: 'paper'
			});
			previousKey = key;
			previous = { scene, width };
			return previous;
		}
	};
}

const point = (x: number, y: number): Pt => ({ x: { f: 0, px: x }, y: { f: 0, px: y } });
const resolveX = (p: Pt, width: number) => p.x.f * width + p.x.px;

/** Build an entry from a boundary without adding a boundary task to the router. */
function entryPoints(
	target: Track,
	x: number,
	boundary: number,
	dir: number,
	stub: number,
	laneDistance?: number
): Pt[] {
	const available = Math.max(0, Math.abs(target.center - boundary) - stub);
	const near = Math.min(laneDistance ?? 6, available);
	const delta = target.inX - x;
	const end = point(target.inX, target.center);
	const start = point(x, boundary);
	const stubEnd = point(x, boundary + dir * stub);
	if (delta < -near) {
		const distance = Math.min(laneDistance ?? 9, available);
		const laneY = target.center - dir * distance;
		const entryX = Math.max(0, target.inX - stub);
		return [
			start,
			stubEnd,
			point(x, laneY),
			point(entryX, laneY),
			point(entryX, target.center),
			end
		];
	}
	if (delta < near + 4 && Math.abs(delta) <= available) {
		const turn = point(x, target.center - dir * Math.abs(delta));
		return [start, stubEnd, turn, turn, turn, end];
	}
	const distance = Math.min(near, target.inX);
	const laneY = target.center - dir * distance;
	const turn = point(target.inX - distance, laneY);
	return [start, stubEnd, point(x, laneY), turn, turn, end];
}

/** Reserve entry runs without moving the fragment's complete routes. */
function reserveEntryLanes(
	continuations: GanttContinuation[],
	scene: GanttScene,
	paper: GanttPaperLayout,
	width: number
) {
	const metrics = PRINT_ROUTE_METRICS(width, scene.nodes.length);
	const tracks = new Map(scene.tracks.map((track) => [track.id, track]));
	const trunks = new Map(paper.scene.geometry.edges.map((edge) => [edge.key, edge.trunk]));
	const reservations = new Map<number, { branch: string; min: number; max: number }[]>();
	const branchKey = (trunk: string, target: string, dir: number) =>
		JSON.stringify([trunk, target, dir]);
	const run = (points: readonly Pt[]) => {
		const a = points[2];
		const b = points[3];
		if (a.y.px !== b.y.px || a.x.px === b.x.px) return null;
		return {
			y: Math.round(a.y.px * 1000),
			min: Math.min(a.x.px, b.x.px),
			max: Math.max(a.x.px, b.x.px)
		};
	};
	const reserve = (points: readonly Pt[], branch: string) => {
		const entry = run(points);
		if (!entry) return;
		const runs = reservations.get(entry.y) ?? [];
		runs.push({ branch, min: entry.min, max: entry.max });
		reservations.set(entry.y, runs);
	};
	for (const edge of scene.geometry.edges) {
		const source = tracks.get(edge.from)!;
		const target = tracks.get(edge.to)!;
		reserve(
			edge.points,
			branchKey(trunks.get(edge.key) ?? edge.trunk, edge.to, target.center > source.center ? 1 : -1)
		);
	}
	const entries = continuations.filter((edge) => edge.kind === 'entry');
	const entryBranch = (edge: GanttContinuation) =>
		branchKey(edge.trunk, edge.to, tracks.get(edge.to)!.center > edge.points[0].y.px ? 1 : -1);
	entries.sort((a, b) => {
		const distance =
			Math.abs(b.riserX - tracks.get(b.to)!.inX) - Math.abs(a.riserX - tracks.get(a.to)!.inX);
		const aKey = entryBranch(a);
		const bKey = entryBranch(b);
		return distance || (aKey < bKey ? -1 : aKey > bKey ? 1 : 0);
	});
	const selected = new Map<string, Pt[]>();
	const near = metrics.rowHeight / 2 - metrics.pitch;
	for (const edge of entries) {
		const target = tracks.get(edge.to)!;
		const boundary = edge.points[0].y.px;
		const dir = target.center > boundary ? 1 : -1;
		const branch = entryBranch(edge);
		const shared = selected.get(branch);
		if (shared) {
			edge.points = shared;
			continue;
		}
		const available = Math.max(0, Math.abs(target.center - boundary) - metrics.stub);
		const hook = target.inX - edge.riserX < -Math.min(near, available);
		let points = entryPoints(target, edge.riserX, boundary, dir, metrics.stub, near);
		for (const lane of hook ? [1, 0, 2] : [0, 1, 2]) {
			const candidate = entryPoints(
				target,
				edge.riserX,
				boundary,
				dir,
				metrics.stub,
				near + lane * metrics.pitch
			);
			const entry = run(candidate);
			if (
				entry &&
				(reservations.get(entry.y) ?? []).some(
					(other) =>
						other.branch !== branch &&
						Math.max(entry.min, other.min) < Math.min(entry.max, other.max)
				)
			)
				continue;
			points = candidate;
			break;
		}
		edge.points = points;
		selected.set(branch, points);
		reserve(points, branch);
	}
}

function fragmentContinuations(
	rows: readonly GanttRow[],
	scene: GanttScene,
	options: GanttFragmentOptions
): GanttContinuation[] {
	const { paper, width, from, to, first } = options;
	const extent = Math.max(0, width - 150);
	if (!paper || paper.width !== width || extent === 0 || from === to || scene.nodes.length === 0)
		return [];
	const positions = new Map(rows.map((r) => [r.id, r.row]));
	const tracks = new Map(scene.tracks.map((t) => [t.id, t]));
	const top = first ? 22 : 0;
	const bottom = top + scene.nodes.length * 18;
	const stub = PRINT_ROUTE_METRICS(extent, scene.nodes.length).stub;
	const result: GanttContinuation[] = [];
	for (const edge of paper.scene.geometry.edges) {
		const sourceRow = positions.get(edge.from)!;
		const targetRow = positions.get(edge.to)!;
		const source = tracks.get(edge.from);
		const target = tracks.get(edge.to);
		if (
			(source && target) ||
			Math.max(sourceRow, targetRow) < from ||
			Math.min(sourceRow, targetRow) >= to
		)
			continue;
		const dir = targetRow > sourceRow ? 1 : -1;
		const x = resolveX(edge.points[1], extent);
		const kind = source ? 'exit' : target ? 'entry' : 'pass-through';
		const boundaries =
			kind === 'pass-through'
				? [top, bottom]
				: [kind === 'exit' ? (dir > 0 ? bottom : top) : dir > 0 ? top : bottom];
		const stubs = boundaries.map((y) =>
			y === top
				? [point(x, top), point(x, top + stub)]
				: [point(x, bottom - stub), point(x, bottom)]
		);
		const ticks = boundaries.map((y) => [
			point(Math.max(0, x - 1), y),
			point(Math.min(extent, x + 1), y)
		]);
		let points: Pt[];
		if (source) {
			const boundary = boundaries[0];
			const end = point(x, boundary);
			points = [
				point(source.outX, source.center),
				point(x, source.center),
				point(x, boundary - dir * stub),
				end,
				end,
				end
			];
		} else if (target) {
			points = entryPoints(target, x, boundaries[0], dir, stub);
		} else {
			const start = point(x, dir > 0 ? top : bottom);
			const end = point(x, dir > 0 ? bottom : top);
			points = [
				start,
				point(x, start.y.px + dir * stub),
				point(x, end.y.px - dir * stub),
				end,
				end,
				end
			];
		}
		result.push({
			key: edge.key,
			from: edge.from,
			to: edge.to,
			trunk: edge.trunk,
			cycle: edge.cycle,
			kind,
			riserX: x,
			points,
			stubs,
			ticks
		});
	}
	reserveEntryLanes(result, scene, paper, extent);
	return result;
}

/** Add rings only where the fragment paths have at least three incident arms. */
function continuationJunctions(
	scene: GanttScene,
	continuations: readonly GanttContinuation[],
	paper: GanttPaperLayout,
	width: number
): Junction[] {
	const metrics = PRINT_ROUTE_METRICS(width, scene.nodes.length);
	const trunks = new Map(paper.scene.geometry.edges.map((edge) => [edge.key, edge.trunk]));
	const crossing = new Map(continuations.map((edge) => [edge.key, edge]));
	const affected = new Set(continuations.map((edge) => edge.trunk));
	const groups = new Map<string, EdgeGeom[]>();
	const candidates = new Map<string, { trunk: string; x: number; y: number; roles: Set<string> }>();
	const add = (trunk: string, x: number, y: number, role: string) => {
		const key = JSON.stringify([trunk, x, y]);
		const candidate = candidates.get(key) ?? { trunk, x, y, roles: new Set<string>() };
		candidate.roles.add(role);
		candidates.set(key, candidate);
	};
	const tracks = new Map(scene.tracks.map((track) => [track.id, track]));
	for (const edge of [...scene.geometry.edges, ...continuations]) {
		const trunk = trunks.get(edge.key) ?? edge.trunk;
		if (!affected.has(trunk)) continue;
		const edges = groups.get(trunk) ?? [];
		edges.push(edge);
		groups.set(trunk, edges);
		const continuation = crossing.get(edge.key);
		const x = continuation?.riserX ?? edge.points[1].x.px;
		const source = tracks.get(edge.from);
		const target = tracks.get(edge.to);
		if (source) add(trunk, x, source.center, JSON.stringify(['join', source.id]));
		if (!target || continuation?.kind === 'exit' || continuation?.kind === 'pass-through') continue;
		if (source?.center === target.center && target.inX >= source.outX) continue;
		const dir = target.center > (source?.center ?? edge.points[0].y.px) ? 1 : -1;
		const variant =
			edge.points[3].y.px !== edge.points[4].y.px
				? 'hook'
				: edge.points[2].x.px !== edge.points[3].x.px
					? 'forward'
					: 'direct';
		add(trunk, x, edge.points[2].y.px, JSON.stringify(['branch', target.id, dir, variant]));
	}
	const junctions = continuationTaps(scene, continuations, width);
	const keys = new Set(junctions.map((junction) => junction.key));
	for (const { trunk, x, y, roles } of candidates.values()) {
		const arms = new Set<string>();
		for (const edge of groups.get(trunk)!) {
			for (let i = 1; i < edge.points.length; i++) {
				const a = edge.points[i - 1];
				const b = edge.points[i];
				const dx = b.x.px - a.x.px;
				const dy = b.y.px - a.y.px;
				if (dx === 0 && dy === 0) continue;
				if (Math.abs((x - a.x.px) * dy - (y - a.y.px) * dx) > 1e-7) continue;
				if (
					x < Math.min(a.x.px, b.x.px) ||
					x > Math.max(a.x.px, b.x.px) ||
					y < Math.min(a.y.px, b.y.px) ||
					y > Math.max(a.y.px, b.y.px)
				)
					continue;
				for (const p of [a, b]) {
					const xDirection = Math.sign(p.x.px - x);
					const yDirection = Math.sign(p.y.px - y);
					if (xDirection || yDirection) arms.add(`${xDirection},${yDirection}`);
				}
			}
		}
		if (arms.size < 3) continue;
		if (
			scene.tracks.some(
				(track) =>
					(x - track.inX) ** 2 + (y - track.center) ** 2 < (track.inR + metrics.ringR + 2) ** 2 ||
					(x - track.outX) ** 2 + (y - track.center) ** 2 < (track.outR + metrics.ringR + 2) ** 2
			)
		)
			continue;
		const role = [...roles].sort()[0];
		const key = JSON.stringify([trunk, 'junction', role]);
		if (
			keys.has(key) ||
			junctions.some(
				(junction) =>
					junction.kind === 'junction' && junction.point.x.px === x && junction.point.y.px === y
			)
		)
			continue;
		junctions.push({ key, trunk, point: point(x, y), kind: 'junction' });
		keys.add(key);
	}
	return junctions;
}

function continuationTaps(
	scene: GanttScene,
	continuations: readonly GanttContinuation[],
	width: number
): Junction[] {
	const taps: Junction[] = [...scene.geometry.junctions];
	const tracks = new Map(scene.tracks.map((t) => [t.id, t]));
	for (const edge of continuations) {
		if (edge.kind !== 'exit') continue;
		const source = tracks.get(edge.from)!;
		if (
			edge.riserX >= source.outX ||
			taps.some(
				(j) =>
					j.kind === 'tap' && j.source === edge.from && resolveX(j.point, width) === edge.riserX
			)
		)
			continue;
		taps.push({
			key: JSON.stringify([edge.trunk, 'tap', edge.from]),
			trunk: edge.trunk,
			point: point(edge.riserX, source.center),
			kind: 'tap',
			source: edge.from
		});
	}
	return taps;
}

export interface GanttFragmentOptions {
	from: number;
	to: number;
	first: boolean;
	/** Measured sheet content width, including the 150 px label column. */
	width: number;
	paper?: GanttPaperLayout;
}

export interface GanttFragment {
	rows: readonly GanttRow[];
	lines: readonly DependencyLine[];
	scene: GanttScene;
	continuations: readonly GanttContinuation[];
}

/** Route complete edges after filtering and rebasing the fragment. */
export function ganttFragment(
	rows: readonly GanttRow[],
	lines: readonly DependencyLine[],
	options: GanttFragmentOptions
): GanttFragment {
	const { from, to, first, width } = options;
	const localRows = rows.slice(from, to).map((r) => ({ ...r, row: r.row - from }));
	const ids = new Set(localRows.map((r) => r.id));
	const localLines = lines
		.filter((l) => ids.has(l.fromId) && ids.has(l.toId))
		.map((l) => ({ ...l, row0: l.row0 - from, row1: l.row1 - from }));
	let scene = ganttScene(localRows, localLines, {
		...PRINT_ROUTE_METRICS(Math.max(0, width - 150), localRows.length),
		top: first ? 22 : 0,
		media: 'paper'
	});
	const continuations = fragmentContinuations(rows, scene, options);
	if (continuations.length)
		scene = {
			...scene,
			geometry: {
				...scene.geometry,
				junctions: continuationJunctions(
					scene,
					continuations,
					options.paper!,
					Math.max(0, width - 150)
				)
			}
		};
	return { rows: localRows, lines: localLines, scene, continuations };
}
