import { describe, expect, it } from 'vitest';
import {
	boardColumn,
	effectiveOf,
	effectiveValues,
	hasValidRange,
	indexTasks,
	orderedMilestones,
	readyLight,
	stageDeliverables,
	stageProgress,
	stageSpan,
	squashSubtasks,
	mergeIntoParent,
	tasksSpan,
	type Readiness,
	type TaskState
} from './derive.ts';
import { createExamplePlan } from './example.ts';
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
		{ children: ['canceled', 'canceled'], expected: 'canceled' },
		{ children: ['done', 'canceled'], expected: 'done' },
		{ children: ['todo', 'canceled'], expected: 'todo' },
		{ children: ['in_progress', 'canceled'], expected: 'in_progress' },
		{ children: ['done', 'todo', 'canceled'], expected: 'in_progress' },
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

	it('excludes canceled leaves and derived canceled parents from progress totals', () => {
		const tasks = [
			makeTask({ id: 'canceled', status: 'canceled' }),
			makeTask({ id: 'parent', status: 'done' }),
			makeTask({ id: 'child', parentId: 'parent', status: 'canceled' })
		];
		expect(stageProgress(indexTasks(tasks), 's1')).toEqual({ done: 0, inProgress: 0, total: 0 });
		expect(
			stageProgress(
				indexTasks([
					...tasks,
					makeTask({ id: 'done1', status: 'done' }),
					makeTask({ id: 'done2', status: 'done' }),
					makeTask({ id: 'todo' }),
					makeTask({ id: 'working', status: 'in_progress' })
				]),
				's1'
			)
		).toEqual({ done: 2, inProgress: 1, total: 4 });
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

describe('indexTasks state', () => {
	it('caches effective leaf values and readiness when all dependencies are finished', () => {
		const index = indexTasks([
			makeTask({ id: 'a', status: 'done' }),
			makeTask({ id: 'b', status: 'done' }),
			makeTask({ id: 't', dependsOn: ['a', 'b'], start: '2099-01-01', owners: [' Ann ', 'ann'] })
		]);
		expect(index.state.get('t')).toEqual({
			eff: { start: '2099-01-01', end: null, owners: ['Ann'], status: 'todo' },
			finished: false,
			readiness: { kind: 'ready', via: 'dependencies', count: 2 }
		});
	});

	it('blocks a todo leaf only on its unfinished effective dependency', () => {
		const index = indexTasks([
			makeTask({ id: 'done', status: 'done' }),
			makeTask({ id: 'open', status: 'in_progress' }),
			makeTask({ id: 't', dependsOn: ['done', 'open'] })
		]);
		expect(index.state.get('t')!.readiness).toEqual({
			kind: 'blocked',
			blockers: [{ kind: 'task', id: 'open' }]
		});
	});

	it('turns on the light for a ready todo leaf without dependencies', () => {
		const index = indexTasks([makeTask({ id: 't' })]);
		const readiness = index.state.get('t')!.readiness;
		expect(readiness).toEqual({ kind: 'ready', via: 'dependencies', count: 0 });
		expect(readyLight(readiness)).toEqual({ via: 'dependencies', count: 0 });
	});

	it.each([
		{ status: 'in_progress', finished: false },
		{ status: 'done', finished: true },
		{ status: 'canceled', finished: true }
	] as const)('makes $status inactive and caches finished=$finished', ({ status, finished }) => {
		const index = indexTasks([
			makeTask({ id: 'dep', status: 'done' }),
			makeTask({ id: 't', status, dependsOn: ['dep'] })
		]);
		expect(index.state.get('t')).toEqual({
			eff: { start: null, end: null, owners: [], status },
			finished,
			readiness: { kind: 'inactive' }
		});
	});

	it('accepts canceled dependencies, including a derived canceled parent', () => {
		const index = indexTasks([
			makeTask({ id: 'canceled', status: 'canceled' }),
			makeTask({ id: 'parent', status: 'todo', dependsOn: ['canceled'] }),
			makeTask({ id: 'child', parentId: 'parent', status: 'canceled' }),
			makeTask({ id: 'direct', dependsOn: ['canceled'] }),
			makeTask({ id: 'derived', dependsOn: ['parent'] })
		]);
		expect(index.state.get('parent')).toMatchObject({
			eff: { status: 'canceled' },
			finished: true,
			readiness: { kind: 'inactive' }
		});
		for (const id of ['direct', 'derived']) {
			expect(index.state.get(id)!.readiness).toEqual({
				kind: 'ready',
				via: 'dependencies',
				count: 1
			});
		}
	});

	it("uses a parent dependency's derived status instead of its stored status", () => {
		const parent = makeTask({ id: 'parent', status: 'done' });
		const child = makeTask({ id: 'child', parentId: 'parent' });
		const dependent = makeTask({ id: 't', dependsOn: ['parent'] });
		const state = () => indexTasks([dependent, parent, child]).state;
		expect(state().get('t')!.readiness).toEqual({
			kind: 'blocked',
			blockers: [{ kind: 'task', id: 'parent' }]
		});
		child.status = 'done';
		parent.status = 'todo';
		expect(state().get('t')!.readiness).toEqual({ kind: 'ready', via: 'dependencies', count: 1 });
	});

	it('uses ready subtask counts and the derived status for parent readiness', () => {
		const own = makeTask({ id: 'own', status: 'done' });
		const inherited = makeTask({ id: 'inherited' });
		const parent = makeTask({ id: 'p', status: 'done', dependsOn: ['own'] });
		const child = makeTask({ id: 'c', parentId: 'p', dependsOn: ['inherited'] });
		const state = () => indexTasks([own, inherited, parent, child]).state.get('p')!;
		expect(state()).toMatchObject({
			eff: { status: 'todo' },
			finished: false,
			readiness: {
				kind: 'blocked',
				blockers: [{ kind: 'task', id: 'inherited' }]
			}
		});
		inherited.status = 'done';
		expect(state().readiness).toEqual({ kind: 'ready', via: 'subtasks', count: 1 });
		for (const status of ['in_progress', 'done'] as const) {
			child.status = status;
			expect(state()).toMatchObject({
				eff: { status },
				finished: status === 'done',
				readiness: { kind: 'inactive' }
			});
		}
	});

	it('turns the light off when a ready task starts or finishes, or its dependency restarts', () => {
		const dependency = makeTask({ id: 'dependency', status: 'done' });
		const task = makeTask({ id: 'task', dependsOn: ['dependency'] });
		const readiness = () => indexTasks([dependency, task]).state.get(task.id)!.readiness;
		expect(readyLight(readiness())).toEqual({ via: 'dependencies', count: 1 });
		task.status = 'in_progress';
		expect(readiness()).toEqual({ kind: 'inactive' });
		task.status = 'done';
		expect(readiness()).toEqual({ kind: 'inactive' });
		task.status = 'todo';
		dependency.status = 'in_progress';
		expect(readiness()).toEqual({
			kind: 'blocked',
			blockers: [{ kind: 'task', id: 'dependency' }]
		});
	});

	it('unions todo subtask blockers in subtask order, then dependency order', () => {
		const index = indexTasks([
			makeTask({ id: 'x' }),
			makeTask({ id: 'y' }),
			makeTask({ id: 'z' }),
			makeTask({ id: 'done', status: 'done' }),
			makeTask({ id: 'p', dependsOn: ['y', 'done'] }),
			makeTask({ id: 'c2', parentId: 'p', start: '2027-02-01', dependsOn: ['z', 'x'] }),
			makeTask({ id: 'c1', parentId: 'p', start: '2027-01-01', dependsOn: ['x', 'y'] }),
			makeTask({ id: 'canceled', parentId: 'p', status: 'canceled', dependsOn: ['done'] })
		]);
		expect(index.state.get('p')!.readiness).toEqual({
			kind: 'blocked',
			blockers: [
				{ kind: 'task', id: 'x' },
				{ kind: 'task', id: 'y' },
				{ kind: 'task', id: 'z' }
			]
		});
	});

	it('keeps sibling blockers when no todo subtask is ready and ignores canceled subtask blockers', () => {
		const index = indexTasks([
			makeTask({ id: 'p' }),
			makeTask({ id: 'a', parentId: 'p', dependsOn: ['b'] }),
			makeTask({ id: 'b', parentId: 'p', dependsOn: ['a'] }),
			makeTask({ id: 'c', parentId: 'p', status: 'canceled', dependsOn: ['x'] }),
			makeTask({ id: 'x' })
		]);
		expect(index.state.get('p')).toMatchObject({
			eff: { status: 'todo' },
			readiness: {
				kind: 'blocked',
				blockers: [
					{ kind: 'task', id: 'b' },
					{ kind: 'task', id: 'a' }
				]
			}
		});
	});

	it('deduplicates leaf blockers in effective order and filters self and unknown ids', () => {
		const index = indexTasks([
			makeTask({ id: 'x' }),
			makeTask({ id: 'y' }),
			makeTask({ id: 'p', dependsOn: ['y', 'x'] }),
			makeTask({ id: 's', parentId: 'p', dependsOn: ['x', 'missing', 's', 'x'] })
		]);
		expect(index.state.get('s')!.readiness).toEqual({
			kind: 'blocked',
			blockers: [
				{ kind: 'task', id: 'x' },
				{ kind: 'task', id: 'y' }
			]
		});
	});

	it('blocks a subtask on a parent dependency and counts it once when finished', () => {
		const own = makeTask({ id: 'own', status: 'canceled' });
		const inherited = makeTask({ id: 'inherited' });
		const tasks = [
			makeTask({ id: 'p', dependsOn: ['inherited', 'own'] }),
			makeTask({ id: 's', parentId: 'p', dependsOn: ['own'] }),
			own,
			inherited
		];
		expect(indexTasks(tasks).state.get('s')!.readiness).toEqual({
			kind: 'blocked',
			blockers: [{ kind: 'task', id: 'inherited' }]
		});
		inherited.status = 'done';
		expect(indexTasks(tasks).state.get('s')!.readiness).toEqual({
			kind: 'ready',
			via: 'dependencies',
			count: 2
		});
	});

	it('makes a todo parent ready when some subtasks are ready and counts only those subtasks', () => {
		const index = indexTasks([
			makeTask({ id: 'p' }),
			makeTask({ id: 'a', parentId: 'p' }),
			makeTask({ id: 'b', parentId: 'p', dependsOn: ['a'] }),
			makeTask({ id: 'c', parentId: 'p' })
		]);
		expect(index.state.get('p')).toMatchObject({
			eff: { status: 'todo' },
			readiness: { kind: 'ready', via: 'subtasks', count: 2 }
		});
	});

	it('keeps a ready todo parent when its other subtask is canceled', () => {
		const index = indexTasks([
			makeTask({ id: 'p' }),
			makeTask({ id: 'b', parentId: 'p' }),
			makeTask({ id: 'c', parentId: 'p', status: 'canceled' })
		]);
		expect(index.state.get('p')).toMatchObject({
			eff: { status: 'todo' },
			readiness: { kind: 'ready', via: 'subtasks', count: 1 }
		});
		expect(index.state.get('c')!.readiness).toEqual({ kind: 'inactive' });
	});

	it('keeps a mixed done and ready parent inactive while its todo subtask is ready', () => {
		const index = indexTasks([
			makeTask({ id: 'p' }),
			makeTask({ id: 'a', parentId: 'p', status: 'done' }),
			makeTask({ id: 'b', parentId: 'p', dependsOn: ['a'] })
		]);
		expect(index.state.get('p')).toMatchObject({
			eff: { status: 'in_progress' },
			readiness: { kind: 'inactive' }
		});
		expect(index.state.get('b')!.readiness).toEqual({
			kind: 'ready',
			via: 'dependencies',
			count: 1
		});
	});

	it('computes the same state regardless of task input order', () => {
		const tasks = [
			makeTask({ id: 'dependent', dependsOn: ['parent'] }),
			makeTask({ id: 'parent', status: 'todo', dependsOn: ['done'] }),
			makeTask({ id: 'child', parentId: 'parent', status: 'done' }),
			makeTask({ id: 'done', status: 'done' })
		];
		const forward = indexTasks(tasks);
		const reverse = indexTasks([...tasks].reverse());
		expect(forward.state.get('dependent')!.readiness).toEqual({
			kind: 'ready',
			via: 'dependencies',
			count: 1
		});
		for (const task of tasks)
			expect(reverse.state.get(task.id)).toEqual(forward.state.get(task.id));
	});

	it('builds leaf readiness before parent readiness regardless of input order in an inherited cycle', () => {
		const tasks = [
			makeTask({ id: 'p', dependsOn: ['x'] }),
			makeTask({ id: 's', parentId: 'p' }),
			makeTask({ id: 'x', dependsOn: ['s'] })
		];
		for (const input of [tasks, [...tasks].reverse()]) {
			const index = indexTasks(input);
			for (const id of ['p', 's']) {
				expect(index.state.get(id)!.readiness).toEqual({
					kind: 'blocked',
					blockers: [{ kind: 'task', id: 'x' }]
				});
			}
			expect(index.state.get('x')!.readiness).toEqual({
				kind: 'blocked',
				blockers: [{ kind: 'task', id: 's' }]
			});
		}
	});

	it('computes direct blockers for cyclic candidate indexes without recursive readiness', () => {
		const index = indexTasks([
			makeTask({ id: 'a', dependsOn: ['b'] }),
			makeTask({ id: 'b', dependsOn: ['a'] })
		]);
		expect(index.state.get('a')!.readiness).toEqual({
			kind: 'blocked',
			blockers: [{ kind: 'task', id: 'b' }]
		});
		expect(index.state.get('b')!.readiness).toEqual({
			kind: 'blocked',
			blockers: [{ kind: 'task', id: 'a' }]
		});
	});

	it('keeps a plain index snapshot until the caller rebuilds it after a mutation', () => {
		const task = makeTask({ id: 't' });
		const index = indexTasks([task]);
		task.status = 'done';
		expect(index.state.get('t')).toMatchObject({
			finished: false,
			readiness: { kind: 'ready', via: 'dependencies', count: 0 }
		});
		expect(effectiveOf(index, 't')).toMatchObject({ status: 'todo' });
		expect(indexTasks([task]).state.get('t')).toMatchObject({
			eff: { status: 'done' },
			finished: true,
			readiness: { kind: 'inactive' }
		});
	});
});

describe('readyLight', () => {
	it.each([
		{
			readiness: { kind: 'ready', via: 'dependencies', count: 2 },
			expected: { via: 'dependencies', count: 2 }
		},
		{
			readiness: { kind: 'ready', via: 'subtasks', count: 1 },
			expected: { via: 'subtasks', count: 1 }
		},
		{ readiness: { kind: 'blocked', blockers: [{ kind: 'task', id: 'dep' }] }, expected: null },
		{ readiness: { kind: 'inactive' }, expected: null }
	] satisfies { readiness: Readiness; expected: { via: string; count: number } | null }[])(
		'returns $expected for $readiness',
		({ readiness, expected }) => {
			expect(readyLight(readiness)).toEqual(expected);
		}
	);
});

describe('boardColumn', () => {
	it.each([
		{
			status: 'todo',
			readiness: { kind: 'blocked', blockers: [{ kind: 'task', id: 'dep' }] },
			expected: 'blocked'
		},
		{
			status: 'todo',
			readiness: { kind: 'ready', via: 'dependencies', count: 0 },
			expected: 'todo'
		},
		{ status: 'in_progress', readiness: { kind: 'inactive' }, expected: 'in_progress' },
		{ status: 'done', readiness: { kind: 'inactive' }, expected: 'done' },
		{ status: 'canceled', readiness: { kind: 'inactive' }, expected: null }
	] satisfies {
		status: TaskState['eff']['status'];
		readiness: Readiness;
		expected: string | null;
	}[])('places $status with $readiness in $expected', ({ status, readiness, expected }) => {
		const state: TaskState = {
			eff: { start: null, end: null, owners: [], status },
			finished: status === 'done' || status === 'canceled',
			readiness
		};
		expect(boardColumn(state)).toBe(expected);
	});
});

describe('PR 4 example readiness', () => {
	it('has one ready stall subtask and blocks signs on booking the table', () => {
		const plan = createExamplePlan('2027-04-01');
		const stall = plan.tasks.find((task) => task.title === 'Neighbourhood stall')!;
		const children = plan.tasks.filter((task) => task.parentId === stall.id);
		expect(children.map((task) => task.title)).toEqual(['Book a table', 'Make signs']);
		const [booking, signs] = children;
		expect(booking).toMatchObject({
			start: '2027-06-05',
			end: '2027-06-05',
			owners: ['Kai'],
			status: 'todo',
			dependsOn: []
		});
		expect(signs).toMatchObject({
			start: '2027-06-12',
			end: '2027-06-12',
			owners: ['Kai'],
			status: 'todo',
			dependsOn: [booking.id]
		});
		const index = indexTasks(plan.tasks);
		expect(index.state.get(stall.id)!.readiness).toEqual({
			kind: 'ready',
			via: 'subtasks',
			count: 1
		});
		expect(index.state.get(booking.id)!.readiness).toEqual({
			kind: 'ready',
			via: 'dependencies',
			count: 0
		});
		expect(index.state.get(signs.id)!.readiness).toEqual({
			kind: 'blocked',
			blockers: [{ kind: 'task', id: booking.id }]
		});
		const sowing = plan.tasks.find((task) => task.title === 'Sowing')!;
		expect(sowing.dependsOn).toEqual([
			plan.tasks.find((task) => task.title === 'Add compost')!.id,
			plan.tasks.find((task) => task.title === 'Order seeds')!.id
		]);
	});

	it('keeps legacy blockers on the subtask and parent readiness without inheriting them as parent dependencies', () => {
		const tasks = [
			makeTask({ id: 'external' }),
			makeTask({ id: 'p' }),
			makeTask({ id: 's', parentId: 'p', dependsOn: ['external'] })
		];
		const blocked = { kind: 'blocked', blockers: [{ kind: 'task', id: 'external' }] };
		const index = indexTasks(tasks);
		expect(index.state.get('s')!.readiness).toEqual(blocked);
		expect(index.state.get('p')!.readiness).toEqual(blocked);
		tasks[0].status = 'done';
		const after = indexTasks(tasks);
		expect(after.state.get('s')!.readiness).toEqual({
			kind: 'ready',
			via: 'dependencies',
			count: 1
		});
		expect(after.state.get('p')!.readiness).toEqual({
			kind: 'ready',
			via: 'subtasks',
			count: 1
		});
	});
});

describe('squashSubtasks', () => {
	it('includes canceled dates and owners but excludes canceled status from the parent rule', () => {
		const children = [
			makeTask({
				id: 'done',
				start: '2027-02-05',
				end: '2027-02-10',
				owners: [' Ann ', 'BO'],
				status: 'done'
			}),
			makeTask({
				id: 'canceled',
				start: '2027-02-01',
				end: '2027-02-20',
				owners: ['ann', ' Cy ', ''],
				status: 'canceled'
			})
		];
		const expected = {
			start: '2027-02-01',
			end: '2027-02-20',
			owners: ['Ann', 'BO', 'Cy'],
			status: 'done'
		};
		expect(
			effectiveValues(makeTask({ id: 'parent', status: 'todo', owners: ['Hidden'] }), children)
		).toEqual(expected);
		expect(squashSubtasks(children)).toEqual(expected);
	});

	it.each([
		{ statuses: ['canceled', 'canceled'], status: 'canceled' },
		{ statuses: ['todo', 'canceled'], status: 'todo' },
		{ statuses: ['done', 'todo'], status: 'in_progress' },
		{ statuses: ['in_progress', 'canceled'], status: 'in_progress' }
	] as const)('squashes $statuses with empty dates to $status', ({ statuses, status }) => {
		expect(
			squashSubtasks(statuses.map((status, i) => makeTask({ id: String(i), status })))
		).toEqual({ start: null, end: null, owners: [], status });
	});

	it('skips empty endpoints independently', () => {
		expect(
			squashSubtasks([
				makeTask({ id: 'a', end: '2027-03-10' }),
				makeTask({ id: 'b', start: '2027-03-01' })
			])
		).toEqual({ start: '2027-03-01', end: '2027-03-10', owners: [], status: 'todo' });
	});
});

describe('mergeIntoParent', () => {
	it.each([
		{
			ownStart: '2027-01-01',
			ownEnd: '2027-12-31',
			childStart: '2027-02-01',
			childEnd: '2027-02-20',
			start: '2027-01-01',
			end: '2027-12-31'
		},
		{
			ownStart: '2027-02-05',
			ownEnd: '2027-02-10',
			childStart: '2027-02-01',
			childEnd: '2027-02-20',
			start: '2027-02-01',
			end: '2027-02-20'
		},
		{
			ownStart: null,
			ownEnd: '2027-02-10',
			childStart: '2027-02-01',
			childEnd: null,
			start: '2027-02-01',
			end: '2027-02-10'
		},
		{
			ownStart: '2027-02-01',
			ownEnd: null,
			childStart: null,
			childEnd: '2027-02-10',
			start: '2027-02-01',
			end: '2027-02-10'
		},
		{ ownStart: null, ownEnd: null, childStart: null, childEnd: null, start: null, end: null }
	] as const)(
		'merges date endpoints: $ownStart / $ownEnd with $childStart / $childEnd',
		({ ownStart, ownEnd, childStart, childEnd, start, end }) => {
			const parent = makeTask({
				id: 'p',
				start: ownStart,
				end: ownEnd,
				owners: [' Bo ', 'ANN'],
				status: 'in_progress'
			});
			const merged = mergeIntoParent(parent, {
				start: childStart,
				end: childEnd,
				owners: ['ann', 'Cy', 'bo'],
				status: 'done'
			});
			expect(merged).toMatchObject({ start, end, owners: ['Bo', 'ANN', 'Cy'], status: 'done' });
		}
	);
});
