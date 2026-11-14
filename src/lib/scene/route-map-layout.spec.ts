import { describe, expect, it } from 'vitest';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { routeMapModel } from '#lib/domain/route-map.ts';
import { routeMapLayout } from './route-map-layout.ts';
import {
	expectOctilinear,
	groupingPlan,
	largePlan,
	pinnedExamplePlan,
	screenMetrics,
	shuffled,
	task
} from './route-map.test-helpers.ts';

const scene = (plan: ReturnType<typeof makePlan>, expanded = new Set<string>()) =>
	routeMapLayout(routeMapModel(plan, expanded), screenMetrics);
const station = (result: ReturnType<typeof scene>, id: string) =>
	result.stations.find((s) => s.id === id)!;

describe('Workflow branching Route map', () => {
	it.each([false, true])(
		'keeps cross-stage station titles five pixels below capsules (paper: %s)',
		(paper) => {
			const plan = makePlan(
				[task({ id: 'a' }), task({ id: 'b', stageId: 's2', dependsOn: ['a'] })],
				['s1', 's2']
			);
			const result = routeMapLayout(routeMapModel(plan, new Set()), { ...screenMetrics, paper });
			for (const sign of result.signs.filter((sign) => sign.kind === 'interchange')) {
				const host = station(result, sign.stationId!);
				expect(host.labelBox.y - (sign.center.y + sign.height / 2)).toBeGreaterThanOrEqual(5);
			}
		}
	);

	it('uses stage order before creation time for independent placement ties', () => {
		const plan = makePlan(
			[
				task({ id: 'second', stageId: 's2', createdAt: '2020-01-01T00:00:00Z' }),
				task({ id: 'first', stageId: 's1', createdAt: '2021-01-01T00:00:00Z' })
			],
			['s1', 's2']
		);
		const result = scene(plan);
		expect(station(result, 'first').track).toBeLessThan(station(result, 'second').track);
	});

	it.each([false, true])(
		'keeps child dependency and capsule sizes distinct (paper: %s)',
		(paper) => {
			const plan = makePlan(
				[
					task({ id: 'p' }),
					task({ id: 'a', parentId: 'p' }),
					task({ id: 'b', parentId: 'p', dependsOn: ['a'] }),
					task({ id: 'external', stageId: 's2', dependsOn: ['a'] })
				],
				['s1', 's2']
			);
			const result = routeMapLayout(routeMapModel(plan, new Set(['p'])), {
				...screenMetrics,
				paper
			});
			const dependency = result.lines.find((line) => line.dependencyKeys.includes('a->b'))!;
			expect(dependency.width).toBe(paper ? 3.5 : 6);
			const capsule = result.signs.find((sign) => sign.stationId === 'a')!;
			expect([capsule.width, capsule.height]).toEqual(paper ? [7.5, 15] : [12, 24]);
		}
	);

	it('connects unconstrained tasks in date order and keeps synthetic workflow outside dependency keys', () => {
		const result = scene(
			makePlan([
				task({ id: 'late', start: '2027-03-01' }),
				task({ id: 'first', start: '2027-01-01' }),
				task({ id: 'undated', start: null }),
				task({ id: 'middle', start: '2027-02-01' })
			])
		);
		expect(
			result.lines.filter((line) => line.kind !== 'family').map((line) => line.taskIds)
		).toEqual([
			['first', 'middle'],
			['middle', 'late'],
			['late', 'undated']
		]);
		expect(result.lines.flatMap((line) => line.dependencyKeys)).toEqual([]);
		expect(result.routes).toEqual([]);
		expect(['first', 'middle', 'late', 'undated'].map((id) => station(result, id).column)).toEqual([
			0, 1, 2, 3
		]);
	});
	it('uses dates for ordering rather than proportional distance', () => {
		const plan = makePlan([
			task({ id: 'a', start: '2027-01-01' }),
			task({ id: 'b', start: '2027-01-02' }),
			task({ id: 'c', start: '2027-01-03' })
		]);
		const spaced = structuredClone(plan);
		spaced.tasks[1].start = '2030-01-01';
		spaced.tasks[2].start = '2039-12-31';
		expect(scene(spaced)).toEqual(scene(plan));
	});
	it('keeps the diamond intact and attaches later unrelated work to the completed join', () => {
		const result = scene(
			makePlan([
				task({ id: 'A', start: '2027-01-01' }),
				task({ id: 'B', start: '2027-01-02', dependsOn: ['A'] }),
				task({ id: 'C', start: '2027-01-03', dependsOn: ['A'] }),
				task({ id: 'D', start: '2027-01-04', dependsOn: ['B', 'C'] }),
				task({ id: 'E', start: '2027-01-05' })
			])
		);
		expect(
			result.lines
				.filter((line) => line.kind !== 'family')
				.map((line) => line.taskIds.join('->'))
				.sort()
		).toEqual(['A->B', 'A->C', 'B->D', 'C->D', 'D->E']);
		expect(['A', 'B', 'C', 'D', 'E'].map((id) => station(result, id).column)).toEqual([
			0, 1, 1, 2, 3
		]);
		const workflow = result.lines.find((line) => line.taskIds.join('->') === 'D->E')!;
		expect(workflow.dependencyKeys).toEqual([]);
		expect(result.routes.map((route) => route.key).sort()).toEqual([
			'A->B',
			'A->C',
			'B->D',
			'C->D'
		]);
	});
	it('lets actual same-stage dependencies override conflicting dates without inventing cycle warnings', () => {
		const result = scene(
			makePlan([
				task({ id: 'late', start: '2027-12-01' }),
				task({ id: 'early', start: '2027-01-01', dependsOn: ['late'] }),
				task({ id: 'free', start: '2027-02-01' })
			])
		);
		expect(station(result, 'late').column).toBeLessThan(station(result, 'early').column);
		expect(
			result.lines.some((line) => line.taskIds[0] === 'early' && line.taskIds[1] === 'late')
		).toBe(false);
		expect(result.routes.every((route) => !route.cycle)).toBe(true);
	});
	it('does not close a global dependency cycle with same-stage date adjacency', () => {
		const plan = makePlan(
			[
				task({ id: 'A', stageId: 's1', start: '2027-01-01', dependsOn: ['X'] }),
				task({ id: 'B', stageId: 's1', start: '2027-01-02' }),
				task({ id: 'X', stageId: 's2', dependsOn: ['B'] })
			],
			['s1', 's2']
		);
		const result = scene(plan);
		expect(result.lines.some((line) => line.taskIds[0] === 'A' && line.taskIds[1] === 'B')).toBe(
			false
		);
		expect(station(result, 'B').column).toBeLessThan(station(result, 'X').column);
		expect(station(result, 'X').column).toBeLessThan(station(result, 'A').column);
		expect(result.routes.filter((route) => route.cycle)).toEqual([]);
	});
	it('keeps every status in the same workflow topology and geometry', () => {
		const plan = pinnedExamplePlan(),
			before = scene(plan);
		for (const status of ['todo', 'in_progress', 'done', 'canceled'] as const) {
			const changed = structuredClone(plan);
			changed.tasks.forEach((task) => {
				task.status = status;
			});
			expect(scene(changed)).toEqual(before);
		}
	});
	it('places a cross-stage chain in consecutive columns on one compact track', () => {
		const result = scene(
			makePlan(
				[
					task({ id: 'a' }),
					task({ id: 'b', stageId: 's2', dependsOn: ['a'] }),
					task({ id: 'c', stageId: 's3', dependsOn: ['b'] })
				],
				['s1', 's2', 's3']
			)
		);
		expect(['a', 'b', 'c'].map((id) => station(result, id).column)).toEqual([0, 1, 2]);
		expect(new Set(result.stations.map((s) => s.center.y)).size).toBe(1);
		expect(station(result, 'b').center.x - station(result, 'a').center.x).toBe(112);
		expect(station(result, 'c').center.x - station(result, 'b').center.x).toBe(112);
	});
	it('packs a fork and join into three columns and reuses tracks across stages', () => {
		const result = scene(
			makePlan(
				[
					task({ id: 'a' }),
					task({ id: 'b', dependsOn: ['a'] }),
					task({ id: 'c', stageId: 's2', dependsOn: ['a'] }),
					task({ id: 'd', dependsOn: ['b', 'c'] })
				],
				['s1', 's2']
			)
		);
		expect(['a', 'b', 'c', 'd'].map((id) => station(result, id).column)).toEqual([0, 1, 1, 2]);
		expect(station(result, 'b').center.y).not.toBe(station(result, 'c').center.y);
		expect(new Set(result.stations.map((s) => s.center.y)).size).toBeLessThanOrEqual(2);
		expect(result.width).toBeLessThanOrEqual(3 * 112 + 32);
	});
	it('uses substantial 45-degree runs for the fork and join rather than tiny corner chamfers', () => {
		const result = scene(
			makePlan([
				task({ id: 'A' }),
				task({ id: 'B', dependsOn: ['A'] }),
				task({ id: 'C', dependsOn: ['A'] }),
				task({ id: 'D', dependsOn: ['B', 'C'] })
			])
		);
		const root = result.stations.find((s) => s.id === 'A')!;
		const lower = result.stations.find(
			(s) => ['B', 'C'].includes(s.id) && s.center.y !== root.center.y
		)!;
		const bending = result.lines.filter((line) => line.taskIds.includes(lower.id));
		expect(bending).toHaveLength(2);
		for (const line of bending) {
			expect(
				line.points.slice(1).some((point, i) => {
					const from = line.points[i],
						dx = Math.abs(point.x - from.x),
						dy = Math.abs(point.y - from.y);
					return dx >= 40 && Math.abs(dx - dy) < 1e-6;
				})
			).toBe(true);
		}
	});
	it('omits empty-stage stubs and attaches one badge to each station', () => {
		const result = scene(
			makePlan([task({ id: 'a' }), task({ id: 'b', dependsOn: ['a'] })], ['s1', 'empty'])
		);
		expect(result.lines.flatMap((line) => line.taskIds)).not.toContain('empty');
		expect(result.signs.every((sign) => sign.stationId !== null)).toBe(true);
		expect(result.stageLabels.map((label) => [label.hostId, label.role]).sort()).toEqual([
			['a', 'start'],
			['b', 'start']
		]);
		for (const label of result.stageLabels) {
			const host = station(result, label.hostId!);
			expect(label.box.y).toBeGreaterThanOrEqual(host.labelBox.y + host.labelBox.h);
			expect(label.progressBox).toBeUndefined();
		}
	});
	it('keeps parent x fixed when a dense family expands and distinguishes family links', () => {
		const plan = makePlan([
			task({ id: 'before' }),
			task({ id: 'p', dependsOn: ['before'] }),
			...Array.from({ length: 12 }, (_, i) => task({ id: `child-${i}`, parentId: 'p' })),
			task({ id: 'after', dependsOn: ['p'] })
		]);
		const collapsed = scene(plan),
			expanded = scene(plan, new Set(['p']));
		expect(station(expanded, 'p').center.x).toBe(station(collapsed, 'p').center.x);
		expect(expanded.stations).toHaveLength(plan.tasks.length);
		const families = expanded.lines.filter((line) => line.kind === 'family');
		expect(families.length).toBeGreaterThan(0);
		expect(families.flatMap((line) => line.dependencyKeys)).toEqual([]);
		expect(new Set(families.flatMap((line) => line.taskIds))).toEqual(
			new Set(['p', ...plan.tasks.filter((t) => t.parentId === 'p').map((t) => t.id)])
		);
		for (const line of families) {
			expect(line.width).toBe(6);
			expectOctilinear(line.points);
		}
	});
	it('bounds the garden canvas by its final label and focus clearance without an unused trailing gutter', () => {
		const result = scene(pinnedExamplePlan());
		const right = Math.max(
			...result.stations.map((station) => station.labelBox.x + station.labelBox.w + 4)
		);
		expect(result.width).toBeLessThanOrEqual(right);
		for (const route of result.routes)
			for (const point of route.points) expect(point.x).toBeLessThanOrEqual(result.width);
	});
	it('keeps hit bounds, title bounds and family controls inside the scene', () => {
		const result = scene(pinnedExamplePlan(), new Set(['task-1']));
		for (const s of result.stations) {
			expect(s.hitBox.w).toBeGreaterThanOrEqual(24);
			for (const box of [s.hitBox, s.labelBox, s.focusBox, ...s.controlBoxes]) {
				expect(box.x).toBeGreaterThanOrEqual(0);
				expect(box.y).toBeGreaterThanOrEqual(0);
				expect(box.x + box.w).toBeLessThanOrEqual(result.width);
				expect(box.y + box.h).toBeLessThanOrEqual(result.height);
			}
		}
	});
	it('orders canonically equivalent identifiers deterministically', () => {
		const plan = makePlan([
			task({ id: 'é' }),
			task({ id: 'e\u0301' }),
			task({ id: 'end', dependsOn: ['é', 'e\u0301'] })
		]);
		expect(scene(shuffled(plan))).toEqual(scene(plan));
	});
	it('terminates on grouping-only cycles without mutating the plan', () => {
		const plan = groupingPlan(),
			original = structuredClone(plan);
		const result = scene(plan, new Set(['P', 'Q']));
		expect(result.stations).toHaveLength(5);
		expect(plan).toEqual(original);
		expect(scene(shuffled(plan), new Set(['P', 'Q']))).toEqual(result);
	});
	it('lays out all stations of the large cyclic fixture with deterministic finite geometry', () => {
		const plan = largePlan(),
			result = scene(plan);
		expect(result.stations).toHaveLength(120);
		expect(new Set(result.stations.map((s) => s.id)).size).toBe(120);
		for (const s of result.stations)
			expect(Number.isFinite(s.center.x) && Number.isFinite(s.center.y)).toBe(true);
		expect(scene(shuffled(plan))).toEqual(result);
	}, 20000);
});
