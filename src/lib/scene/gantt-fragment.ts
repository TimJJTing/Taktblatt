import type { DependencyLine, GanttRow } from '#lib/domain/gantt.ts';
import { ganttScene, type GanttScene } from './gantt-scene.ts';
import { PRINT_ROUTE_METRICS } from './route-tracks.ts';

export interface GanttFragmentOptions {
	from: number;
	to: number;
	first: boolean;
	/** Measured sheet content width, including the 150 px label column. */
	width: number;
}

export interface GanttFragment {
	rows: readonly GanttRow[];
	lines: readonly DependencyLine[];
	scene: GanttScene;
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
	const scene = ganttScene(localRows, localLines, {
		...PRINT_ROUTE_METRICS(Math.max(0, width - 150), localRows.length),
		top: first ? 22 : 0,
		media: 'paper'
	});
	return { rows: localRows, lines: localLines, scene };
}
