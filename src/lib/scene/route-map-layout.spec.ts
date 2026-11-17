import { describe, expect, it } from 'vitest';
import { dependencyWarnings } from '#lib/domain/dependencies.ts';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { indexTasks } from '#lib/domain/derive.ts';
import { routeMapModel } from '#lib/domain/route-map.ts';
import { routeMapLayout } from './route-map-layout.ts';
import {
	expectOctilinear,
	expectReservations,
	longNamePlan,
	densePlan,
	groupingPlan,
	largePlan,
	pinnedExamplePlan,
	screenMetrics,
	shuffled,
	task
} from './route-map.test-helpers.ts';

const scene = (plan: ReturnType<typeof makePlan>, expanded = new Set<string>()) =>
	routeMapLayout(routeMapModel(plan, expanded, indexTasks(plan.tasks)), screenMetrics);
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
			const result = routeMapLayout(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), {
				...screenMetrics,
				paper
			});
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
		'keeps family line width and equal transfer sizes (paper: %s)',
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
			const result = routeMapLayout(routeMapModel(plan, new Set(['p']), indexTasks(plan.tasks)), {
				...screenMetrics,
				paper
			});
			const dependency = result.lines.find((line) => line.dependencyKeys.includes('a->b'))!;
			expect(dependency.form).toBe('double');
			for (const id of ['a', 'external']) {
				const capsule = result.signs.find(
					(sign) => sign.stationId === id && sign.kind === 'interchange'
				)!;
				expect([capsule.width, capsule.height]).toEqual(paper ? [10, 20] : [16, 32]);
				expect(capsule).not.toHaveProperty('docks');
			}
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
				task({ id: 'D', dependsOn: ['B', 'C'] }),
				task({ id: 'child-1', parentId: 'A' }),
				task({ id: 'child-2', parentId: 'A', dependsOn: ['child-1'] }),
				task({ id: 'child-3', parentId: 'A' })
			]),
			new Set(['A'])
		);
		expect(result.lines.some((line) => line.taskIds.includes('child-1'))).toBe(true);
		for (const line of result.lines) expectOctilinear(line.points);
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
	it('places one placeholder and badge for an empty stage and one badge at the first task', () => {
		const result = scene(
			makePlan([task({ id: 'a' }), task({ id: 'b', dependsOn: ['a'] })], ['s1', 'empty'])
		);
		expect(result.stageLabels.filter((label) => label.stageId === 'empty')).toHaveLength(1);
		const placeholders = result.signs.filter(
			(sign) => sign.stageId === 'empty' && sign.stationId === null
		);
		expect(placeholders).toHaveLength(1);
		expect(
			Number.isFinite(placeholders[0].center.x) && Number.isFinite(placeholders[0].center.y)
		).toBe(true);
		expect(
			result.stageLabels.filter((label) => label.stageId === 's1').map((label) => label.hostId)
		).toEqual(['a']);
		const badge = result.stageLabels.find((label) => label.hostId === 'a')!;
		expect(badge.box.y).toBeGreaterThanOrEqual(
			station(result, 'a').labelBox.y + station(result, 'a').labelBox.h
		);
	});
	it('places garden badges on the first top-level task in both expansion states and shuffled input', () => {
		const plan = pinnedExamplePlan();
		const expected = ['Site survey', 'Sowing', 'First harvest']
			.map((title) => plan.tasks.find((task) => task.title === title)!.id)
			.sort();
		const expanded = new Set(
			plan.tasks.filter((task) => task.parentId === null).map((task) => task.id)
		);
		for (const candidate of [plan, shuffled(plan)]) {
			for (const state of [new Set<string>(), expanded]) {
				expect(
					scene(candidate, state)
						.stageLabels.map((label) => label.hostId)
						.sort()
				).toEqual(expected);
			}
		}
	});
	it('uses dependency order rather than date order for the stage badge', () => {
		const result = scene(
			makePlan([
				task({ id: 'a', start: '2027-12-01' }),
				task({ id: 'b', start: '2027-01-01', dependsOn: ['a'] })
			])
		);
		expect(result.stageLabels.map((label) => label.hostId)).toEqual(['a']);
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
		const attachment = families.find((line) => line.taskIds.includes('p'))!;
		expect(attachment.points[0]).toEqual(station(expanded, 'p').center);
		for (const line of families) {
			expect(line.form).toBe('double');
			expectOctilinear(line.points);
		}
	});
	it('reserves all label and badge boxes in example, long-name and dense scenes', () => {
		for (const plan of [pinnedExamplePlan(), longNamePlan(), densePlan()]) {
			const parents = new Set(plan.tasks.filter((t) => t.parentId).map((t) => t.parentId!));
			for (const expanded of [new Set<string>(), parents]) {
				const result = scene(plan, expanded);
				expectReservations(result, result.routes);
			}
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

	it('keeps U9 top-level rail keys equal in both expand states without duplicate carriers', () => {
		const plan = pinnedExamplePlan();
		plan.tasks.find((t) => t.id === 'task-4')!.dependsOn.push('task-2');
		const topLevelIds = new Set(plan.tasks.filter((t) => t.parentId === null).map((t) => t.id));
		const topStageRails = (result: ReturnType<typeof scene>, stageId: string) =>
			result.lines
				.filter(
					(line) =>
						line.stageId === stageId &&
						line.kind !== 'family' &&
						line.taskIds.every((id) => topLevelIds.has(id))
				)
				.map((line) => line.key)
				.sort();

		const collapsed = scene(plan);
		const expanded = scene(plan, new Set(['task-1']));
		for (const result of [collapsed, expanded]) {
			expect(result.lines.some((line) => line.key === 'task-1->task-4')).toBe(true);
			expect(result.lines.find((line) => line.key === 'task-1->task-4')!.dependencyKeys).toEqual([
				'task-1->task-4'
			]);
			expect(new Set(result.routes.map((route) => route.key)).size).toBe(result.routes.length);
		}
		expect(topStageRails(expanded, 'stage-0')).toEqual(topStageRails(collapsed, 'stage-0'));
	});

	it('lets U9 parent rails govern scope order over conflicting dates with unrelated work and no duplicate carriers', () => {
		const plan = makePlan([
			task({ id: 'seeds', title: 'Order seeds', start: '2026-11-01', dependsOn: ['test'] }),
			task({ id: 'survey', title: 'Site survey', start: '2026-11-05' }),
			task({ id: 'soil', title: 'Soil preparation', start: '2026-11-10', dependsOn: ['survey'] }),
			task({ id: 'test', title: 'Soil test', parentId: 'soil', start: '2026-11-10' }),
			task({ id: 'extra', title: 'Tool check', start: '2026-11-12' })
		]);
		const topLevelIds = new Set(['seeds', 'survey', 'soil', 'extra']);
		const topRails = (result: ReturnType<typeof scene>) =>
			result.lines
				.filter((line) => line.kind !== 'family' && line.taskIds.every((id) => topLevelIds.has(id)))
				.map((line) => [line.key, line.dependencyKeys])
				.sort();

		const collapsed = scene(plan);
		const expanded = scene(plan, new Set(['soil']));
		for (const result of [collapsed, expanded]) {
			expect(station(result, 'soil').column).toBeLessThan(station(result, 'seeds').column);
			expect(
				result.lines.filter((line) => line.taskIds[0] === 'soil' && line.taskIds[1] === 'seeds')
			).toHaveLength(1);
			expect(result.routes.map((route) => route.key).sort()).toEqual([
				'soil->seeds',
				'survey->soil'
			]);
			expect(new Set(result.routes.map((route) => route.key)).size).toBe(result.routes.length);
		}
		expect(topRails(collapsed)).toEqual([
			['soil->seeds', ['soil->seeds']],
			['survey->soil', ['survey->soil']],
			['workflow:seeds->extra', []]
		]);
		expect(topRails(expanded)).toEqual(topRails(collapsed));
	});

	it('keeps exact three thin garden pairs in both states and expanded Soil test -> Add compost rail', () => {
		const plan = pinnedExamplePlan();
		const collapsed = scene(plan);
		const expanded = scene(plan, new Set(['task-1']));
		expect(
			collapsed.routes
				.filter((route) => route.carrier === 'walkway')
				.map((route) => route.key)
				.sort()
		).toEqual(['task-1->task-5', 'task-4->task-5', 'task-5->task-7']);
		expect(
			expanded.routes
				.filter((route) => route.carrier === 'walkway')
				.map((route) => route.key)
				.sort()
		).toEqual(['task-3->task-5', 'task-4->task-5', 'task-5->task-7']);
		expect(expanded.lines.find((line) => line.key === 'task-2->task-3')?.dependencyKeys).toEqual([
			'task-2->task-3'
		]);
	});

	it('keeps same-stage two-family external-child parent rail keys equal in both expand states', () => {
		const plan = makePlan([
			task({ id: 'P', start: '2027-01-01' }),
			task({ id: 'A', parentId: 'P', start: '2027-01-01' }),
			task({ id: 'Q', start: '2027-01-02' }),
			task({ id: 'B', parentId: 'Q', start: '2027-01-02', dependsOn: ['A'] })
		]);
		const topLevelIds = new Set(['P', 'Q']);
		const topRails = (expanded: Set<string>) =>
			scene(plan, expanded)
				.lines.filter(
					(line) => line.kind !== 'family' && line.taskIds.every((id) => topLevelIds.has(id))
				)
				.map((line) => [line.key, line.dependencyKeys]);

		const collapsed = topRails(new Set());
		const expanded = topRails(new Set(['P', 'Q']));
		expect(collapsed).toEqual([['P->Q', ['P->Q']]]);
		expect(expanded).toEqual(collapsed);
	});

	it('keeps synthetic workflow adjacency and family links free of stored identities, readiness changes, and warnings', () => {
		const plan = makePlan([
			task({ id: 'first', start: '2027-01-01', status: 'todo' }),
			task({ id: 'second', start: '2027-01-02', status: 'todo' }),
			task({ id: 'parent', start: '2027-01-03' }),
			task({ id: 'child-a', parentId: 'parent', start: '2027-01-03' }),
			task({ id: 'child-b', parentId: 'parent', start: '2027-01-04' })
		]);
		const index = indexTasks(plan.tasks);
		const model = routeMapModel(plan, new Set(['parent']), index);
		const layout = routeMapLayout(model, screenMetrics);

		const synthetic = layout.lines.filter(
			(line) => line.kind === 'workflow' || line.kind === 'family'
		);
		expect(synthetic.length).toBeGreaterThanOrEqual(3);
		for (const line of synthetic) expect(line.dependencyKeys).toEqual([]);
		expect(model.edges).toEqual([]);
		expect(layout.routes).toEqual([]);
		expect(model.warnings).toEqual(dependencyWarnings(index));
		expect(index.state.get('second')!.readiness).toEqual({
			kind: 'ready',
			via: 'dependencies',
			count: 0
		});
		expect(index.state.get('child-b')!.readiness).toEqual({
			kind: 'ready',
			via: 'dependencies',
			count: 0
		});
	});
});
