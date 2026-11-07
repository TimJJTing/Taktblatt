import { describe, expect, it } from 'vitest';
import {
	effectiveValues,
	hasValidRange,
	indexTasks,
	orderedMilestones,
	stageDeliverables,
	stageProgress,
	stageSpan,
	tasksSpan
} from './derive.ts';
import { makeTask } from './test-helpers.ts';

describe('effectiveValues', () => {
	it('uses the own values of a task without subtasks', () => {
		const t = makeTask({
			id: 'a',
			start: '2027-01-02',
			end: '2027-01-05',
			owners: [' Ann ', 'ann'],
			status: 'done'
		});
		expect(effectiveValues(t)).toEqual({
			start: '2027-01-02',
			end: '2027-01-05',
			owners: ['Ann'],
			status: 'done'
		});
	});

	it('derives the values of a parent from its subtasks and hides the fallback values', () => {
		const p = makeTask({
			id: 'p',
			start: '2026-01-01',
			end: '2026-12-31',
			owners: ['Old'],
			status: 'done'
		});
		const c1 = makeTask({
			id: 'c1',
			parentId: 'p',
			start: '2027-01-05',
			end: '2027-01-09',
			owners: ['Bo'],
			status: 'done'
		});
		const c2 = makeTask({
			id: 'c2',
			parentId: 'p',
			start: null,
			end: '2027-01-20',
			owners: ['bo', 'Cy']
		});
		expect(effectiveValues(p, [c1, c2])).toEqual({
			start: '2027-01-05',
			end: '2027-01-20',
			owners: ['Bo', 'Cy'],
			status: 'in_progress'
		});
	});

	it.each([
		{ children: ['done', 'done'], expected: 'done' },
		{ children: ['todo', 'todo'], expected: 'todo' },
		{ children: ['done', 'todo'], expected: 'in_progress' },
		{ children: ['in_progress', 'todo'], expected: 'in_progress' },
		{ children: ['done', 'in_progress'], expected: 'in_progress' }
	] as const)('derives $expected from $children', ({ children, expected }) => {
		const parent = makeTask({ id: 'p', status: 'done' });
		const subtasks = children.map((status, i) => makeTask({ id: `c${i}`, parentId: 'p', status }));
		expect(effectiveValues(parent, subtasks).status).toBe(expected);
		expect(parent.status).toBe('done');
	});

	it('gives empty dates when all subtasks have empty dates', () => {
		const p = makeTask({ id: 'p', start: '2027-01-01', end: '2027-01-02' });
		expect(effectiveValues(p, [makeTask({ id: 'c', parentId: 'p' })]).start).toBeNull();
	});
});

describe('indexTasks sort rule', () => {
	it('sorts by start, then createdAt, and puts tasks without start last', () => {
		const tasks = [
			makeTask({ id: 'none' }),
			makeTask({ id: 'late', start: '2027-02-01' }),
			makeTask({ id: 'early', start: '2027-01-01' }),
			makeTask({ id: 'early2', start: '2027-01-01' })
		];
		const order = indexTasks(tasks)
			.stageTasks.get('s1')!
			.map((t) => t.id);
		expect(order).toEqual(['early', 'early2', 'late', 'none']);
	});

	it('sorts a parent by its derived start and sorts subtasks in their parent', () => {
		const tasks = [
			makeTask({ id: 'a', start: '2027-01-10' }),
			makeTask({ id: 'p', start: '2027-12-01' }),
			makeTask({ id: 'c2', parentId: 'p', start: '2027-01-06' }),
			makeTask({ id: 'c1', parentId: 'p', start: '2027-01-05' })
		];
		const index = indexTasks(tasks);
		expect(index.stageTasks.get('s1')!.map((t) => t.id)).toEqual(['p', 'a']);
		expect(index.children.get('p')!.map((t) => t.id)).toEqual(['c1', 'c2']);
	});
});

