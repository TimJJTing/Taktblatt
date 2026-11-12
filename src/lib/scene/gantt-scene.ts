import type { GanttMark, GanttRow, DependencyLine } from '#lib/domain/gantt.ts';
import type { RouteMetrics, Scene, Track, NodeGeom } from './types.ts';
import { routeTracks } from './route-tracks.ts';

/** Test-first contract. Width is the date area width, in CSS pixels. */
export interface GanttMetrics extends RouteMetrics {
	media: 'screen' | 'paper';
}

export interface StationGeom {
	x: number;
	y: number;
	r: number;
	inset: number;
}

export interface GanttMarkGeom {
	id: string;
	mark: GanttMark;
	line: { x0: number; x1: number; y: number; height: number } | null;
	stations: readonly StationGeom[];
}

export interface GanttScene extends Scene {
	tracks: readonly Track[];
	marks: readonly GanttMarkGeom[];
}

/** Build task signs and routes at the current date-area width. */
export function ganttScene(
	rows: readonly GanttRow[],
	lines: readonly DependencyLine[],
	metrics: GanttMetrics
): GanttScene {
	const { width, top, rowHeight, media } = metrics;
	const paper = media === 'paper';
	const tracks: Track[] = [];
	const marks: GanttMarkGeom[] = [];
	const boxes: NodeGeom[] = [];
	const len = (px: number) => ({ f: 0, px });
	for (const row of rows) {
		const mark = row.mark;
		const y = top + (row.row + 0.5) * rowHeight;
		const height = paper ? (row.level ? 3.5 : 5) : row.level ? 6 : 8;
		const nominalR = paper ? (row.level ? 2 : 3) : row.level ? 3 : 4;
		const stations: StationGeom[] = [];
		let line: GanttMarkGeom['line'] = null;
		if (mark.kind === 'bar' || mark.kind === 'point') {
			const x0 = mark.kind === 'bar' ? mark.x0 * width : mark.x * width;
			const x1 = mark.kind === 'bar' ? mark.x1 * width : x0;
			let inX: number, outX: number, inR: number, outR: number;
			let left = x0,
				right = x1;
			if (mark.kind === 'point') {
				const r = paper ? 2 : 5;
				stations.push({ x: x0, y, r, inset: 1 });
				left = inX = x0 - r;
				right = outX = x0 + r;
				inR = outR = r;
			} else {
				line = { x0, x1, y, height };
				const r = Math.min(nominalR, Math.max(0, x1 - x0) / 2);
				const tiny = x1 - x0 < nominalR * 4;
				if (!mark.clipStart && !mark.clipEnd && tiny) {
					const x = (x0 + x1) / 2;
					stations.push({ x, y, r, inset: Math.min(1, r) });
					inX = x - r;
					outX = x + r;
					inR = outR = r;
				} else {
					inX = mark.clipStart ? x0 : x0 + r;
					outX = mark.clipEnd ? x1 : x1 - r;
					inR = mark.clipStart ? 0 : r;
					outR = mark.clipEnd ? 0 : r;
					if (!mark.clipStart) stations.push({ x: inX, y, r, inset: Math.min(1, r) });
					if (!mark.clipEnd) stations.push({ x: outX, y, r, inset: Math.min(1, r) });
				}
			}
			const half = Math.max(mark.kind === 'point' ? 0 : height / 2, ...stations.map((s) => s.r));
			boxes.push({
				id: row.id,
				x: len(left),
				y: len(y - half),
				w: len(right - left),
				h: len(half * 2),
				radius: nominalR
			});
			tracks.push({
				id: row.id,
				center: y,
				half: mark.kind === 'point' ? half : height / 2,
				span: mark.kind === 'bar' ? [x0, x1] : null,
				inX,
				outX,
				inR,
				outR
			});
		}
		marks.push({ id: row.id, mark, line, stations });
	}
	const drawn = new Set(tracks.map((t) => t.id));
	const edges = lines
		.filter((l) => drawn.has(l.fromId) && drawn.has(l.toId))
		.map((l) => ({ key: l.key, from: l.fromId, to: l.toId, cycle: l.cycle }));
	const routed = width > 0 ? routeTracks(tracks, edges, metrics) : { edges: [], junctions: [] };
	return {
		view: 'gantt',
		nodes: rows.map((r) => ({ id: r.id, stageId: r.stageId, status: r.status })),
		edges: width > 0 ? edges : [],
		tracks,
		marks,
		geometry: { nodes: boxes, edges: routed.edges, junctions: routed.junctions },
		breaks: rows.map((r) => top + (r.row + 1) * rowHeight)
	};
}
