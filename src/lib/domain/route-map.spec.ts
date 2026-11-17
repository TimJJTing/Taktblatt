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
		const index = indexTasks(plan.tasks);
		const closed = routeMapModel(plan, new Set(), index);
		const open = routeMapModel(plan, new Set(['P']), index);
		expect(closed.nodes.map((n) => n.id).sort()).toEqual(['P', 'canceled', 'done']);
		expect(open.nodes.map((n) => n.id).sort()).toEqual(['P', 'S', 'canceled', 'done']);
		expect(closed.groups.find((g) => g.id === 'P')!.taskIds).toEqual(['P', 'S']);
		expect(closed.stages.map((s) => [s.id, s.toGo])).toEqual([
			['s1', 1],
			['empty', 0]
		]);
		const emptyPlan = makePlan([], []);
		const emptyIndex = indexTasks(emptyPlan.tasks);
		expect(routeMapModel(emptyPlan, new Set(), emptyIndex).stages).toEqual([]);
	});

	it('counts top-level effective open work independently of expansion', () => {
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
		const index = indexTasks(plan.tasks);
		for (const expanded of [new Set<string>(), new Set(['P', 'family'])]) {
			expect(routeMapModel(plan, expanded, index).stages.map((s) => s.toGo)).toEqual([
				2, 0, 0, 0, 0
			]);
		}
	});

	it('uses the effective parent status from the shared index', () => {
		const plan = makePlan([
			task({ id: 'doneFamily' }),
			task({ id: 'doneChild', parentId: 'doneFamily', status: 'done' })
		]);
		const index = indexTasks(plan.tasks);
		const model = routeMapModel(plan, new Set(), index);
		expect(model.nodes.find((n) => n.id === 'doneFamily')).toMatchObject({ status: 'done' });
	});

	it('projects hidden predecessors and hidden dependents, suppresses collapsed sibling self-links, and keeps same-stage external-child rails', () => {
		const plan = makePlan([
			task({ id: 'up' }),
			task({ id: 'P', dependsOn: ['up'] }),
			task({ id: 'S', parentId: 'P' }),
			task({ id: 'T', parentId: 'P', dependsOn: ['S', 'up'] }),
			task({ id: 'down', dependsOn: ['P', 'S'] })
		]);
		const index = indexTasks(plan.tasks);
		const closed = routeMapModel(plan, new Set(), index);
		expect(stored(closed.edges)).toEqual(['P:up', 'T:up', 'down:P', 'down:S']);
		expect(closed.edges.find((e) => e.key === 'up->P')!.stored).toEqual([
			{ taskId: 'P', dependencyId: 'up' },
			{ taskId: 'T', dependencyId: 'up' }
		]);
		expect(closed.edges.find((e) => e.key === 'P->down')!.stored).toEqual([
			{ taskId: 'down', dependencyId: 'P' },
			{ taskId: 'down', dependencyId: 'S' }
		]);
		expect(closed.edges.some((e) => e.from === e.to)).toBe(false);
		const open = routeMapModel(plan, new Set(['P']), index);
		expect(stored(open.edges)).toEqual(['P:up', 'T:S', 'T:up', 'down:P', 'down:S']);
		expect(open.edges.find((e) => e.key === 'up->P')!.stored).toEqual([
			{ taskId: 'P', dependencyId: 'up' },
			{ taskId: 'T', dependencyId: 'up' }
		]);
		expect(open.edges.find((e) => e.key === 'P->down')!.stored).toEqual([
			{ taskId: 'down', dependencyId: 'P' },
			{ taskId: 'down', dependencyId: 'S' }
		]);
		expect(open.edges.find((e) => e.key === 'S->T')).toMatchObject({
			from: 'S',
			to: 'T',
			crossStage: false,
			cycle: false
		});
		expect(open.edges.some((e) => e.from === 'up' && e.to === 'S')).toBe(false);
		expect(open.warnings).toContainEqual({
			kind: 'subtask_scope',
			taskId: 'T',
			dependencyId: 'up'
		});
	});

	it('projects cross-stage hidden predecessors and dependents in both directions, handles partial expansion, and restores exact endpoints', () => {
		const plan = makePlan(
			[
				task({ id: 'P', stageId: 's1' }),
				task({ id: 'S1', stageId: 's1', parentId: 'P' }),
				task({ id: 'S2', stageId: 's1', parentId: 'P' }),
				task({ id: 'Q', stageId: 's2' }),
				task({ id: 'T1', stageId: 's2', parentId: 'Q', dependsOn: ['S1', 'P'] }),
				task({ id: 'T2', stageId: 's2', parentId: 'Q', dependsOn: ['S2'] }),
				task({ id: 'R', stageId: 's2', dependsOn: ['S1'] })
			],
			['s1', 's2']
		);
		const index = indexTasks(plan.tasks);
		const closed = routeMapModel(plan, new Set(), index);
		expect(closed.edges.find((e) => e.key === 'P->Q')).toEqual({
			key: 'P->Q',
			from: 'P',
			to: 'Q',
			crossStage: true,
			cycle: false,
			stored: [
				{ taskId: 'T1', dependencyId: 'P' },
				{ taskId: 'T1', dependencyId: 'S1' },
				{ taskId: 'T2', dependencyId: 'S2' }
			]
		});
		expect(closed.edges.find((e) => e.key === 'P->R')).toEqual({
			key: 'P->R',
			from: 'P',
			to: 'R',
			crossStage: true,
			cycle: false,
			stored: [{ taskId: 'R', dependencyId: 'S1' }]
		});
		const onlyP = routeMapModel(plan, new Set(['P']), index);
		expect(onlyP.edges.map((e) => [e.key, e.crossStage, e.stored])).toEqual([
			['P->Q', true, [{ taskId: 'T1', dependencyId: 'P' }]],
			['S1->Q', true, [{ taskId: 'T1', dependencyId: 'S1' }]],
			['S1->R', true, [{ taskId: 'R', dependencyId: 'S1' }]],
			['S2->Q', true, [{ taskId: 'T2', dependencyId: 'S2' }]]
		]);
		const onlyQ = routeMapModel(plan, new Set(['Q']), index);
		expect(onlyQ.edges.map((e) => [e.key, e.crossStage, e.stored])).toEqual([
			['P->R', true, [{ taskId: 'R', dependencyId: 'S1' }]],
			[
				'P->T1',
				true,
				[
					{ taskId: 'T1', dependencyId: 'P' },
					{ taskId: 'T1', dependencyId: 'S1' }
				]
			],
			['P->T2', true, [{ taskId: 'T2', dependencyId: 'S2' }]]
		]);
		const open = routeMapModel(plan, new Set(['P', 'Q']), index);
		expect(open.edges.map((e) => [e.key, e.crossStage, e.stored])).toEqual([
			['P->T1', true, [{ taskId: 'T1', dependencyId: 'P' }]],
			['S1->R', true, [{ taskId: 'R', dependencyId: 'S1' }]],
			['S1->T1', true, [{ taskId: 'T1', dependencyId: 'S1' }]],
			['S2->T2', true, [{ taskId: 'T2', dependencyId: 'S2' }]]
		]);
	});

	it('restores incoming and outgoing cycle endpoints across partial and full expansion', () => {
		const plan = makePlan(
			[
				task({ id: 'P', stageId: 's1' }),
				task({ id: 'S', stageId: 's1', parentId: 'P', dependsOn: ['T'] }),
				task({ id: 'Q', stageId: 's2' }),
				task({ id: 'T', stageId: 's2', parentId: 'Q', dependsOn: ['S'] })
			],
			['s1', 's2']
		);
		const index = indexTasks(plan.tasks);
		expect(
			routeMapModel(plan, new Set(), index).edges.map((e) => [
				e.key,
				e.cycle,
				e.crossStage,
				e.stored
			])
		).toEqual([
			['P->Q', true, true, [{ taskId: 'T', dependencyId: 'S' }]],
			['Q->P', true, true, [{ taskId: 'S', dependencyId: 'T' }]]
		]);
		expect(
			routeMapModel(plan, new Set(['P']), index).edges.map((e) => [e.key, e.cycle, e.stored])
		).toEqual([
			['Q->S', true, [{ taskId: 'S', dependencyId: 'T' }]],
			['S->Q', true, [{ taskId: 'T', dependencyId: 'S' }]]
		]);
		expect(
			routeMapModel(plan, new Set(['P', 'Q']), index).edges.map((e) => [e.key, e.cycle, e.stored])
		).toEqual([
			['S->T', true, [{ taskId: 'T', dependencyId: 'S' }]],
			['T->S', true, [{ taskId: 'S', dependencyId: 'T' }]]
		]);
	});

	it('classifies crossStage from stored stage ids before projection and ORs merged flags', () => {
		const plan = makePlan(
			[
				task({ id: 'P', stageId: 's1' }),
				task({ id: 'S', stageId: 's2', parentId: 'P', dependsOn: ['Q'] }),
				task({ id: 'Q', stageId: 's1' }),
				task({ id: 'R', stageId: 's1', dependsOn: ['Q'] }),
				task({ id: 'U', stageId: 's2', parentId: 'R', dependsOn: ['Q'] }),
				task({ id: 'sameStoredTarget', stageId: 's2', dependsOn: ['S'] })
			],
			['s1', 's2']
		);
		const index = indexTasks(plan.tasks);
		const closed = routeMapModel(plan, new Set(), index);
		const crossOnly = closed.edges.find((e) => e.key === 'Q->P');
		expect(crossOnly).toMatchObject({
			crossStage: true,
			stored: [{ taskId: 'S', dependencyId: 'Q' }]
		});
		const sameStored = closed.edges.find((e) => e.key === 'P->sameStoredTarget');
		expect(sameStored).toMatchObject({
			crossStage: false,
			stored: [{ taskId: 'sameStoredTarget', dependencyId: 'S' }]
		});
		const merged = closed.edges.find((e) => e.key === 'Q->R');
		expect(merged).toMatchObject({
			crossStage: true,
			stored: [
				{ taskId: 'R', dependencyId: 'Q' },
				{ taskId: 'U', dependencyId: 'Q' }
			]
		});
	});

	it('suppresses collapsed sibling self-links while preserving effective pairs and warnings', () => {
		const plan = makePlan([
			task({ id: 'P' }),
			task({ id: 'A', parentId: 'P', start: '2027-02-01', end: '2027-02-05' }),
			task({ id: 'B', parentId: 'P', start: '2027-01-01', end: '2027-01-05', dependsOn: ['A'] })
		]);
		const index = indexTasks(plan.tasks);
		const closed = routeMapModel(plan, new Set(), index);
		expect(closed.edges).toEqual([]);
		expect(closed.warnings).toContainEqual({ kind: 'date', taskId: 'B', dependencyId: 'A' });
		expect(routeMapModel(plan, new Set(['P']), index).edges).toEqual([
			{
				key: 'A->B',
				from: 'A',
				to: 'B',
				crossStage: false,
				cycle: false,
				stored: [{ taskId: 'B', dependencyId: 'A' }]
			}
		]);
	});

	it('keeps same-stage external-child parent rails in both expand states for U9 and two-family dependencies', () => {
		const u9 = makePlan([
			task({ id: 'survey', title: 'Site survey' }),
			task({ id: 'soil', title: 'Soil preparation' }),
			task({ id: 'test', title: 'Soil test', parentId: 'soil' }),
			task({ id: 'seeds', title: 'Order seeds', dependsOn: ['survey', 'test'] })
		]);
		const u9Index = indexTasks(u9.tasks);
		for (const expanded of [new Set<string>(), new Set(['soil'])]) {
			const edge = routeMapModel(u9, expanded, u9Index).edges.find((e) => e.key === 'soil->seeds');
			expect(edge).toEqual({
				key: 'soil->seeds',
				from: 'soil',
				to: 'seeds',
				crossStage: false,
				cycle: false,
				stored: [{ taskId: 'seeds', dependencyId: 'test' }]
			});
		}

		const twoFamilies = makePlan([
			task({ id: 'P' }),
			task({ id: 'S', parentId: 'P' }),
			task({ id: 'Q' }),
			task({ id: 'T', parentId: 'Q', dependsOn: ['S'] })
		]);
		const twoIndex = indexTasks(twoFamilies.tasks);
		for (const expanded of [new Set<string>(), new Set(['P', 'Q'])]) {
			expect(routeMapModel(twoFamilies, expanded, twoIndex).edges).toEqual([
				{
					key: 'P->Q',
					from: 'P',
					to: 'Q',
					crossStage: false,
					cycle: false,
					stored: [{ taskId: 'T', dependencyId: 'S' }]
				}
			]);
		}
	});

	it('preserves the ADR 13 stored warning identities in both expand states', () => {
		const plan = adr13Plan();
		const index = indexTasks(plan.tasks);
		for (const expanded of [new Set<string>(), new Set(['P'])]) {
			const model = routeMapModel(plan, expanded, index);
			expect(model.warnings).toEqual(dependencyWarnings(index));
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
		const index = indexTasks(plan.tasks);
		const warnings = dependencyWarnings(index);
		expect(warnings.filter((w) => w.kind === 'cycle')).toEqual(
			expect.arrayContaining([{ taskId: 'X', dependencyId: 'S', kind: 'cycle' }])
		);
		expect(
			warnings.some((w) => w.taskId === 'X' && w.dependencyId === 'P' && w.kind === 'cycle')
		).toBe(false);
		const edge = routeMapModel(plan, new Set(), index).edges.find((e) => e.key === 'P->X')!;
		expect(edge.stored).toHaveLength(2);
		expect(edge.cycle).toBe(true);
	});

	it('does not turn an acyclic effective graph into cycle warnings by grouping families', () => {
		const plan = groupingPlan();
		const index = indexTasks(plan.tasks);
		for (const expanded of [new Set<string>(), new Set(['P', 'Q'])]) {
			const model = routeMapModel(plan, expanded, index);
			expect(model.warnings).toEqual([{ kind: 'subtask_scope', taskId: 'T', dependencyId: 'X' }]);
			expect(model.edges.every((e) => !e.cycle)).toBe(true);
		}
	});
});
