import { describe, expect, it } from 'vitest';
import { dependencyWarnings } from './dependencies.ts';
import { indexTasks } from './derive.ts';
import { makePlan } from './test-helpers.ts';
import { routeMapModel } from './route-map.ts';
import { adr13Plan, groupingPlan, task } from '#lib/scene/route-map.test-helpers.ts';

const stored = (edges: ReturnType<typeof routeMapModel>['edges']) =>
	edges.flatMap((e) => e.stored.map((s) => `${s.taskId}:${s.dependencyId}`)).sort();

describe('Route map model', () => {
	it('keeps undated and closed top-level work, empty stages and family identity', () => {
		const plan = makePlan(
			[
				task({ id: 'P' }),
				task({ id: 'S', parentId: 'P' }),
				task({ id: 'done', status: 'done' }),
				task({ id: 'canceled', status: 'canceled' })
			],
			['s1', 'empty']
		);
		const closed = routeMapModel(plan, new Set());
		const open = routeMapModel(plan, new Set(['P']));
		expect(closed.nodes.map((n) => n.id).sort()).toEqual(['P', 'canceled', 'done']);
		expect(open.nodes.map((n) => n.id).sort()).toEqual(['P', 'S', 'canceled', 'done']);
		expect(closed.groups.find((g) => g.id === 'P')!.taskIds).toEqual(['P', 'S']);
		expect(closed.stages.map((s) => [s.id, s.toGo])).toEqual([
			['s1', 1],
			['empty', 0]
		]);
		expect(routeMapModel(makePlan([], []), new Set()).stages).toEqual([]);
	});

	it('counts D51 top-level effective open work independently of expansion', () => {
		const plan = makePlan(
			[
				task({ id: 'P' }),
				...['a', 'b', 'c'].map((id) => task({ id, parentId: 'P' })),
				task({ id: 'standalone' }),
				task({ id: 'cancel', stageId: 'canceled', status: 'canceled' }),
				task({ id: 'family', stageId: 'family' }),
				task({ id: 'child', stageId: 'family', parentId: 'family', status: 'canceled' }),
				task({ id: 'done', stageId: 'done', status: 'done' })
			],
			['s1', 'canceled', 'family', 'done', 'empty']
		);
		for (const expanded of [new Set<string>(), new Set(['P', 'family'])]) {
			expect(routeMapModel(plan, expanded).stages.map((s) => s.toGo)).toEqual([2, 0, 0, 0, 0]);
		}
	});

	it('derives readiness from effective inherited work and status from the children', () => {
		const plan = makePlan([
			task({ id: 'up' }),
			task({ id: 'P', dependsOn: ['up'] }),
			task({ id: 'S', parentId: 'P' }),
			task({ id: 'doneFamily' }),
			task({ id: 'doneChild', parentId: 'doneFamily', status: 'done' }),
			task({ id: 'down', dependsOn: ['doneFamily'] })
		]);
		const model = routeMapModel(plan, new Set(['P']));
		expect(model.nodes.find((n) => n.id === 'doneFamily')).toMatchObject({ status: 'done' });
	});

	it('proxies hidden predecessors, omits hidden dependents and inherited duplicates', () => {
		const plan = makePlan([
			task({ id: 'up' }),
			task({ id: 'P', dependsOn: ['up'] }),
			task({ id: 'S', parentId: 'P' }),
			task({ id: 'T', parentId: 'P', dependsOn: ['S', 'up'] }),
			task({ id: 'down', dependsOn: ['P', 'S'] })
		]);
		const closed = routeMapModel(plan, new Set());
		expect(stored(closed.edges)).toEqual(['P:up', 'down:P', 'down:S']);
		expect(closed.edges.find((e) => e.key === 'P->down')!.stored).toEqual([
			{ taskId: 'down', dependencyId: 'P' },
			{ taskId: 'down', dependencyId: 'S' }
		]);
		const open = routeMapModel(plan, new Set(['P']));
		expect(stored(open.edges)).toEqual(['P:up', 'T:S', 'T:up', 'down:P', 'down:S']);
		expect(open.effectivePairs).toContainEqual({ from: 'up', to: 'S' });
		expect(open.edges.some((e) => e.from === 'up' && e.to === 'S')).toBe(false);
		expect(open.warnings).toContainEqual({
			kind: 'subtask_scope',
			taskId: 'T',
			dependencyId: 'up'
		});
	});

	it('preserves the ADR 13 stored warning identities in both expand states', () => {
		const plan = adr13Plan();
		for (const expanded of [new Set<string>(), new Set(['P'])]) {
			const model = routeMapModel(plan, expanded);
			expect(model.warnings).toEqual(dependencyWarnings(indexTasks(plan.tasks)));
			expect(stored(model.edges)).toEqual(['P:X', 'X:S']);
			expect(model.edges.every((e) => e.cycle)).toBe(true);
			expect(model.edges.find((e) => e.to === 'X')!.from).toBe(expanded.size ? 'S' : 'P');
		}
	});

	it('ORs cycle flags when one warned and one unwarned stored edge share a proxy', () => {
		const plan = makePlan([
			task({ id: 'P' }),
			task({ id: 'S', parentId: 'P', dependsOn: ['X'] }),
			task({ id: 'X', dependsOn: ['P', 'S'] })
		]);
		const warnings = dependencyWarnings(indexTasks(plan.tasks));
		expect(warnings.filter((w) => w.kind === 'cycle')).toEqual(
			expect.arrayContaining([{ taskId: 'X', dependencyId: 'S', kind: 'cycle' }])
		);
		expect(
			warnings.some((w) => w.taskId === 'X' && w.dependencyId === 'P' && w.kind === 'cycle')
		).toBe(false);
		const edge = routeMapModel(plan, new Set()).edges.find((e) => e.key === 'P->X')!;
		expect(edge.stored).toHaveLength(2);
		expect(edge.cycle).toBe(true);
	});

	it('does not turn an acyclic effective graph into cycle warnings by grouping families', () => {
		const plan = groupingPlan();
		for (const expanded of [new Set<string>(), new Set(['P', 'Q'])]) {
			const model = routeMapModel(plan, expanded);
			expect(model.warnings).toEqual([{ kind: 'subtask_scope', taskId: 'T', dependencyId: 'X' }]);
			expect(model.edges.every((e) => !e.cycle)).toBe(true);
		}
	});
});
