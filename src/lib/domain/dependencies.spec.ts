import { describe, expect, it } from 'vitest';
import { effectiveDependencies, inheritedDependencies, indexTasks } from './derive.ts';
import {
	applyMove,
	canDependOn,
	dateWarnings,
	deleteImpact,
	deleteTasks,
	isValidMoveTarget,
	moveConflicts,
	stageDeleteImpact
} from './dependencies.ts';
import { mentionToken } from './mentions.ts';
import { makePlan, makeTask } from './test-helpers.ts';

describe('effectiveDependencies', () => {
	it('gives a parent the union of its own and its subtask dependencies, minus its subtasks', () => {
		const index = indexTasks([
			makeTask({ id: 'x' }),
			makeTask({ id: 'y' }),
			makeTask({ id: 'p', dependsOn: ['x'] }),
			makeTask({ id: 'a', parentId: 'p', dependsOn: ['y'] }),
			makeTask({ id: 'b', parentId: 'p', dependsOn: ['a'] })
		]);
		expect([...effectiveDependencies(index, 'p')].sort()).toEqual(['x', 'y']);
		expect([...effectiveDependencies(index, 'b')]).toEqual(['a']);
		expect(inheritedDependencies(index, 'p')).toEqual([{ depId: 'y', fromId: 'a' }]);
	});
});

describe('canDependOn', () => {
	it('rejects itself, its parent and its subtask', () => {
		const index = indexTasks([makeTask({ id: 'p' }), makeTask({ id: 'c', parentId: 'p' })]);
		expect(canDependOn(index, 'p', 'p')).toBe(false);
		expect(canDependOn(index, 'c', 'p')).toBe(false);
		expect(canDependOn(index, 'p', 'c')).toBe(false);
	});

	it('rejects a candidate that breaks the date rule', () => {
		const index = indexTasks([
			makeTask({ id: 'a', start: '2027-02-01' }),
			makeTask({ id: 'b', end: '2027-01-31' })
		]);
		expect(canDependOn(index, 'b', 'a')).toBe(false);
		expect(canDependOn(index, 'a', 'b')).toBe(true);
	});

	it('allows candidates with empty dates', () => {
		const index = indexTasks([makeTask({ id: 'a' }), makeTask({ id: 'b', end: '2027-01-01' })]);
		expect(canDependOn(index, 'b', 'a')).toBe(true);
	});

	it('rejects a cycle in the effective graph', () => {
		// x depends on y. If a subtask of y depends on x, then y → x and x → y.
		const index = indexTasks([
			makeTask({ id: 'x', dependsOn: ['y'] }),
			makeTask({ id: 'y' }),
			makeTask({ id: 'yc', parentId: 'y' })
		]);
		expect(canDependOn(index, 'yc', 'x')).toBe(false);
	});

	it('allows a dependency between siblings', () => {
		const index = indexTasks([
			makeTask({ id: 'p' }),
			makeTask({ id: 'a', parentId: 'p' }),
			makeTask({ id: 'b', parentId: 'p' })
		]);
		expect(canDependOn(index, 'b', 'a')).toBe(true);
	});

	it('rejects a duplicate dependency or an unknown task id', () => {
		const index = indexTasks([makeTask({ id: 'a' }), makeTask({ id: 'b', dependsOn: ['a'] })]);
		expect(canDependOn(index, 'b', 'a')).toBe(false);
		expect(canDependOn(index, 'b', 'unknown')).toBe(false);
		expect(canDependOn(index, 'unknown', 'a')).toBe(false);
	});
});

describe('dateWarnings', () => {
	it('lists stored dependencies that break the date rule', () => {
		const index = indexTasks([
			makeTask({ id: 'a', start: '2027-03-01' }),
			makeTask({ id: 'b', end: '2027-02-01', dependsOn: ['a'] })
		]);
		expect(dateWarnings(index)).toEqual([{ taskId: 'b', dependencyId: 'a' }]);
	});
});

describe('deleteTasks', () => {
	it('removes subtasks, dependency references and mentions, and reports the impact', () => {
		const plan = makePlan([
			makeTask({ id: 'p' }),
			makeTask({ id: 'c', parentId: 'p' }),
			makeTask({
				id: 'u',
				dependsOn: ['c'],
				note: `See ${mentionToken('c')} and ${mentionToken('u')}.`
			}),
			makeTask({ id: 'v', dependsOn: ['p'] })
		]);
		expect(deleteImpact(plan, ['p'])).toEqual({ ids: ['p', 'c'], subtasks: 1, dependents: 2 });
		deleteTasks(plan, ['p']);
		expect(plan.tasks.map((t) => t.id)).toEqual(['u', 'v']);
		expect(plan.tasks[0].dependsOn).toEqual([]);
		expect(plan.tasks[0].note).toBe(`See and ${mentionToken('u')}.`);
		expect(plan.tasks[1].dependsOn).toEqual([]);
	});
});

