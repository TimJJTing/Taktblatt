import { GANTT_MILESTONE_HEIGHT } from './paper-layout.ts';
import type { DependencyLine, GanttMark, GanttRow } from '#lib/domain/gantt.ts';
import type { GanttMetrics } from './gantt-scene.ts';
import { PRINT_ROUTE_METRICS, SCREEN_ROUTE_METRICS } from './route-tracks.ts';

export function sceneRow(
	id: string,
	row: number,
	mark: GanttMark,
	extra: Partial<GanttRow> = {}
): GanttRow {
	return {
		id,
		row,
		mark,
		stageId: 's1',
		status: 'todo',
		level: 0,
		parentId: null,
		isParent: false,
		expanded: false,
		...extra
	};
}

export function sceneLine(from: GanttRow, to: GanttRow, cycle = false): DependencyLine {
	const x = (r: GanttRow, end: boolean) =>
		r.mark.kind === 'bar' ? (end ? r.mark.x1 : r.mark.x0) : r.mark.kind === 'point' ? r.mark.x : 0;
	return {
		key: `${from.id}->${to.id}`,
		fromId: from.id,
		toId: to.id,
		row0: from.row,
		row1: to.row,
		x0: x(from, true),
		x1: x(to, false),
		cycle
	};
}

export const bar = (x0: number, x1: number, clipStart = false, clipEnd = false): GanttMark => ({
	kind: 'bar',
	x0,
	x1,
	clipStart,
	clipEnd
});
export const point = (x: number): GanttMark => ({ kind: 'point', x, date: '2027-01-10' });
export const screenMetrics = (width: number, rows: number): GanttMetrics => ({
	...SCREEN_ROUTE_METRICS(width, rows),
	media: 'screen'
});
export const paperMetrics = (width: number, rows: number): GanttMetrics => ({
	...PRINT_ROUTE_METRICS(width, rows),
	top: GANTT_MILESTONE_HEIGHT,
	media: 'paper'
});
