/**
 * Gantt geometry. These functions calculate the positions of the timeline marks.
 * They do not use Svelte or the DOM.
 * A position is a fraction of the timeline width: 0 is the left edge, 1 is the right edge.
 * A day occupies [day start, day end) of the width.
 * Refer to docs/spec.md, section 5.4.
 */
import { DAY_MS, dayNumber, isoFromDayNumber, type ISODate } from './date.ts';
import { effectiveDependencies, orderedMilestones, type TaskIndex } from './derive.ts';
import type { Band, Milestone, TaskStatus } from './schema.ts';

/** The visible range of the timeline. Both dates are inclusive. */
export interface GanttWindow {
	start: ISODate;
	end: ISODate;
}

/** Number of days in the window (inclusive). The minimum is 1. */
export function windowDays(win: GanttWindow): number {
	return Math.max(1, dayNumber(win.end) - dayNumber(win.start) + 1);
}

/** Fraction of the left edge of a day (edge 'start') or its right edge (edge 'end'). Not clamped. */
export function dateX(win: GanttWindow, date: ISODate, edge: 'start' | 'end' = 'start'): number {
	const offset = dayNumber(date) - dayNumber(win.start) + (edge === 'end' ? 1 : 0);
	return offset / windowDays(win);
}

function centerX(win: GanttWindow, date: ISODate): number {
	return (dateX(win, date, 'start') + dateX(win, date, 'end')) / 2;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface MonthTick {
	/** The first day of the month. */
	month: ISODate;
	/** Clipped to [0, 1]. */
	x0: number;
	x1: number;
}

/** Returns one tick for each calendar month that intersects the window. */
export function monthTicks(win: GanttWindow): MonthTick[] {
	if (win.start > win.end) return [];
	const [endY, endM] = win.end.split('-').map(Number);
	let [y, m] = win.start.split('-').map(Number);
	const result: MonthTick[] = [];
	while (y < endY || (y === endY && m <= endM)) {
		const first = Date.UTC(y, m - 1, 1) / DAY_MS;
		const last = Date.UTC(y, m, 1) / DAY_MS - 1;
		const month = isoFromDayNumber(first);
		result.push({
			month,
			x0: clamp01(dateX(win, month, 'start')),
			x1: clamp01(dateX(win, isoFromDayNumber(last), 'end'))
		});
		m += 1;
		if (m > 12) {
			m = 1;
			y += 1;
		}
	}
	return result;
}

export type GanttMark =
	/** A valid range that intersects the window. Clipped to [0, 1]. */
	| { kind: 'bar'; x0: number; x1: number; clipStart: boolean; clipEnd: boolean }
	/** One date only, inside the window. x is the center of the day. */
	| { kind: 'point'; x: number; date: ISODate }
	/** A range or point fully outside the window. The app does not draw it. */
	| { kind: 'outside'; side: 'before' | 'after' }
	/** No dates. */
	| { kind: 'none' }
	/** Both dates are set, but start > end. */
	| { kind: 'invalid' };

/** Clipped span of a range, or the side when the range is fully outside the window. */
function rangeSpan(
	win: GanttWindow,
	start: ISODate,
	end: ISODate
): { x0: number; x1: number; clipStart: boolean; clipEnd: boolean } | 'before' | 'after' {
	if (end < win.start) return 'before';
	if (start > win.end) return 'after';
	const x0 = dateX(win, start, 'start');
	const x1 = dateX(win, end, 'end');
	return { x0: clamp01(x0), x1: clamp01(x1), clipStart: x0 < 0, clipEnd: x1 > 1 };
}

/** Returns the mark of a task from its effective dates. */
export function taskMark(
	win: GanttWindow,
	values: { start: ISODate | null; end: ISODate | null }
): GanttMark {
	const { start, end } = values;
	if (start !== null && end !== null) {
		if (start > end) return { kind: 'invalid' };
		const span = rangeSpan(win, start, end);
		return typeof span === 'string' ? { kind: 'outside', side: span } : { kind: 'bar', ...span };
	}
	const date = start ?? end;
	if (date === null) return { kind: 'none' };
	if (date < win.start) return { kind: 'outside', side: 'before' };
	if (date > win.end) return { kind: 'outside', side: 'after' };
	return { kind: 'point', x: centerX(win, date), date };
}

/** Returns true when the app draws the mark (a bar or a point). */
export function isDrawn(mark: GanttMark): boolean {
	return mark.kind === 'bar' || mark.kind === 'point';
}

export interface GanttRow {
	id: string;
	stageId: string;
	level: 0 | 1;
	parentId: string | null;
	isParent: boolean;
	expanded: boolean;
	status: TaskStatus;
	mark: GanttMark;
	/** 0-based. */
	row: number;
}

/**
 * Rows in table order: stages in plan order, then ws.index.stageTasks order.
 * Subtasks (ws.index.children order) show only when the parent is expanded.
 */
export function ganttRows(
	index: TaskIndex,
	stageIds: readonly string[],
	isExpanded: (id: string) => boolean,
	win: GanttWindow
): GanttRow[] {
	const rows: GanttRow[] = [];
	for (const stageId of stageIds) {
		for (const task of index.stageTasks.get(stageId) ?? []) {
			const children = index.children.get(task.id) ?? [];
			const isParent = children.length > 0;
			const expanded = isParent && isExpanded(task.id);
			const eff = index.state.get(task.id)!.eff;
			rows.push({
				id: task.id,
				stageId,
				level: 0,
				parentId: null,
				isParent,
				expanded,
				status: eff.status,
				mark: taskMark(win, eff),
				row: rows.length
			});
			if (!expanded) continue;
			for (const child of children) {
				const childEff = index.state.get(child.id)!.eff;
				rows.push({
					id: child.id,
					stageId,
					level: 1,
					parentId: task.id,
					isParent: false,
					expanded: false,
					status: childEff.status,
					mark: taskMark(win, childEff),
					row: rows.length
				});
			}
		}
	}
	return rows;
}

export interface DependencyLine {
	/** `${fromId}->${toId}`. */
	key: string;
	/** The row of the dependency (predecessor). */
	fromId: string;
	/** The row of the dependent. */
	toId: string;
	/** The right end of the predecessor mark. */
	x0: number;
	row0: number;
	/** The left start of the dependent mark. */
	x1: number;
	row1: number;
}

function markStart(mark: GanttMark): number {
	return mark.kind === 'bar' ? mark.x0 : mark.kind === 'point' ? mark.x : 0;
}

function markEnd(mark: GanttMark): number {
	return mark.kind === 'bar' ? mark.x1 : mark.kind === 'point' ? mark.x : 0;
}

/** The dependencies that a row draws. An expanded parent draws only its own dependencies. */
function rowDependencies(index: TaskIndex, row: GanttRow): Iterable<string> {
	if (!row.expanded) return effectiveDependencies(index, row.id);
	const task = index.byId.get(row.id);
	if (!task) return [];
	const childIds = new Set((index.children.get(row.id) ?? []).map((c) => c.id));
	return task.dependsOn.filter((d) => d !== row.id && !childIds.has(d) && index.byId.has(d));
}

/**
 * Returns the dependency lines between the drawn marks of the rows.
 * from is the dependency (predecessor). to is the dependent.
 * Each dependency goes to its visible row: the task row, else the row of its collapsed parent.
 * The app merges duplicate lines. The order is by dependent row, then by predecessor row.
 */
export function dependencyLines(index: TaskIndex, rows: readonly GanttRow[]): DependencyLine[] {
	const byId = new Map(rows.map((r) => [r.id, r]));
	const visibleRow = (id: string): GanttRow | undefined => {
		const own = byId.get(id);
		if (own) return own;
		const parentId = index.byId.get(id)?.parentId;
		return parentId ? byId.get(parentId) : undefined;
	};
	const lines = new Map<string, DependencyLine>();
	for (const to of rows) {
		if (!isDrawn(to.mark)) continue;
		for (const depId of rowDependencies(index, to)) {
			const from = visibleRow(depId);
			if (!from || from.row === to.row || !isDrawn(from.mark)) continue;
			const key = `${from.id}->${to.id}`;
			if (lines.has(key)) continue;
			lines.set(key, {
				key,
				fromId: from.id,
				toId: to.id,
				x0: markEnd(from.mark),
				row0: from.row,
				x1: markStart(to.mark),
				row1: to.row
			});
		}
	}
	return [...lines.values()].sort((a, b) => a.row1 - b.row1 || a.row0 - b.row0);
}

/** x of today's center, or null when today is outside the window. */
export function todayX(win: GanttWindow, today: ISODate): number | null {
	return milestoneX(win, today);
}

/** Clipped span of a band, or null when it is fully outside. */
export function spanX(
	win: GanttWindow,
	range: { start: ISODate; end: ISODate }
): { x0: number; x1: number } | null {
	if (range.start > range.end) return null;
	const span = rangeSpan(win, range.start, range.end);
	return typeof span === 'string' ? null : { x0: span.x0, x1: span.x1 };
}

/** x of a milestone date (center of the day), or null when it is outside the window. */
export function milestoneX(win: GanttWindow, date: ISODate): number | null {
	if (date < win.start || date > win.end) return null;
	return centerX(win, date);
}

/** The bands that show in the window, with their clipped span. A band outside the window is left out. */
export function visibleBands(
	win: GanttWindow,
	bands: readonly Band[]
): { band: Band; x0: number; x1: number }[] {
	return bands.flatMap((band) => {
		const span = spanX(win, band);
		return span ? [{ band, ...span }] : [];
	});
}

/** The milestones that show in the window, in date order, with their labels and x. */
export function visibleMilestones(
	win: GanttWindow,
	milestones: readonly Milestone[]
): { label: string; milestone: Milestone; x: number }[] {
	return orderedMilestones(milestones).flatMap((item) => {
		const x = milestoneX(win, item.milestone.date);
		return x === null ? [] : [{ ...item, x }];
	});
}