describe('stage values', () => {
	const tasks = [
		makeTask({
			id: 'a',
			start: '2027-01-03',
			end: '2027-01-08',
			deliverable: 'Doc',
			status: 'done'
		}),
		makeTask({ id: 'b', end: '2027-02-10', deliverable: ' ' }),
		makeTask({ id: 'c', parentId: 'b', status: 'done' }),
		makeTask({ id: 'x', stageId: 's2' })
	];
	const index = indexTasks(tasks);

	it('counts done tasks without subtasks', () => {
		expect(stageProgress(index, 's1')).toEqual({ done: 2, inProgress: 0, total: 2 });
	});

	it('counts level-1 effective statuses and excludes children and other stages', () => {
		const index = indexTasks([
			makeTask({ id: 'done', status: 'done' }),
			makeTask({ id: 'parent', status: 'done' }),
			makeTask({ id: 'c1', parentId: 'parent', status: 'done' }),
			makeTask({ id: 'c2', parentId: 'parent', status: 'todo' }),
			makeTask({ id: 'todo' }),
			makeTask({ id: 'other', stageId: 's2', status: 'in_progress' })
		]);
		expect(stageProgress(index, 's1')).toEqual({ done: 1, inProgress: 1, total: 3 });
		expect(stageProgress(index, 'empty')).toEqual({ done: 0, inProgress: 0, total: 0 });
	});

	it('lists deliverables and skips empty values', () => {
		expect(stageDeliverables(index, 's1')).toEqual(['Doc']);
	});

	it('calculates the span of a stage', () => {
		expect(stageSpan(index, 's1')).toEqual({ start: '2027-01-03', end: '2027-01-08' });
		expect(stageSpan(index, 's2')).toBeNull();
	});
});

describe('hasValidRange', () => {
	it('accepts non-empty ranges where start is on or before end', () => {
		expect(hasValidRange({ start: '2027-01-05', end: '2027-01-05' })).toBe(true);
		expect(hasValidRange({ start: '2027-01-01', end: '2027-01-05' })).toBe(true);
		expect(hasValidRange({ start: '2027-01-06', end: '2027-01-05' })).toBe(false);
		expect(hasValidRange({ start: '2027-01-01', end: null })).toBe(false);
		expect(hasValidRange({ start: null, end: '2027-01-05' })).toBe(false);
		expect(hasValidRange({ start: null, end: null })).toBe(false);
	});
});

describe('orderedMilestones', () => {
	it('labels milestones in date order and breaks ties by id', () => {
		const result = orderedMilestones([
			{ id: 'c', title: 'Late', description: '', date: '2027-03-01', symbol: 'flag' },
			{ id: 'b', title: 'Second', description: '', date: '2027-01-01', symbol: 'star' },
			{ id: 'a', title: 'First', description: '', date: '2027-01-01', symbol: 'diamond' }
		]);
		expect(result.map((r) => `${r.label} ${r.milestone.title}`)).toEqual([
			'M1 First',
			'M2 Second',
			'M3 Late'
		]);
	});
});

describe('tasksSpan', () => {
	it('uses effective dates and excludes hidden parent fallback dates', () => {
		const index = indexTasks([
			makeTask({ id: 'parent', start: '2026-01-01', end: '2028-12-31' }),
			makeTask({ id: 'child', parentId: 'parent', start: '2027-02-01', end: '2027-02-10' }),
			makeTask({ id: 'other', stageId: 's2', start: '2027-01-01', end: '2027-03-01' })
		]);
		expect(tasksSpan(index)).toEqual({ start: '2027-01-01', end: '2027-03-01' });
	});

	it('returns null when only hidden fallback dates are set', () => {
		const index = indexTasks([
			makeTask({ id: 'parent', start: '2027-01-01', end: '2027-02-01' }),
			makeTask({ id: 'child', parentId: 'parent' })
		]);
		expect(tasksSpan(index)).toBeNull();
	});

	it('includes dates when only one endpoint is set', () => {
		const index = indexTasks([
			makeTask({ id: 'end-only', end: '2027-01-01' }),
			makeTask({ id: 'start-only', start: '2027-02-01' })
		]);
		expect(tasksSpan(index)).toEqual({ start: '2027-01-01', end: '2027-02-01' });
	});

	it('returns null for empty plans and tasks without dates', () => {
		expect(tasksSpan(indexTasks([]))).toBeNull();
		expect(tasksSpan(indexTasks([makeTask({ id: 'a' })]))).toBeNull();
	});
});
