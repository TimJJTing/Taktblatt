import { describe, expect, it } from 'vitest';
import {
	expandParents,
	effectiveDependencies,
	inheritedDependencies,
	indexTasks
} from './derive.ts';
import {
	applyMove,
	canDependOn,
	candidateWarnings,
	dependencyWarnings,
	deleteImpact,
	deleteTasks,
	isValidMoveTarget,
	moveConflicts,
	stageDeleteImpact
} from './dependencies.ts';
import { mentionToken } from './mentions.ts';
import { makePlan, makeTask } from './test-helpers.ts';

describe('effectiveDependencies', () => {
	it('keeps parent dependencies separate from stored subtask dependencies', () => {
		const index = indexTasks([
			makeTask({ id: 'x' }),
			makeTask({ id: 'y' }),
			makeTask({ id: 'p', dependsOn: ['x'] }),
			makeTask({ id: 'a', parentId: 'p', dependsOn: ['y'] }),
			makeTask({ id: 'b', parentId: 'p', dependsOn: ['a'] })
		]);
		expect([...effectiveDependencies(index, 'p')]).toEqual(['x']);
		expect([...effectiveDependencies(index, 'b')]).toEqual(['a', 'x']);
	});
	it('filters invalid ids and own subtasks from task dependencies without losing dependency order', () => {
		const index = indexTasks([
			makeTask({ id: 'x' }),
			makeTask({ id: 'q' }),
			makeTask({ id: 'qc', parentId: 'q' }),
			makeTask({ id: 'p', dependsOn: ['qc', 'x', 'c', 'p', 'missing'] }),
			makeTask({ id: 'c', parentId: 'p' }),
			makeTask({ id: 't', dependsOn: ['qc', 'x', 't', 'missing'] })
		]);
		expect([...effectiveDependencies(index, 'p')]).toEqual(['qc', 'x']);
		expect([...effectiveDependencies(index, 't')]).toEqual(['qc', 'x']);
	});
	it('does not show subtask dependencies as inherited parent dependencies', () => {
		const index = indexTasks([
			makeTask({ id: 'x' }),
			makeTask({ id: 'p' }),
			makeTask({ id: 's', parentId: 'p', dependsOn: ['x'] })
		]);
		expect(inheritedDependencies(index, 'p')).toEqual([]);
	});
});

describe('subtask dependencies', () => {
	it('keeps legacy external and sibling dependencies with inherited dependencies in stored order', () => {
		const index = indexTasks([
			makeTask({ id: 'x' }),
			makeTask({ id: 'y' }),
			makeTask({ id: 'z' }),
			makeTask({ id: 'p', dependsOn: ['y', 'x', 'z', 'missing'] }),
			makeTask({ id: 'sibling', parentId: 'p' }),
			makeTask({ id: 's', parentId: 'p', dependsOn: ['sibling', 'x', 's', 'missing'] })
		]);
		expect([...effectiveDependencies(index, 's')]).toEqual(['sibling', 'x', 'y', 'z']);
	});

	it('lists only dependencies absent from the subtask with the parent as source', () => {
		const index = indexTasks([
			makeTask({ id: 'x' }),
			makeTask({ id: 'y' }),
			makeTask({ id: 'z' }),
			makeTask({ id: 'p', dependsOn: ['z', 'x', 'y'] }),
			makeTask({ id: 's', parentId: 'p', dependsOn: ['x'] })
		]);
		expect(inheritedDependencies(index, 's')).toEqual([
			{ depId: 'z', fromId: 'p' },
			{ depId: 'y', fromId: 'p' }
		]);
	});
});

