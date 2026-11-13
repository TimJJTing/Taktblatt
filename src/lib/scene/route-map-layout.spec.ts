import { describe, expect, it } from 'vitest';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { routeMapModel } from '#lib/domain/route-map.ts';
import { routeMapLayout } from './route-map-layout.ts';
import { groupingPlan, screenMetrics, shuffled, task } from './route-map.test-helpers.ts';

const layout = (tasks: Parameters<typeof makePlan>[0], expanded = new Set<string>()) =>
	routeMapLayout(routeMapModel(makePlan(tasks), expanded), screenMetrics);

describe('Route map placement', () => {
	it('puts predecessors before dependents even when dates request the reverse', () => {
		const result = layout([
			task({ id: 'late', start: '2027-01-20' }),
			task({ id: 'early', start: '2027-01-01', dependsOn: ['late'] })
		]);
		const [late, early] = ['late', 'early'].map((id) => result.stations.find((s) => s.id === id)!);
		expect(late.rank).toBeLessThan(early.rank);
		expect(late.labelBox.x + late.labelBox.w + result.clearance).toBeLessThanOrEqual(
			early.hitBox.x
		);
	});

	it('uses effective date, creation time and id ties, with undated work last', () => {
		const tasks = [
			task({ id: 'missing' }),
			task({ id: 'b', start: '2027-01-02' }),
			task({ id: 'a', start: '2027-01-02' }),
			task({ id: 'created', start: '2027-01-02', createdAt: '2026-01-01T00:00:00Z' }),
			task({ id: 'first', start: '2027-01-01' })
		];
		const result = layout(tasks);
		const byX = [...result.stations].sort((a, b) => a.hitBox.x - b.hitBox.x);
		expect(byX.map((s) => s.id)).toEqual(['first', 'created', 'a', 'b', 'missing']);
		expect(new Set(byX.map((s) => s.columnId)).size).toBe(5);
		expect(new Set(byX.map((s) => s.rank)).size).toBe(1);
		expect(layout([...tasks].reverse())).toEqual(result);
	});

	it('orders canonically equivalent ids by code unit regardless of input order', () => {
		const tasks = [task({ id: 'é' }), task({ id: 'e\u0301' })];
		expect(layout(tasks)).toEqual(layout([...tasks].reverse()));
	});

	it('orders siblings by dependencies and uses child dates for the contracted parent', () => {
		const result = layout(
			[
				task({ id: 'P' }),
				task({ id: 'S', parentId: 'P', start: '2027-01-01' }),
				task({ id: 'T', parentId: 'P', start: '2026-01-01', dependsOn: ['S'] }),
				task({ id: 'other', start: '2027-01-02' })
			],
			new Set(['P'])
		);
		const station = (id: string) => result.stations.find((s) => s.id === id)!;
		expect(station('S').hitBox.x).toBeLessThan(station('T').hitBox.x);
		expect(station('P').hitBox.x).toBeLessThan(station('other').hitBox.x);
		expect(result.loops).toHaveLength(1);
		expect(result.loops[0].taskIds.slice().sort()).toEqual(['P', 'S', 'T']);
	});

	it('keeps cyclic components together and puts children on a lower branch', () => {
		const result = layout(
			[
				task({ id: 'A', start: '2027-01-01', dependsOn: ['Z'] }),
				task({ id: 'M', start: '2027-01-02' }),
				task({ id: 'Z', start: '2027-01-03', dependsOn: ['A'] }),
				task({ id: 'child', parentId: 'A' })
			],
			new Set(['A'])
		);
		expect(result.stations.filter((s) => s.id !== 'child').map((s) => s.id)).toEqual([
			'A',
			'Z',
			'M'
		]);
		expect(result.stations.find((s) => s.id === 'child')!.inPort.y).toBeGreaterThan(
			result.stations.find((s) => s.id === 'A')!.inPort.y
		);
	});

	it('terminates on grouping-only cycles with stable geometry and stage order', () => {
		const plan = groupingPlan();
		const original = structuredClone(plan);
		const expanded = new Set(['P', 'Q']);
		const result = routeMapLayout(routeMapModel(plan, expanded), screenMetrics);
		expect(routeMapLayout(routeMapModel(shuffled(plan), expanded), screenMetrics)).toEqual(result);
		expect(result.stations).toHaveLength(5);
		expect(plan).toEqual(original);
	}, 5000);
	it('keeps plan stage order from top to bottom, independent of task dates', () => {
		const plan = makePlan(
			[
				task({ id: 'top', stageId: 'first', start: '2027-02-01' }),
				task({ id: 'bottom', stageId: 'last', start: '2027-01-01' })
			],
			['first', 'empty', 'last']
		);
		const result = routeMapLayout(routeMapModel(plan, new Set()), screenMetrics);
		expect(result.stations.find((s) => s.id === 'top')!.hitBox.y).toBeLessThan(
			result.stations.find((s) => s.id === 'bottom')!.hitBox.y
		);
	});
});
