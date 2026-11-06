import { describe, expect, it } from 'vitest';
import { indexTasks } from './derive.ts';
import {
	dateX,
	dependencyLines,
	ganttRows,
	isDrawn,
	milestoneX,
	monthTicks,
	spanX,
	taskMark,
	todayX,
	visibleBands,
	visibleMilestones,
	windowDays,
	type GanttWindow
} from './gantt.ts';
import { makeTask } from './test-helpers.ts';

// Ten days: day n starts at (n - 1) / 10.
const WIN: GanttWindow = { start: '2027-01-01', end: '2027-01-10' };

describe('dateX and windowDays', () => {
	it('counts the days of the window inclusive', () => {
		expect(windowDays(WIN)).toBe(10);
		expect(windowDays({ start: '2027-01-01', end: '2027-01-01' })).toBe(1);
		expect(windowDays({ start: '2027-12-31', end: '2028-01-01' })).toBe(2);
		expect(windowDays({ start: '2027-01-10', end: '2027-01-01' })).toBe(1);
	});

	it('gives the left and right edge of a day', () => {
		expect(dateX(WIN, '2027-01-01')).toBe(0);
		expect(dateX(WIN, '2027-01-01', 'end')).toBeCloseTo(0.1);
		expect(dateX(WIN, '2027-01-10', 'end')).toBe(1);
		expect(dateX(WIN, '2027-01-06', 'start')).toBeCloseTo(0.5);
	});

	it('does not clamp', () => {
		expect(dateX(WIN, '2026-12-31')).toBeCloseTo(-0.1);
		expect(dateX(WIN, '2027-01-11', 'end')).toBeCloseTo(1.1);
	});
});

