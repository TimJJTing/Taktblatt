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
function entryPoints(target: Track, x: number, boundary: number, dir: number, stub: number): Pt[] {
	const available = Math.max(0, Math.abs(target.center - boundary) - stub);
	const near = Math.min(6, available);
	const delta = target.inX - x;
	const end = point(target.inX, target.center);
	const start = point(x, boundary);
	const stubEnd = point(x, boundary + dir * stub);
	if (delta < -near) {
		const distance = Math.min(9, available);
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
	return result;
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
				junctions: continuationTaps(scene, continuations, Math.max(0, width - 150))
			}
		};
	return { rows: localRows, lines: localLines, scene, continuations };
}