describe('moves', () => {
	it('allows only valid structure targets', () => {
		const plan = makePlan(
			[
				makeTask({ id: 'p' }),
				makeTask({ id: 'c', parentId: 'p' }),
				makeTask({ id: 't' }),
				makeTask({ id: 'o', stageId: 's2' })
			],
			['s1', 's2']
		);
		expect(isValidMoveTarget(plan, 't', { stageId: 's1', parentId: 'p' })).toBe(true);
		expect(isValidMoveTarget(plan, 'p', { stageId: 's1', parentId: 't' })).toBe(false);
		expect(isValidMoveTarget(plan, 't', { stageId: 's1', parentId: 'c' })).toBe(false);
		expect(isValidMoveTarget(plan, 't', { stageId: 's2', parentId: 'p' })).toBe(false);
		expect(isValidMoveTarget(plan, 'c', { stageId: 's1', parentId: null })).toBe(true);
	});

	it('has no conflicts for a stage move', () => {
		const plan = makePlan([makeTask({ id: 't', dependsOn: [] })], ['s1', 's2']);
		expect(moveConflicts(plan, 't', { stageId: 's2', parentId: null })).toEqual({
			fixes: [],
			warnings: []
		});
	});

	it('finds a dependency of the moved task that causes a cycle', () => {
		// d depends on p. Move t (which depends on d) under p: p → d → p.
		const plan = makePlan([
			makeTask({ id: 'p' }),
			makeTask({ id: 'pc', parentId: 'p' }),
			makeTask({ id: 'd', dependsOn: ['p'] }),
			makeTask({ id: 't', dependsOn: ['d'] })
		]);
		const conflicts = moveConflicts(plan, 't', { stageId: 's1', parentId: 'p' });
		expect(conflicts.fixes).toEqual([{ kind: 'remove-cycle-dependency', dependencyId: 'd' }]);
	});

	it('finds a direct dependency of the moved task on its new parent', () => {
		const plan = makePlan([makeTask({ id: 'p' }), makeTask({ id: 't', dependsOn: ['p'] })]);
		expect(moveConflicts(plan, 't', { stageId: 's1', parentId: 'p' }).fixes).toEqual([
			{ kind: 'remove-cycle-dependency', dependencyId: 'p' }
		]);
	});

	it('finds a dependency of the new parent on the moved task', () => {
		const plan = makePlan([makeTask({ id: 'p', dependsOn: ['t'] }), makeTask({ id: 't' })]);
		expect(moveConflicts(plan, 't', { stageId: 's1', parentId: 'p' }).fixes).toEqual([
			{ kind: 'remove-parent-dependency', parentId: 'p' }
		]);
	});

	it('finds date conflicts when the first subtask replaces the fallback dates of the parent', () => {
		// z depends on p. p has own dates. t (later dates) becomes the first subtask of p.
		const plan = makePlan([
			makeTask({ id: 'p', start: '2027-01-01', end: '2027-01-05' }),
			makeTask({ id: 'z', end: '2027-01-10', dependsOn: ['p'] }),
			makeTask({ id: 't', start: '2027-01-20', end: '2027-01-25' })
		]);
		const conflicts = moveConflicts(plan, 't', { stageId: 's1', parentId: 'p' });
		expect(conflicts.fixes).toEqual([
			{ kind: 'clear-date', field: 'start', dependencyId: 'p', dependentId: 'z' }
		]);
		applyMove(plan, 't', { stageId: 's1', parentId: 'p' }, conflicts.fixes);
		const index = indexTasks(plan.tasks);
		expect(dateWarnings(index)).toEqual([]);
		expect(index.byId.get('t')!.start).toBeNull();
	});

	it('reports date breaks on the old parent as warnings only', () => {
		// p has subtasks a (early) and b (late). z depends on p and ends before b starts.
		// Moving a out of p makes p start late, so p.start > z.end.
		const plan = makePlan([
			makeTask({ id: 'p' }),
			makeTask({ id: 'a', parentId: 'p', start: '2027-01-01', end: '2027-01-02' }),
			makeTask({ id: 'b', parentId: 'p', start: '2027-01-20', end: '2027-01-25' }),
			makeTask({ id: 'z', end: '2027-01-10', dependsOn: ['p'] })
		]);
		const conflicts = moveConflicts(plan, 'a', { stageId: 's1', parentId: null });
		expect(conflicts.fixes).toEqual([]);
		expect(conflicts.warnings).toEqual([{ taskId: 'z', dependencyId: 'p' }]);
	});

	it('moves the subtasks of a task with the task to the new stage', () => {
		const plan = makePlan(
			[makeTask({ id: 'p' }), makeTask({ id: 'c', parentId: 'p' })],
			['s1', 's2']
		);
		applyMove(plan, 'p', { stageId: 's2', parentId: null }, []);
		expect(plan.tasks.map((t) => t.stageId)).toEqual(['s2', 's2']);
	});

	it('clears the end date when the new parent depends on a task that starts after the moved task ends', () => {
		const plan = makePlan([
			makeTask({ id: 'x', start: '2027-01-15', end: '2027-01-20' }),
			makeTask({ id: 'p', start: '2027-01-16', end: '2027-01-25', dependsOn: ['x'] }),
			makeTask({ id: 't', start: '2027-01-01', end: '2027-01-10' })
		]);
		const conflicts = moveConflicts(plan, 't', { stageId: 's1', parentId: 'p' });
		expect(conflicts.fixes).toEqual([
			{ kind: 'clear-date', field: 'end', dependencyId: 'x', dependentId: 'p' }
		]);
		applyMove(plan, 't', { stageId: 's1', parentId: 'p' }, conflicts.fixes);
		const index = indexTasks(plan.tasks);
		expect(dateWarnings(index)).toEqual([]);
		expect(index.byId.get('t')!.end).toBeNull();
	});

	it('does not re-emit pre-existing broken date edges on the new or old parent', () => {
		const plan = makePlan([
			makeTask({ id: 'x', start: '2027-02-01' }),
			makeTask({ id: 'p', dependsOn: ['x'] }),
			makeTask({ id: 'pc', parentId: 'p', start: '2027-01-01', end: '2027-01-10' }),
			makeTask({ id: 'q', dependsOn: ['x'] }),
			makeTask({ id: 'qc', parentId: 'q', start: '2027-01-01', end: '2027-01-10' }),
			makeTask({ id: 't', parentId: 'q', start: '2027-01-02', end: '2027-01-05' })
		]);
		expect(moveConflicts(plan, 't', { stageId: 's1', parentId: 'p' })).toEqual({
			fixes: [],
			warnings: []
		});
	});

	it('allows a dependency on a sibling when moving under the same parent', () => {
		const plan = makePlan([
			makeTask({ id: 'p' }),
			makeTask({ id: 's', parentId: 'p' }),
			makeTask({ id: 't', dependsOn: ['s'] })
		]);
		expect(moveConflicts(plan, 't', { stageId: 's1', parentId: 'p' })).toEqual({
			fixes: [],
			warnings: []
		});
	});
});