describe('canDependOn', () => {
	it('rejects itself, its parent and its subtask', () => {
		const index = indexTasks([makeTask({ id: 'p' }), makeTask({ id: 'c', parentId: 'p' })]);
		expect(canDependOn(index, 'p', 'p')).toBe(false);
		expect(canDependOn(index, 'c', 'p')).toBe(false);
		expect(canDependOn(index, 'p', 'c')).toBe(false);
	});

	it('allows a candidate that breaks the date rule', () => {
		const index = indexTasks([
			makeTask({ id: 'a', start: '2027-02-01' }),
			makeTask({ id: 'b', end: '2027-01-31' })
		]);
		expect(canDependOn(index, 'b', 'a')).toBe(true);
		expect(canDependOn(index, 'a', 'b')).toBe(true);
	});

	it('allows candidates with empty dates', () => {
		const index = indexTasks([makeTask({ id: 'a' }), makeTask({ id: 'b', end: '2027-01-01' })]);
		expect(canDependOn(index, 'b', 'a')).toBe(true);
	});

	it('allows a cycle in the effective graph', () => {
		const index = indexTasks([
			makeTask({ id: 'p' }),
			makeTask({ id: 'x', parentId: 'p', dependsOn: ['yc'] }),
			makeTask({ id: 'yc', parentId: 'p' })
		]);
		expect(canDependOn(index, 'yc', 'x')).toBe(true);
	});

	it('allows a parent dependency when its candidate reaches an inheriting subtask', () => {
		const index = indexTasks([
			makeTask({ id: 'p' }),
			makeTask({ id: 's', parentId: 'p' }),
			makeTask({ id: 'x', dependsOn: ['s'] })
		]);
		expect(canDependOn(index, 'p', 'x')).toBe(true);
	});

	it('allows a dependency on a subtask that inherits a dependency on the dependent', () => {
		const index = indexTasks([
			makeTask({ id: 'p', dependsOn: ['x'] }),
			makeTask({ id: 's', parentId: 'p' }),
			makeTask({ id: 'x' })
		]);
		expect(canDependOn(index, 'x', 's')).toBe(true);
	});

	it('rejects external tasks and subtasks even when they would not create a cycle', () => {
		const index = indexTasks([
			makeTask({ id: 'p' }),
			makeTask({ id: 's', parentId: 'p' }),
			makeTask({ id: 'q' }),
			makeTask({ id: 't', parentId: 'q' })
		]);
		expect(canDependOn(index, 's', 'q')).toBe(false);
		expect(canDependOn(index, 's', 't')).toBe(false);
	});

	it('allows a task to depend on another parent and its subtask', () => {
		const index = indexTasks([
			makeTask({ id: 'p' }),
			makeTask({ id: 's', parentId: 'p' }),
			makeTask({ id: 'x' })
		]);
		expect(canDependOn(index, 'x', 'p')).toBe(true);
		expect(canDependOn(index, 'x', 's')).toBe(true);
	});

	it('does not add a sibling dependency to the parent graph', () => {
		const index = indexTasks([
			makeTask({ id: 'p' }),
			makeTask({ id: 's', parentId: 'p' }),
			makeTask({ id: 't', parentId: 'p', dependsOn: ['x'] }),
			makeTask({ id: 'x', dependsOn: ['p'] })
		]);
		expect(canDependOn(index, 's', 't')).toBe(true);
	});

	it('rejects a dependency already inherited from the parent, including in a loaded cycle', () => {
		const x = makeTask({ id: 'x' });
		const tasks = [
			makeTask({ id: 'p', dependsOn: ['x'] }),
			makeTask({ id: 's', parentId: 'p' }),
			x
		];
		expect(canDependOn(indexTasks(tasks), 's', 'x')).toBe(false);
		x.dependsOn = ['s'];
		expect(canDependOn(indexTasks(tasks), 's', 'x')).toBe(false);
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

describe('candidateWarnings', () => {
	it('warns when the candidate reaches the dependent', () => {
		const index = indexTasks([makeTask({ id: 'a' }), makeTask({ id: 'b', dependsOn: ['a'] })]);
		expect(candidateWarnings(index, 'a', 'b')).toEqual(['cycle']);
	});

	it('warns when the candidate starts after the dependent ends', () => {
		const index = indexTasks([
			makeTask({ id: 'a', end: '2027-01-01' }),
			makeTask({ id: 'b', start: '2027-02-01' })
		]);
		expect(candidateWarnings(index, 'a', 'b')).toEqual(['date']);
	});

	it('reports cycle and date warnings together', () => {
		const index = indexTasks([
			makeTask({ id: 'a', end: '2027-01-01' }),
			makeTask({ id: 'b', start: '2027-02-01', dependsOn: ['a'] })
		]);
		expect(candidateWarnings(index, 'a', 'b')).toEqual(['cycle', 'date']);
	});

	it('does not warn about an acyclic candidate with compatible dates', () => {
		const index = indexTasks([
			makeTask({ id: 'a', end: '2027-02-01' }),
			makeTask({ id: 'b', start: '2027-01-01' })
		]);
		expect(candidateWarnings(index, 'a', 'b')).toEqual([]);
	});

	it('checks the new edges inherited by subtasks of the dependent', () => {
		const index = indexTasks([
			makeTask({ id: 'p' }),
			makeTask({ id: 's', parentId: 'p' }),
			makeTask({ id: 'x', dependsOn: ['s'] })
		]);
		expect(candidateWarnings(index, 'p', 'x')).toEqual(['cycle']);
	});

	it('excludes inheriting nodes that already have the candidate edge', () => {
		const index = indexTasks([
			makeTask({ id: 'p' }),
			makeTask({ id: 's', parentId: 'p', dependsOn: ['x'] }),
			makeTask({ id: 'x', dependsOn: ['s'] })
		]);
		// The existing S ↔ X cycle gets no new edge. Only P → X is new.
		expect(candidateWarnings(index, 'p', 'x')).toEqual([]);
	});
});

describe('dependencyWarnings', () => {
	it('warns once on each stored edge of a two-task cycle and excludes edges outside it', () => {
		const index = indexTasks([
			makeTask({ id: 'a', dependsOn: ['b', 'outside'] }),
			makeTask({ id: 'b', dependsOn: ['a'] }),
			makeTask({ id: 'outside' }),
			makeTask({ id: 'incoming', dependsOn: ['a'] })
		]);
		expect(dependencyWarnings(index)).toEqual([
			{ kind: 'cycle', taskId: 'a', dependencyId: 'b' },
			{ kind: 'cycle', taskId: 'b', dependencyId: 'a' }
		]);
	});

	it('attributes an inherited cycle edge to the parent that stores it', () => {
		const index = indexTasks([
			makeTask({ id: 'p', dependsOn: ['x'] }),
			makeTask({ id: 'x', dependsOn: ['s'] }),
			makeTask({ id: 's', parentId: 'p' })
		]);
		// P is outside the S ↔ X component, but P owns the inherited S → X edge.
		expect(dependencyWarnings(index)).toEqual([
			{ kind: 'cycle', taskId: 'p', dependencyId: 'x' },
			{ kind: 'cycle', taskId: 'x', dependencyId: 's' }
		]);
	});

	it('warns once on a parent-stored dependency with several cyclic inherited edges', () => {
		const index = indexTasks([
			makeTask({ id: 'p', dependsOn: ['x'] }),
			makeTask({ id: 'x', dependsOn: ['s', 't'] }),
			makeTask({ id: 's', parentId: 'p' }),
			makeTask({ id: 't', parentId: 'p' })
		]);
		expect(dependencyWarnings(index)).toEqual([
			{ kind: 'cycle', taskId: 'p', dependencyId: 'x' },
			{ kind: 'cycle', taskId: 'x', dependencyId: 's' },
			{ kind: 'cycle', taskId: 'x', dependencyId: 't' }
		]);
	});

	it('warns on each edge of a 10 000-task chain with one back edge in under one second', () => {
		const tasks = Array.from({ length: 10_000 }, (_, i) =>
			makeTask({ id: `t${i}`, dependsOn: [i === 9_999 ? 't0' : `t${i + 1}`] })
		);
		const index = indexTasks(tasks);
		const start = performance.now();
		const warnings = dependencyWarnings(index);
		const elapsed = performance.now() - start;
		expect(warnings).toHaveLength(tasks.length);
		expect(new Set(warnings.map((w) => `${w.taskId}→${w.dependencyId}`)).size).toBe(tasks.length);
		expect(warnings).toEqual(
			tasks.map((task) => ({
				kind: 'cycle',
				taskId: task.id,
				dependencyId: task.dependsOn[0]
			}))
		);
		expect(elapsed).toBeLessThan(1_000);
	});

	it('lists stored dependencies that break the date rule', () => {
		const index = indexTasks([
			makeTask({ id: 'a', start: '2027-03-01' }),
			makeTask({ id: 'b', end: '2027-02-01', dependsOn: ['a'] })
		]);
		expect(dependencyWarnings(index)).toEqual([{ kind: 'date', taskId: 'b', dependencyId: 'a' }]);
	});
	it('does not report an inherited edge as a stored date warning', () => {
		const index = indexTasks([
			makeTask({ id: 'x', start: '2027-02-01' }),
			makeTask({ id: 'p', dependsOn: ['x'] }),
			makeTask({ id: 's', parentId: 'p', end: '2027-01-01' })
		]);
		expect(dependencyWarnings(index)).toEqual([{ kind: 'date', taskId: 'p', dependencyId: 'x' }]);
	});
	it('warns on legacy external subtask dependencies but not siblings or task dependencies', () => {
		const index = indexTasks([
			makeTask({ id: 'p' }),
			makeTask({ id: 'a', parentId: 'p' }),
			makeTask({ id: 'q' }),
			makeTask({ id: 'b', parentId: 'q' }),
			makeTask({ id: 's', parentId: 'p', dependsOn: ['a', 'q', 'b'] }),
			makeTask({ id: 't', dependsOn: ['s'] })
		]);
		expect(dependencyWarnings(index)).toEqual([
			{ kind: 'subtask_scope', taskId: 's', dependencyId: 'q' },
			{ kind: 'subtask_scope', taskId: 's', dependencyId: 'b' }
		]);
	});

	it('reports both warning kinds for the same stored dependency', () => {
		const index = indexTasks([
			makeTask({ id: 'p' }),
			makeTask({ id: 'x', start: '2027-03-01' }),
			makeTask({ id: 's', parentId: 'p', end: '2027-02-01', dependsOn: ['x'] })
		]);
		expect(dependencyWarnings(index)).toHaveLength(2);
		expect(dependencyWarnings(index)).toEqual(
			expect.arrayContaining([
				{ kind: 'date', taskId: 's', dependencyId: 'x' },
				{ kind: 'subtask_scope', taskId: 's', dependencyId: 'x' }
			])
		);
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
	it('keeps a stored early start when the first subtask starts later', () => {
		const plan = makePlan([
			makeTask({ id: 'a→a', start: '2027-01-01', end: '2027-01-02', dependsOn: ['a'] }),
			makeTask({ id: 'a', start: '2027-01-05', end: '2027-01-06', dependsOn: ['a→a'] }),
			makeTask({ id: 't', start: '2027-01-09', end: '2027-01-10' })
		]);
		expect(moveConflicts(plan, 't', { stageId: 's1', parentId: 'a→a' })).toEqual({
			fixes: [],
			warnings: []
		});
	});

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

	it('removes a non-sibling dependency when a task becomes a subtask', () => {
		// Scope fixes apply even when the dependency would not create a cycle.
		const plan = makePlan([
			makeTask({ id: 'p' }),
			makeTask({ id: 'pc', parentId: 'p' }),
			makeTask({ id: 'd' }),
			makeTask({ id: 't', dependsOn: ['d'] })
		]);
		const conflicts = moveConflicts(plan, 't', { stageId: 's1', parentId: 'p' });
		expect(conflicts.fixes).toEqual([
			{ kind: 'remove-scope-dependency', taskId: 't', dependencyId: 'd' }
		]);
		applyMove(plan, 't', { stageId: 's1', parentId: 'p' }, conflicts.fixes);
		expect(plan.tasks.find((task) => task.id === 't')).toMatchObject({
			parentId: 'p',
			dependsOn: []
		});
	});

	it('finds a direct dependency of the moved task on its new parent', () => {
		const plan = makePlan([makeTask({ id: 'p' }), makeTask({ id: 't', dependsOn: ['p'] })]);
		expect(moveConflicts(plan, 't', { stageId: 's1', parentId: 'p' }).fixes).toEqual([
			{ kind: 'remove-scope-dependency', taskId: 't', dependencyId: 'p' }
		]);
	});

	it.each([null, 'q'])(
		'removes incoming old sibling dependencies when moving to %s',
		(parentId) => {
			const plan = makePlan([
				makeTask({ id: 'p' }),
				makeTask({ id: 's', parentId: 'p', dependsOn: ['t'] }),
				makeTask({ id: 't', parentId: 'p', dependsOn: ['s'] }),
				makeTask({ id: 'q' }),
				makeTask({ id: 'legacy', parentId: 'q', dependsOn: ['t'] })
			]);
			const target = { stageId: 's1', parentId };
			const conflicts = moveConflicts(plan, 't', target);
			const fixes = [{ kind: 'remove-scope-dependency', taskId: 's', dependencyId: 't' }];
			if (parentId !== null)
				fixes.push({
					kind: 'remove-scope-dependency',
					taskId: 't',
					dependencyId: 's'
				});
			expect(conflicts.fixes).toHaveLength(fixes.length);
			expect(conflicts.fixes).toEqual(expect.arrayContaining(fixes));
			expect(conflicts.warnings).toEqual([]);
			applyMove(plan, 't', target, conflicts.fixes);
			expect(plan.tasks.find((task) => task.id === 's')!.dependsOn).toEqual([]);
			expect(plan.tasks.find((task) => task.id === 't')!.dependsOn).toEqual(
				parentId === null ? ['s'] : []
			);
			expect(plan.tasks.find((task) => task.id === 'legacy')!.dependsOn).toEqual(['t']);
		}
	);

	it('keeps dependencies on old siblings when a subtask becomes a task', () => {
		const plan = makePlan([
			makeTask({ id: 'p' }),
			makeTask({ id: 's', parentId: 'p' }),
			makeTask({ id: 't', parentId: 'p', dependsOn: ['s'] })
		]);
		const target = { stageId: 's1', parentId: null };
		const conflicts = moveConflicts(plan, 't', target);
		expect(conflicts).toEqual({ fixes: [], warnings: [] });
		applyMove(plan, 't', target, conflicts.fixes);
		expect(plan.tasks.find((task) => task.id === 't')).toMatchObject({
			parentId: null,
			dependsOn: ['s']
		});
	});

	it('finds a dependency of the new parent on the moved task', () => {
		const plan = makePlan([makeTask({ id: 'p', dependsOn: ['t'] }), makeTask({ id: 't' })]);
		expect(moveConflicts(plan, 't', { stageId: 's1', parentId: 'p' }).fixes).toEqual([
			{ kind: 'remove-parent-dependency', parentId: 'p' }
		]);
	});

	it('keeps the parent start when a later first subtask is moved under it', () => {
		// z depends on p. p has own dates. t (later dates) becomes the first subtask of p.
		const plan = makePlan([
			makeTask({ id: 'p', start: '2027-01-01', end: '2027-01-05' }),
			makeTask({ id: 'z', end: '2027-01-10', dependsOn: ['p'] }),
			makeTask({ id: 't', start: '2027-01-20', end: '2027-01-25' })
		]);
		const conflicts = moveConflicts(plan, 't', { stageId: 's1', parentId: 'p' });
		expect(conflicts.fixes).toEqual([]);
		applyMove(plan, 't', { stageId: 's1', parentId: 'p' }, conflicts.fixes);
		const index = indexTasks(plan.tasks);
		expect(dependencyWarnings(index)).toEqual([]);
		expect(index.state.get('p')!.eff.start).toBe('2027-01-01');
	});

	it('does not warn when moving out an early subtask leaves the planned start unchanged', () => {
		// p has subtasks a (early) and b (late). z depends on p and ends before b starts.
		// The stored start stays early when a moves out.
		const plan = makePlan([
			makeTask({ id: 'p' }),
			makeTask({ id: 'a', parentId: 'p', start: '2027-01-01', end: '2027-01-02' }),
			makeTask({ id: 'b', parentId: 'p', start: '2027-01-20', end: '2027-01-25' }),
			makeTask({ id: 'z', end: '2027-01-10', dependsOn: ['p'] })
		]);
		expandParents(plan);
		const conflicts = moveConflicts(plan, 'a', { stageId: 's1', parentId: null });
		expect(conflicts.fixes).toEqual([]);
		expect(conflicts.warnings).toEqual([]);
	});

	it('moves the subtasks of a task with the task to the new stage', () => {
		const plan = makePlan(
			[makeTask({ id: 'p' }), makeTask({ id: 'c', parentId: 'p' })],
			['s1', 's2']
		);
		applyMove(plan, 'p', { stageId: 's2', parentId: null }, []);
		expect(plan.tasks.map((t) => t.stageId)).toEqual(['s2', 's2']);
	});

	it('keeps the stored parent end when the first subtask ends earlier', () => {
		const plan = makePlan([
			makeTask({ id: 'x', start: '2027-01-15', end: '2027-01-20' }),
			makeTask({ id: 'p', start: '2027-01-16', end: '2027-01-25', dependsOn: ['x'] }),
			makeTask({ id: 't', start: '2027-01-01', end: '2027-01-10' })
		]);
		const conflicts = moveConflicts(plan, 't', { stageId: 's1', parentId: 'p' });
		expect(conflicts.fixes).toEqual([]);
		applyMove(plan, 't', { stageId: 's1', parentId: 'p' }, conflicts.fixes);
		const index = indexTasks(plan.tasks);
		expect(dependencyWarnings(index)).toEqual([]);
		expect(index.state.get('p')!.eff.end).toBe('2027-01-25');
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

	it('allows a move that creates a cycle only through the new inherited dependency', () => {
		const plan = makePlan([
			makeTask({ id: 'p', dependsOn: ['x'] }),
			makeTask({ id: 'x', dependsOn: ['s'] }),
			makeTask({ id: 's' })
		]);
		const target = { stageId: 's1', parentId: 'p' };
		expect(moveConflicts(plan, 's', target)).toEqual({ fixes: [], warnings: [] });
		applyMove(plan, 's', target, []);
		expect([...effectiveDependencies(indexTasks(plan.tasks), 's')]).toEqual(['x']);
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

describe('planned windows after subtask removal', () => {
	it.each(['delete', 'move-to-task', 'move-to-parent'] as const)(
		'keeps all parent values after %s of its last subtask',
		(action) => {
			const parent = makeTask({
				id: 'p',
				start: '2027-01-01',
				end: '2027-01-05',
				owners: ['Own'],
				status: 'todo'
			});
			const plan = makePlan([
				parent,
				makeTask({
					id: 'c',
					parentId: 'p',
					start: '2027-03-01',
					end: '2027-03-31',
					owners: ['Child'],
					status: 'done'
				}),
				makeTask({ id: 'q' })
			]);
			expandParents(plan);
			const expected = {
				start: '2027-01-01',
				end: '2027-03-31',
				owners: ['Own', 'Child'],
				status: 'done'
			};
			expect(parent).toMatchObject(expected);
			expect(indexTasks(plan.tasks).state.get('p')!.eff).toEqual(expected);
			const before = structuredClone(parent);
			if (action === 'delete') deleteTasks(plan, ['c']);
			else
				applyMove(
					plan,
					'c',
					{ stageId: 's1', parentId: action === 'move-to-parent' ? 'q' : null },
					[]
				);
			expandParents(plan);
			expect(parent).toEqual(before);
			expect(indexTasks(plan.tasks).state.get('p')!.eff).toEqual(expected);
		}
	);

	it('keeps the expanded status and window when all subtasks are deleted together', () => {
		const parent = makeTask({ id: 'p', owners: ['Own'] });
		const plan = makePlan([
			parent,
			makeTask({ id: 'a', parentId: 'p', start: '2027-01-01', status: 'done' }),
			makeTask({ id: 'b', parentId: 'p', end: '2027-03-31', status: 'canceled', owners: ['Child'] })
		]);
		expandParents(plan);
		expect(parent).toMatchObject({
			start: '2027-01-01',
			end: '2027-03-31',
			owners: ['Own', 'Child'],
			status: 'done'
		});
		const before = structuredClone(parent);
		deleteTasks(plan, ['a', 'b']);
		expandParents(plan);
		expect(plan.tasks).toEqual([before]);
	});

	it('keeps the old parent window when move fixes clear the last subtask end', () => {
		const parent = makeTask({ id: 'p', start: '2027-02-05', end: '2027-02-10', owners: ['Own'] });
		const plan = makePlan([
			parent,
			makeTask({
				id: 'c',
				parentId: 'p',
				start: '2027-02-01',
				end: '2027-02-20',
				owners: ['Child'],
				status: 'done'
			}),
			makeTask({ id: 'q', dependsOn: ['dep'] }),
			makeTask({ id: 'dep', start: '2027-03-01' })
		]);
		expandParents(plan);
		const before = structuredClone(parent);
		const target = { stageId: 's1', parentId: 'q' };
		const conflicts = moveConflicts(plan, 'c', target);
		expect(conflicts.fixes).toContainEqual({
			kind: 'clear-date',
			field: 'end',
			dependencyId: 'dep',
			dependentId: 'q'
		});
		applyMove(plan, 'c', target, conflicts.fixes);
		expandParents(plan);
		expect(plan.tasks.find((task) => task.id === 'c')?.end).toBeNull();
		expect(parent).toEqual(before);
	});

	it('uses the stored window for old-parent warnings without mutating the plan', () => {
		const plan = makePlan([
			makeTask({ id: 'p', start: '2027-01-01', end: '2027-01-05' }),
			makeTask({ id: 'c', parentId: 'p', start: '2027-03-01', end: '2027-03-31' }),
			makeTask({ id: 'dependent', end: '2027-02-01', dependsOn: ['p'] })
		]);
		expandParents(plan);
		const before = structuredClone(plan);
		expect(moveConflicts(plan, 'c', { stageId: 's1', parentId: null })).toEqual({
			fixes: [],
			warnings: []
		});
		expect(plan).toEqual(before);
	});
});
