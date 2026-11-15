import { describe, expect, it } from 'vitest';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { routeMapModel } from '#lib/domain/route-map.ts';
import { routeMapLayout } from './route-map-layout.ts';
import { routeMapRoutes } from './route-map-router.ts';
import {
	adr13Plan,
	expectClearRoutes,
	expectCoverage,
	expectOctilinear,
	groupingPlan,
	largePlan,
	pinnedExamplePlan,
	screenMetrics,
	shuffled,
	task
} from './route-map.test-helpers.ts';
const scene = (plan: ReturnType<typeof makePlan>, expanded = new Set<string>()) => {
	const model = routeMapModel(plan, expanded),
		layout = routeMapLayout(model, screenMetrics);
	return { model, layout, routes: routeMapRoutes(model, layout) };
};
describe('Workflow Route map dependency carriers', () => {
	it('draws each same-stage dependency once as a thick line even when unrelated work exists', () => {
		const r = scene(
			makePlan([task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c', dependsOn: ['a'] })])
		);
		expect(r.routes.map((edge) => [edge.key, edge.carrier])).toEqual([['a->c', 'line']]);
		expect(r.layout.lines.flatMap((line) => line.dependencyKeys)).toEqual(['a->c']);
		expectCoverage(r.model, r.routes);
		expectClearRoutes(r.layout, r.routes);
	});
	it('draws all cross-stage edges as thin links with capsules at both endpoints', () => {
		const r = scene(
			makePlan(
				[
					task({ id: 'a' }),
					task({ id: 'b', stageId: 's2', dependsOn: ['a'] }),
					task({ id: 'c', stageId: 's3', dependsOn: ['b'] })
				],
				['s1', 's2', 's3']
			)
		);
		expect(r.routes.map((edge) => edge.carrier)).toEqual(['walkway', 'walkway']);
		for (const id of ['a', 'b', 'c'])
			expect(r.layout.signs.find((s) => s.stationId === id)?.kind).toBe('interchange');
		expect(r.routes.every((edge) => edge.dock === undefined)).toBe(true);
		expectClearRoutes(r.layout, r.routes);
	});
	it('uses termini for zero-incoming or zero-outgoing nodes and no sign for an interior same-stage node', () => {
		const r = scene(
			makePlan([
				task({ id: 'a', start: '2028-01-01' }),
				task({ id: 'b', start: '2028-01-02', dependsOn: ['a'] }),
				task({ id: 'c', start: '2028-01-03', dependsOn: ['b'] }),
				task({ id: 'alone', start: '2029-01-01' })
			])
		);
		for (const id of ['a', 'alone'])
			expect(r.layout.signs.find((s) => s.stationId === id)?.kind).toBe('terminus');
		expect(r.layout.signs.some((s) => s.stationId === 'b' || s.stationId === 'c')).toBe(false);
	});
	it('keeps all fork and join dependencies as lines without synthesizing sibling connections', () => {
		const r = scene(
			makePlan([
				task({ id: 'a' }),
				task({ id: 'b', dependsOn: ['a'] }),
				task({ id: 'c', dependsOn: ['a'] }),
				task({ id: 'd', dependsOn: ['b', 'c'] })
			])
		);
		expect(r.routes).toHaveLength(4);
		expect(r.routes.every((edge) => edge.carrier === 'line')).toBe(true);
		expect(r.layout.lines.flatMap((line) => line.dependencyKeys).sort()).toEqual(
			r.model.edges.map((edge) => edge.key).sort()
		);
		expectClearRoutes(r.layout, r.routes);
	});
	it('preserves collapsed proxy storage identity as a thin link after family expansion', () => {
		const plan = makePlan([
			task({ id: 'p' }),
			task({ id: 'child', parentId: 'p' }),
			task({ id: 'target', dependsOn: ['child'] })
		]);
		const collapsed = scene(plan),
			expanded = scene(plan, new Set(['p']));
		const proxy = collapsed.routes.find((edge) => edge.to === 'target')!;
		expect(proxy.carrier).toBe('walkway');
		expect(proxy.stored).toEqual([{ taskId: 'target', dependencyId: 'child' }]);
		expect(expanded.routes.find((edge) => edge.from === 'child')?.carrier).toBe('walkway');
		for (const r of [collapsed, expanded]) expectCoverage(r.model, r.routes);
	});
	it('keeps legacy external subtask dependencies thin and family links outside dependency keys', () => {
		const r = scene(
			makePlan(
				[
					task({ id: 'p' }),
					task({ id: 'child', parentId: 'p', dependsOn: ['external'] }),
					task({ id: 'external', stageId: 's2' })
				],
				['s1', 's2']
			),
			new Set(['p'])
		);
		expect(r.routes.map((edge) => edge.carrier)).toEqual(['walkway']);
		expect(
			r.layout.lines.filter((line) => line.kind === 'family').flatMap((line) => line.dependencyKeys)
		).toEqual([]);
		expectCoverage(r.model, r.routes);
		expectClearRoutes(r.layout, r.routes);
	});
	it('keeps a cycle-only stage connected by a noncyclic workflow while both stored warnings stay thin', () => {
		const r = scene(
			makePlan([
				task({ id: 'A', start: '2027-01-01', dependsOn: ['B'] }),
				task({ id: 'B', start: '2027-01-02', dependsOn: ['A'] })
			])
		);
		const workflow = r.layout.lines.filter((line) => line.kind !== 'family');
		expect(workflow.map((line) => line.taskIds)).toEqual([['A', 'B']]);
		expect(workflow.flatMap((line) => line.dependencyKeys)).toEqual([]);
		expect(r.routes.map((route) => [route.key, route.carrier, route.cycle]).sort()).toEqual([
			['A->B', 'walkway', true],
			['B->A', 'walkway', true]
		]);
		expectCoverage(r.model, r.routes);
	});
	it('keeps same-stage hidden-child proxy links exceptional without suppressing the stage workflow', () => {
		const r = scene(
			makePlan([
				task({ id: 'parent', start: '2027-01-01' }),
				task({ id: 'child', parentId: 'parent', start: '2027-01-01' }),
				task({ id: 'target', start: '2027-01-02', dependsOn: ['child'] })
			])
		);
		const workflow = r.layout.lines.filter((line) => line.kind !== 'family');
		expect(workflow.map((line) => line.taskIds)).toEqual([['parent', 'target']]);
		expect(workflow.flatMap((line) => line.dependencyKeys)).toEqual([]);
		expect(r.routes).toHaveLength(1);
		expect(r.routes[0].carrier).toBe('walkway');
		expect(r.routes[0].stored).toEqual([{ taskId: 'target', dependencyId: 'child' }]);
	});
	it('condenses structural family cycles for placement without inventing warning links', () => {
		const r = scene(groupingPlan(), new Set(['P', 'Q']));
		expect(r.model.edges.filter((edge) => edge.cycle)).toEqual([]);
		expect(r.routes.filter((route) => route.cycle)).toEqual([]);
		expectCoverage(r.model, r.routes);
	});
	it('retains ADR13 cycle identity and draws warning cycles without shared trunks', () => {
		const r = scene(adr13Plan(), new Set(['P']));
		expect(
			r.routes
				.filter((edge) => edge.cycle)
				.map((edge) => edge.key)
				.sort()
		).toEqual(['S->X', 'X->P']);
		for (const edge of r.routes.filter((edge) => edge.cycle)) {
			expect(edge.carrier).toBe('walkway');
			expect(edge.dock).toBeUndefined();
			expectOctilinear(edge.points);
		}
		expectCoverage(r.model, r.routes);
		expectClearRoutes(r.layout, r.routes);
	});
	it('gives the garden workflow four thick pairs and three exceptional thin links', () => {
		const plan = pinnedExamplePlan(),
			r = scene(plan);
		const title = (id: string) => plan.tasks.find((task) => task.id === id)!.title;
		expect(
			r.layout.lines
				.filter((line) => line.kind !== 'family')
				.map((line) => line.taskIds.map(title).join('->'))
				.sort()
		).toEqual(
			[
				'Site survey->Soil preparation',
				'Site survey->Order seeds',
				'Sowing->Watering rota',
				'First harvest->Neighbourhood stall'
			].sort()
		);
		expect(
			r.routes
				.filter((route) => route.carrier === 'walkway')
				.map((route) => `${title(route.from)}->${title(route.to)}`)
				.sort()
		).toEqual(['Soil preparation->Sowing', 'Order seeds->Sowing', 'Sowing->First harvest'].sort());
		for (const line of r.layout.lines.filter((line) => line.kind !== 'family')) {
			expect(
				r.routes.filter(
					(route) =>
						route.from === line.taskIds[0] &&
						route.to === line.taskIds[1] &&
						route.carrier === 'walkway'
				)
			).toEqual([]);
		}
		const synthetic = r.layout.lines.find(
			(line) => line.taskIds[0] === 'task-0' && line.taskIds[1] === 'task-1'
		)!;
		expect(synthetic.dependencyKeys).toEqual([]);
		const expanded = scene(plan, new Set(['task-1']));
		expect(
			expanded.layout.lines.some(
				(line) => line.taskIds[0] === 'task-2' && line.taskIds[1] === 'task-3'
			)
		).toBe(true);
		expect(
			expanded.routes.find((route) => route.from === 'task-3' && route.to === 'task-5')?.carrier
		).toBe('walkway');
		expectCoverage(r.model, r.routes);
		expectCoverage(expanded.model, expanded.routes);
	});
	it.each([false, true])(
		'takes the clear forward gutter between garden rows without an overhead excursion (paper: %s)',
		(paper) => {
			const plan = pinnedExamplePlan(),
				model = routeMapModel(plan, new Set()),
				layout = routeMapLayout(model, { ...screenMetrics, paper }),
				routes = routeMapRoutes(model, layout);
			for (const [from, to] of [
				['task-4', 'task-5'],
				['task-5', 'task-7']
			]) {
				const source = layout.stations.find((station) => station.id === from)!,
					target = layout.stations.find((station) => station.id === to)!,
					route = routes.find((route) => route.from === from && route.to === to)!;
				expect(source.column).toBeLessThan(target.column);
				expect(route.carrier).toBe('walkway');
				expect(
					Math.min(...route.points.map((point) => point.y)),
					`${from}->${to} stays below the upper endpoint`
				).toBeGreaterThanOrEqual(Math.min(source.center.y, target.center.y));
				expect(
					Math.max(...route.points.map((point) => point.y)),
					`${from}->${to} stays above the lower endpoint`
				).toBeLessThanOrEqual(Math.max(source.center.y, target.center.y));
			}
			const incoming = routes.filter((route) => route.to === 'task-5');
			expect(incoming).toHaveLength(2);
			expect(new Set(incoming.map((route) => JSON.stringify(route.points.slice(-2)))).size).toBe(2);
			expectClearRoutes(layout, routes);
		}
	);
	it('routes all real-example dependencies and preserves geometry under shuffled input', () => {
		const plan = pinnedExamplePlan(),
			r = scene(plan);
		expectCoverage(r.model, r.routes);
		expectClearRoutes(r.layout, r.routes);
		expect(scene(shuffled(plan))).toEqual(r);
	});
	it('covers every stored edge in the large cyclic fixture without duplicate carriers', () => {
		const r = scene(largePlan());
		expectCoverage(r.model, r.routes);
		expect(new Set(r.routes.map((edge) => edge.key)).size).toBe(r.routes.length);
		for (const edge of r.routes) expectOctilinear(edge.points);
		expectClearRoutes(r.layout, r.routes);
	}, 20000);
});