describe('monthTicks', () => {
	it('clips the first month when the window starts mid-month', () => {
		const win = { start: '2027-01-17', end: '2027-02-28' }; // 15 + 28 = 43 days
		const ticks = monthTicks(win);
		expect(ticks.map((t) => t.month)).toEqual(['2027-01-01', '2027-02-01']);
		expect(ticks[0].x0).toBe(0);
		expect(ticks[0].x1).toBeCloseTo(15 / 43);
		expect(ticks[1].x0).toBeCloseTo(15 / 43);
		expect(ticks[1].x1).toBe(1);
	});

	it('crosses a year boundary', () => {
		const win = { start: '2026-11-20', end: '2027-01-05' };
		const ticks = monthTicks(win);
		expect(ticks.map((t) => t.month)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
		expect(ticks[0].x0).toBe(0);
		expect(ticks[2].x1).toBe(1);
		expect(ticks[1].x1 - ticks[1].x0).toBeCloseTo(31 / windowDays(win));
	});

	it('gives one tick for a window inside one month', () => {
		expect(monthTicks(WIN)).toEqual([{ month: '2027-01-01', x0: 0, x1: 1 }]);
		expect(monthTicks({ start: '2027-02-01', end: '2027-01-01' })).toEqual([]);
	});
});

describe('taskMark', () => {
	it('places a bar from the left edge of the start to the right edge of the end', () => {
		const mark = taskMark(WIN, { start: '2027-01-03', end: '2027-01-05' });
		expect(mark.kind).toBe('bar');
		if (mark.kind !== 'bar') return;
		expect(mark.x0).toBeCloseTo(0.2);
		expect(mark.x1).toBeCloseTo(0.5);
		expect(mark.clipStart).toBe(false);
		expect(mark.clipEnd).toBe(false);
	});

	it('gives a one-day bar when start equals end', () => {
		const mark = taskMark(WIN, { start: '2027-01-10', end: '2027-01-10' });
		expect(mark).toMatchObject({ kind: 'bar', x1: 1, clipStart: false, clipEnd: false });
	});

	it('clips at the start', () => {
		expect(taskMark(WIN, { start: '2026-12-20', end: '2027-01-02' })).toMatchObject({
			kind: 'bar',
			x0: 0,
			clipStart: true,
			clipEnd: false
		});
	});

	it('clips at the end', () => {
		expect(taskMark(WIN, { start: '2027-01-09', end: '2027-02-01' })).toMatchObject({
			kind: 'bar',
			x1: 1,
			clipStart: false,
			clipEnd: true
		});
	});

	it('clips on both sides', () => {
		expect(taskMark(WIN, { start: '2026-12-01', end: '2027-02-01' })).toEqual({
			kind: 'bar',
			x0: 0,
			x1: 1,
			clipStart: true,
			clipEnd: true
		});
	});

	it('marks a range fully outside the window', () => {
		expect(taskMark(WIN, { start: '2026-12-01', end: '2026-12-31' })).toEqual({
			kind: 'outside',
			side: 'before'
		});
		expect(taskMark(WIN, { start: '2027-01-11', end: '2027-01-20' })).toEqual({
			kind: 'outside',
			side: 'after'
		});
	});

	it('places a point marker at the center of the day', () => {
		const start = taskMark(WIN, { start: '2027-01-01', end: null });
		expect(start.kind).toBe('point');
		if (start.kind === 'point') {
			expect(start.x).toBeCloseTo(0.05);
			expect(start.date).toBe('2027-01-01');
		}
		const end = taskMark(WIN, { start: null, end: '2027-01-10' });
		expect(end.kind).toBe('point');
		if (end.kind === 'point') expect(end.x).toBeCloseTo(0.95);
	});

	it('marks a point outside the window', () => {
		expect(taskMark(WIN, { start: '2026-12-31', end: null })).toEqual({
			kind: 'outside',
			side: 'before'
		});
		expect(taskMark(WIN, { start: null, end: '2027-01-11' })).toEqual({
			kind: 'outside',
			side: 'after'
		});
	});

	it('marks no dates and an invalid range', () => {
		expect(taskMark(WIN, { start: null, end: null })).toEqual({ kind: 'none' });
		expect(taskMark(WIN, { start: '2027-01-05', end: '2027-01-04' })).toEqual({
			kind: 'invalid'
		});
	});

	it('draws only bars and points', () => {
		expect(isDrawn({ kind: 'bar', x0: 0, x1: 1, clipStart: false, clipEnd: false })).toBe(true);
		expect(isDrawn({ kind: 'point', x: 0.5, date: '2027-01-05' })).toBe(true);
		expect(isDrawn({ kind: 'outside', side: 'before' })).toBe(false);
		expect(isDrawn({ kind: 'none' })).toBe(false);
		expect(isDrawn({ kind: 'invalid' })).toBe(false);
	});
});

describe('ganttRows', () => {
	const tasks = [
		makeTask({ id: 'b', stageId: 's1', start: '2027-01-05', end: '2027-01-06', done: true }),
		makeTask({ id: 'p', stageId: 's1' }),
		makeTask({ id: 'p2', parentId: 'p', start: '2027-01-04', end: '2027-01-04', done: true }),
		makeTask({ id: 'p1', parentId: 'p', start: '2027-01-02', end: '2027-01-03' }),
		makeTask({ id: 'q', stageId: 's2' }),
		makeTask({ id: 'q1', stageId: 's2', parentId: 'q', start: '2027-01-08' }),
		makeTask({ id: 'hidden', stageId: 's3', start: '2027-01-01', end: '2027-01-02' })
	];
	const index = indexTasks(tasks);

	it('uses table order, shows subtasks only under an expanded parent, and skips other stages', () => {
		const rows = ganttRows(index, ['s1', 's2'], (id) => id === 'p', WIN);
		expect(rows.map((r) => [r.id, r.level, r.row])).toEqual([
			['p', 0, 0],
			['p1', 1, 1],
			['p2', 1, 2],
			['b', 0, 3],
			['q', 0, 4]
		]);
		expect(rows[0]).toMatchObject({ isParent: true, expanded: true, parentId: null });
		expect(rows[1]).toMatchObject({ parentId: 'p', isParent: false, expanded: false });
		expect(rows[4]).toMatchObject({ isParent: true, expanded: false, stageId: 's2' });
	});

	it('follows the stage order that the caller gives', () => {
		const rows = ganttRows(index, ['s2', 's1'], () => false, WIN);
		expect(rows.map((r) => r.id)).toEqual(['q', 'p', 'b']);
	});

	it('uses the effective dates and done state', () => {
		const rows = ganttRows(index, ['s1', 's2'], () => false, WIN);
		const p = rows.find((r) => r.id === 'p')!;
		expect(p.done).toBe('partial');
		expect(p.mark).toMatchObject({ kind: 'bar' });
		if (p.mark.kind === 'bar') {
			expect(p.mark.x0).toBeCloseTo(0.1);
			expect(p.mark.x1).toBeCloseTo(0.4);
		}
		expect(rows.find((r) => r.id === 'b')!.done).toBe('done');
		expect(rows.find((r) => r.id === 'q')!.mark.kind).toBe('point');
	});

	it('does not expand a task without subtasks', () => {
		const rows = ganttRows(index, ['s1'], () => true, WIN);
		expect(rows.find((r) => r.id === 'b')!.expanded).toBe(false);
	});
});

describe('dependencyLines', () => {
	// x (Jan 1–2) is the predecessor. Parent p has subtasks a (Jan 3–4) and c (Jan 5–6).
	const base = () => [
		makeTask({ id: 'x', start: '2027-01-01', end: '2027-01-02' }),
		makeTask({ id: 'p' }),
		makeTask({ id: 'a', parentId: 'p', start: '2027-01-03', end: '2027-01-04', dependsOn: ['x'] }),
		makeTask({ id: 'c', parentId: 'p', start: '2027-01-05', end: '2027-01-06' }),
		makeTask({ id: 'y', start: '2027-01-08', end: '2027-01-09', dependsOn: ['c'] })
	];

	function lines(tasks: ReturnType<typeof base>, expanded: string[]) {
		const index = indexTasks(tasks);
		const rows = ganttRows(index, ['s1'], (id) => expanded.includes(id), WIN);
		return dependencyLines(index, rows).map((l) => ({
			key: l.key,
			x0: +l.x0.toFixed(3),
			row0: l.row0,
			x1: +l.x1.toFixed(3),
			row1: l.row1
		}));
	}

	it('connects to the subtask that owns the dependency when the parent is expanded', () => {
		// Rows: x 0, p 1, a 2, c 3, y 4.
		expect(lines(base(), ['p'])).toEqual([
			{ key: 'x->a', x0: 0.2, row0: 0, x1: 0.2, row1: 2 },
			{ key: 'c->y', x0: 0.6, row0: 3, x1: 0.7, row1: 4 }
		]);
	});

	it('connects to the parent bar when the parent is collapsed', () => {
		// Rows: x 0, p 1, y 2.
		expect(lines(base(), [])).toEqual([
			{ key: 'x->p', x0: 0.2, row0: 0, x1: 0.2, row1: 1 },
			{ key: 'p->y', x0: 0.6, row0: 1, x1: 0.7, row1: 2 }
		]);
	});

	it('draws the own dependency of an expanded parent from the parent bar', () => {
		const tasks = base();
		tasks.find((t) => t.id === 'p')!.dependsOn = ['x', 'a', 'p', 'gone'];
		tasks.find((t) => t.id === 'a')!.dependsOn = [];
		expect(lines(tasks, ['p']).map((l) => l.key)).toEqual(['x->p', 'c->y']);
	});

	it('merges duplicate lines', () => {
		const tasks = base();
		tasks.find((t) => t.id === 'c')!.dependsOn = ['x'];
		expect(lines(tasks, []).map((l) => l.key)).toEqual(['x->p', 'p->y']);
		expect(lines(tasks, ['p']).map((l) => l.key)).toEqual(['x->a', 'x->c', 'c->y']);
	});

	it('merges lines from two subtasks of a collapsed predecessor', () => {
		const tasks = base();
		tasks.find((t) => t.id === 'y')!.dependsOn = ['a', 'c'];
		expect(lines(tasks, []).map((l) => l.key)).toEqual(['x->p', 'p->y']);
	});

	it('draws no line to or from a task without a drawn mark', () => {
		const tasks = base();
		tasks.find((t) => t.id === 'x')!.start = null;
		tasks.find((t) => t.id === 'x')!.end = null;
		tasks.find((t) => t.id === 'y')!.start = '2027-02-01';
		tasks.find((t) => t.id === 'y')!.end = '2027-02-02';
		expect(lines(tasks, ['p'])).toEqual([]);
		expect(lines(tasks, [])).toEqual([]);
	});

	it('uses the center of a point marker', () => {
		const tasks = base();
		tasks.find((t) => t.id === 'x')!.end = null; // point at Jan 1
		expect(lines(tasks, ['p'])[0]).toEqual({ key: 'x->a', x0: 0.05, row0: 0, x1: 0.2, row1: 2 });
	});

	it('skips a dependency in a stage without rows', () => {
		const tasks = [
			makeTask({ id: 'z', stageId: 's2', start: '2027-01-01', end: '2027-01-01' }),
			makeTask({ id: 'w', start: '2027-01-02', end: '2027-01-02', dependsOn: ['z'] })
		];
		const index = indexTasks(tasks);
		expect(
			dependencyLines(
				index,
				ganttRows(index, ['s1'], () => false, WIN)
			)
		).toEqual([]);
	});

	it('sorts by dependent row, then by predecessor row', () => {
		const tasks = [
			makeTask({ id: 'm', start: '2027-01-01', end: '2027-01-01' }),
			makeTask({ id: 'n', start: '2027-01-02', end: '2027-01-02' }),
			makeTask({ id: 'o', start: '2027-01-03', end: '2027-01-03', dependsOn: ['n', 'm'] })
		];
		const index = indexTasks(tasks);
		const result = dependencyLines(
			index,
			ganttRows(index, ['s1'], () => false, WIN)
		);
		expect(result.map((l) => l.key)).toEqual(['m->o', 'n->o']);
	});
});

describe('todayX, spanX and milestoneX', () => {
	it('gives the center of today inside the window, also on the edges', () => {
		expect(todayX(WIN, '2027-01-05')).toBeCloseTo(0.45);
		expect(todayX(WIN, '2027-01-01')).toBeCloseTo(0.05);
		expect(todayX(WIN, '2027-01-10')).toBeCloseTo(0.95);
	});

	it('gives null for today outside the window', () => {
		expect(todayX(WIN, '2026-12-31')).toBeNull();
		expect(todayX(WIN, '2027-01-11')).toBeNull();
	});

	it('clips a band span and gives null when it is fully outside', () => {
		const inside = spanX(WIN, { start: '2027-01-02', end: '2027-01-03' })!;
		expect(inside.x0).toBeCloseTo(0.1);
		expect(inside.x1).toBeCloseTo(0.3);
		expect(spanX(WIN, { start: '2026-12-01', end: '2027-03-01' })).toEqual({ x0: 0, x1: 1 });
		expect(spanX(WIN, { start: '2026-12-01', end: '2026-12-31' })).toBeNull();
		expect(spanX(WIN, { start: '2027-01-11', end: '2027-01-12' })).toBeNull();
		expect(spanX(WIN, { start: '2027-01-05', end: '2027-01-02' })).toBeNull();
	});

	it('gives the center of a milestone day, or null when it is outside', () => {
		expect(milestoneX(WIN, '2027-01-06')).toBeCloseTo(0.55);
		expect(milestoneX(WIN, '2026-12-31')).toBeNull();
		expect(milestoneX(WIN, '2027-01-11')).toBeNull();
	});
});

describe('visibleBands and visibleMilestones', () => {
	const band = (id: string, start: string, end: string) => ({
		id,
		title: id,
		start,
		end,
		color: 'blue' as const
	});
	const milestone = (id: string, date: string) => ({
		id,
		title: id,
		description: '',
		date,
		symbol: 'diamond' as const
	});

	it('keeps the bands in the window and clips them', () => {
		const result = visibleBands(WIN, [
			band('a', '2026-12-01', '2026-12-31'),
			band('b', '2026-12-20', '2027-01-03'),
			band('c', '2027-01-09', '2027-02-01')
		]);
		expect(result.map((r) => r.band.id)).toEqual(['b', 'c']);
		expect(result[0].x0).toBe(0);
		expect(result[0].x1).toBeCloseTo(0.3);
		expect(result[1].x1).toBe(1);
	});

	it('keeps the milestones in the window in date order, with the labels of all milestones', () => {
		const result = visibleMilestones(WIN, [
			milestone('late', '2027-02-01'),
			milestone('b', '2027-01-06'),
			milestone('a', '2027-01-02')
		]);
		expect(result.map((r) => [r.label, r.milestone.id])).toEqual([
			['M1', 'a'],
			['M2', 'b']
		]);
		expect(result[1].x).toBeCloseTo(0.55);
	});
});
