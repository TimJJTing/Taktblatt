import { describe, expect, it } from 'vitest';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { routeMapModel } from '#lib/domain/route-map.ts';
import { routeMapLayout } from './route-map-layout.ts';
import { routeMapRoutes } from './route-map-router.ts';
import { routeMapScene } from './route-map-scene.ts';
import {
	expectClearRoutes,
	largePlan,
	screenMetrics,
	shuffled,
	task
} from './route-map.test-helpers.ts';

function scene(plan: ReturnType<typeof makePlan>, expanded = new Set<string>()) {
	const model = routeMapModel(plan, expanded);
	const layout = routeMapLayout(model, screenMetrics);
	const routes = routeMapRoutes(model, layout);
	return { model, layout, routes, scene: routeMapScene(model, layout, routes) };
}

describe('Route map scene identity', () => {
	it('has exactly one node per visible task and no guide or loop task identities', () => {
		const plan = makePlan(
			[
				task({ id: 'P' }),
				task({ id: 'S', parentId: 'P', status: 'done' }),
				task({ id: 'other', dependsOn: ['S'] })
			],
			['s1', 'empty']
		);
		const expanded = new Set(['P']);
		const result = scene(plan, expanded);
		expect(result.scene.view).toBe('route-map');
		expect(result.scene.nodes.map((n) => n.id).sort()).toEqual(['P', 'S', 'other']);
		expect(result.scene.nodes.find((n) => n.id === 'P')).toMatchObject({
			stageId: 's1',
			status: 'done'
		});
		expect(result.scene.geometry.nodes.map((n) => n.id).sort()).toEqual(['P', 'S', 'other']);
		expect(result.scene.edges.map((e) => e.key)).toEqual(['S->other']);
		expect(result.layout.guides.length).toBeGreaterThan(0);
		expect(result.layout.loops).toHaveLength(1);
		expect(scene(shuffled(plan), expanded).scene).toEqual(result.scene);
	});

	it('covers the exact 120-station/200-edge fixture with finite clear deterministic geometry', () => {
		const plan = largePlan();
		const result = scene(plan);
		expect(new Set(result.scene.nodes.map((n) => n.id)).size).toBe(120);
		expect(result.routes.flatMap((r) => r.stored)).toHaveLength(200);
		const expected = plan.tasks.flatMap((t) => t.dependsOn.map((id) => `${t.id}:${id}`)).sort();
		expect(
			result.routes.flatMap((r) => r.stored.map((s) => `${s.taskId}:${s.dependencyId}`)).sort()
		).toEqual(expected);
		for (const box of result.scene.geometry.nodes) {
			for (const value of [box.x, box.y, box.w, box.h]) {
				expect(Number.isFinite(value.f) && Number.isFinite(value.px)).toBe(true);
			}
		}
		expectClearRoutes(result.layout, result.routes);
		expect(scene(shuffled(plan)).scene).toEqual(result.scene);
	}, 20000);
});