describe('deleteImpact', () => {
	it('counts actual removed subtasks for repeated, overlapping and unknown roots', () => {
		const plan = makePlan([
			makeTask({ id: 'p' }),
			makeTask({ id: 'c', parentId: 'p' }),
			makeTask({ id: 'other', dependsOn: ['c'] })
		]);
		expect(deleteImpact(plan, ['p', 'p', 'c', 'missing'])).toEqual({
			ids: ['p', 'c'],
			subtasks: 1,
			dependents: 1
		});
		expect(deleteImpact(plan, ['missing'])).toEqual({ ids: [], subtasks: 0, dependents: 0 });
		// A subtask alone is not a subtask of the deletion.
		expect(deleteImpact(plan, ['c'])).toEqual({ ids: ['c'], subtasks: 0, dependents: 1 });
		expect(deleteImpact(plan, ['p'])).toMatchObject({ ids: ['p', 'c'], subtasks: 1 });
	});
});

describe('stageDeleteImpact', () => {
	it('counts stage tasks, subtasks and external dependents', () => {
		const plan = makePlan(
			[
				makeTask({ id: 'p' }),
				makeTask({ id: 'c', parentId: 'p' }),
				makeTask({ id: 'other', stageId: 's2', dependsOn: ['p', 'c'] })
			],
			['s1', 's2']
		);
		expect(stageDeleteImpact(plan, 's1')).toEqual({ tasks: 2, dependents: 1 });
		expect(stageDeleteImpact(plan, 'missing')).toEqual({ tasks: 0, dependents: 0 });
	});
});
