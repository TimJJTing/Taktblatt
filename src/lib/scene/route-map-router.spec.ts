import { describe, expect, it } from 'vitest';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { routeMapModel } from '#lib/domain/route-map.ts';
import { routeMapLayout } from './route-map-layout.ts';
import { routeMapRoutes } from './route-map-router.ts';
import {
	clearancePlan,
	expectClearRoutes,
	largePlan,
	screenMetrics,
	shuffled,
	task
} from './route-map.test-helpers.ts';

describe('Route map routing', () => {
	it('bypasses the intermediate A/B/C station, label and focus outline', () => {
		const model = routeMapModel(clearancePlan(), new Set());
		const layout = routeMapLayout(model, screenMetrics);
		const [a, b, c] = ['A', 'B', 'C'].map((id) => layout.stations.find((s) => s.id === id)!);
		expect(a.hitBox.x).toBeLessThan(b.hitBox.x);
		expect(b.hitBox.x).toBeLessThan(c.hitBox.x);
		for (const s of layout.stations) {
			expect(s.hitBox.w).toBeGreaterThanOrEqual(24);
			expect(s.hitBox.h).toBeGreaterThanOrEqual(24);
		}
		const routes = routeMapRoutes(model, layout);
		expect(routes.map((r) => r.key)).toEqual(['A->C']);
		expectClearRoutes(layout, routes);
	});

	it('keeps every dependency outside the aligned terminus boxes', () => {
		const plan = makePlan(
			[
				task({ id: 'A', dependsOn: ['B'] }),
				task({ id: 'B', stageId: 's2', dependsOn: ['A'] }),
				task({ id: 'P', stageId: 's2' }),
				task({ id: 'child', parentId: 'P', stageId: 's2' })
			],
			['s1', 's2', 's3']
		);
		const model = routeMapModel(plan, new Set(['P']));
		const layout = routeMapLayout(model, screenMetrics);
		const routes = routeMapRoutes(model, layout);
		expect(routes).toHaveLength(2);
		for (const route of routes) {
			for (const point of route.points) expect(point.x).toBeLessThan(layout.terminusLeft);
		}
		expect(layout.terminusLeft).toBeGreaterThan(100);
	});

	it('keeps branches, transfers and backward cycles clear of unrelated labels', () => {
		const plan = makePlan(
			[
				task({ id: 'A', dependsOn: ['C'] }),
				task({ id: 'B', start: '2027-01-01' }),
				task({ id: 'C', dependsOn: ['A'] }),
				task({ id: 'D', stageId: 's2', dependsOn: ['A'] }),
				task({ id: 'E', stageId: 's2', dependsOn: ['C', 'D'] }),
				task({ id: 'obstacle', stageId: 's2', title: 'A transfer label obstacle' })
			],
			['s1', 's2']
		);
		const model = routeMapModel(plan, new Set());
		const layout = routeMapLayout(model, screenMetrics);
		const routes = routeMapRoutes(model, layout);
		expect(routes).toHaveLength(5);
		expect(
			routes
				.filter((r) => r.cycle)
				.map((r) => r.key)
				.sort()
		).toEqual(['A->C', 'C->A']);
		expectClearRoutes(layout, routes);
		expect(routeMapRoutes(model, layout)).toEqual(routes);
	});
	it('keeps the large fixture deterministic and routes every stored dependency', () => {
		const plan = largePlan();
		const model = routeMapModel(plan, new Set());
		const layout = routeMapLayout(model, screenMetrics);
		const routes = routeMapRoutes(model, layout);
		expect(new Set(layout.stations.map((station) => station.id)).size).toBe(120);
		expect(routes.flatMap((route) => route.stored)).toHaveLength(200);
		expectClearRoutes(layout, routes);
		const other = routeMapModel(shuffled(plan), new Set());
		expect(routeMapLayout(other, screenMetrics)).toEqual(layout);
		expect(routeMapRoutes(other, layout)).toEqual(routes);
	}, 20000);

	it('routes a sibling diamond independently of the decorative family loop', () => {
		const plan = makePlan([
			task({ id: 'P' }),
			task({ id: 'root', parentId: 'P' }),
			task({ id: 'left', parentId: 'P', dependsOn: ['root'] }),
			task({ id: 'right', parentId: 'P', dependsOn: ['root'] }),
			task({ id: 'join', parentId: 'P', dependsOn: ['left', 'right'] })
		]);
		const model = routeMapModel(plan, new Set(['P']));
		const layout = routeMapLayout(model, screenMetrics);
		const routes = routeMapRoutes(model, layout);
		expect(routes.map((r) => r.key).sort()).toEqual([
			'left->join',
			'right->join',
			'root->left',
			'root->right'
		]);
		expect(layout.loops).toHaveLength(1);
		expectClearRoutes(layout, routes);
	});
});
