import { describe, expect, it } from 'vitest';
import { indexTasks } from './derive.ts';
import {
	buildPrintModel,
	CARDS_PER_ROW,
	ganttPrintSegments,
	itemCount,
	printToday,
	REMARKS_PER_ROW,
	type CardsSegment,
	type PrintDiagram,
	type PrintModelInput,
	type RemarksSegment,
	type SceneSegment,
	type StageSegment
} from './print-model.ts';
import { makePlan, makeTask } from './test-helpers.ts';

describe('printToday', () => {
	it('uses the footer date when set, otherwise falls back to today', () => {
		const plan = makePlan([]);
		expect(printToday(plan, '2027-01-15')).toBe('2027-01-15');
		plan.footer.date = '2027-02-01';
		expect(printToday(plan, '2027-01-15')).toBe('2027-02-01');
	});
});

describe('buildPrintModel and itemCount', () => {
	it('includes milestone, band and remark segments only when non-empty', () => {
		const plan = makePlan([], ['s1']);
		const base = buildPrintModel({
			plan,
			index: indexTasks(plan.tasks),
			isExpanded: () => false,
			today: '2027-01-10'
		});
		expect(base.map((s) => s.id)).toEqual([
			'header',
			'gantt',
			'legend-stages',
			'cards',
			'stage-s1'
		]);

		plan.milestones = [
			{ id: 'm1', title: 'M', description: '', date: '2027-01-10', symbol: 'diamond' }
		];
		plan.bands = [{ id: 'b1', title: 'B', start: '2027-01-01', end: '2027-01-10', color: 'blue' }];
		plan.remarks = [{ id: 'r1', title: 'R', bullets: ['x'] }];
		const full = buildPrintModel({
			plan,
			index: indexTasks(plan.tasks),
			isExpanded: () => false,
			today: '2027-01-10'
		});
		expect(full.map((s) => s.id)).toEqual([
			'header',
			'gantt',
			'legend-stages',
			'legend-milestones',
			'legend-bands',
			'cards',
			'stage-s1',
			'remarks'
		]);
	});

	it('chunks cards and remarks by row limits and sets stage placement flags', () => {
		expect(CARDS_PER_ROW).toBe(3);
		expect(REMARKS_PER_ROW).toBe(2);
		const plan = makePlan([], ['s1', 's2', 's3', 's4']);
		plan.remarks = [
			{ id: 'r1', title: 'R1', bullets: [] },
			{ id: 'r2', title: 'R2', bullets: [] },
			{ id: 'r3', title: 'R3', bullets: [] }
		];
		const segments = buildPrintModel({
			plan,
			index: indexTasks(plan.tasks),
			isExpanded: () => false,
			today: '2027-01-10'
		});
		const cards = segments.find((s): s is CardsSegment => s.kind === 'cards')!;
		const remarks = segments.find((s): s is RemarksSegment => s.kind === 'remarks')!;
		const stages = segments.filter((s): s is StageSegment => s.kind === 'stage');

		expect(cards.rows.map((r) => r.length)).toEqual([3, 1]);
		expect(remarks.rows.map((r) => r.length)).toEqual([2, 1]);
		expect(itemCount(cards)).toBe(2);
		expect(itemCount(remarks)).toBe(2);

		expect(stages.map((s) => [s.workPlanTitle, s.breakBefore])).toEqual([
			[true, true],
			[false, false],
			[false, false],
			[false, false]
		]);
		expect(stages[0].rows).toEqual([]);
		expect(itemCount(stages[0])).toBe(1);
	});

	it('includes in-progress counts from derived parents in stage progress', () => {
		const plan = makePlan([
			makeTask({ id: 'parent', status: 'done' }),
			makeTask({ id: 'child', parentId: 'parent', status: 'in_progress' }),
			makeTask({ id: 'done', status: 'done' }),
			makeTask({ id: 'todo' })
		]);
		const segments = buildPrintModel({
			plan,
			index: indexTasks(plan.tasks),
			isExpanded: () => true,
			today: '2027-01-10'
		});
		const stage = segments.find((segment): segment is StageSegment => segment.kind === 'stage')!;
		expect(stage.progress).toEqual({ done: 1, inProgress: 1, total: 3 });
		expect(stage.rows.find((row) => row.task.id === 'parent')?.eff.status).toBe('in_progress');
	});

	it('keeps canceled rows but excludes their effective statuses from printed progress', () => {
		const tasks = [
			makeTask({ id: 'canceled', status: 'canceled' }),
			makeTask({ id: 'parent', status: 'todo' }),
			makeTask({ id: 'child', parentId: 'parent', status: 'canceled' })
		];
		const progress = (plan: ReturnType<typeof makePlan>) => {
			const segments = buildPrintModel({
				plan,
				index: indexTasks(plan.tasks),
				isExpanded: () => true,
				today: '2027-01-10'
			});
			return segments.find((segment): segment is StageSegment => segment.kind === 'stage')!;
		};
		const canceled = progress(makePlan(tasks));
		expect(canceled.progress).toEqual({ done: 0, inProgress: 0, total: 0 });
		expect(canceled.rows.map((row) => [row.task.id, row.eff.status])).toEqual([
			['canceled', 'canceled'],
			['parent', 'canceled'],
			['child', 'canceled']
		]);
		expect(
			progress(
				makePlan([...tasks, makeTask({ id: 'done', status: 'done' }), makeTask({ id: 'todo' })])
			).progress
		).toEqual({ done: 1, inProgress: 0, total: 2 });
	});

	it('carries readiness for parent and subtask rows in printed tables', () => {
		const plan = makePlan([
			makeTask({ id: 'done', status: 'done' }),
			makeTask({ id: 'open' }),
			makeTask({ id: 'ready', dependsOn: ['done'] }),
			makeTask({ id: 'parent', dependsOn: ['done'] }),
			makeTask({ id: 'child', parentId: 'parent', dependsOn: ['open'] }),
			makeTask({ id: 'canceled', status: 'canceled' })
		]);
		const segments = buildPrintModel({
			plan,
			index: indexTasks(plan.tasks),
			isExpanded: () => true,
			today: '2027-01-10'
		});
		const stage = segments.find((segment): segment is StageSegment => segment.kind === 'stage')!;
		expect(stage.rows.map((row) => [row.task.id, row.readiness])).toEqual([
			['done', { kind: 'inactive' }],
			['open', { kind: 'ready', via: 'dependencies', count: 0 }],
			['ready', { kind: 'ready', via: 'dependencies', count: 1 }],
			['parent', { kind: 'blocked', blockers: [{ kind: 'task', id: 'open' }] }],
			['child', { kind: 'blocked', blockers: [{ kind: 'task', id: 'open' }] }],
			['canceled', { kind: 'inactive' }]
		]);
	});

	it('includes subtask rows in stage tables only when the parent is expanded', () => {
		const plan = makePlan([
			makeTask({ id: 'p', stageId: 's1' }),
			makeTask({ id: 'c1', stageId: 's1', parentId: 'p' }),
			makeTask({ id: 'c2', stageId: 's1', parentId: 'p' })
		]);
		const index = indexTasks(plan.tasks);

		const collapsed = buildPrintModel({
			plan,
			index,
			isExpanded: () => false,
			today: '2027-01-10'
		});
		const collapsedStage = collapsed.find((s): s is StageSegment => s.kind === 'stage')!;
		const collapsedGantt = collapsed.find((s) => s.kind === 'gantt')!;
		const expectedRow = (task: (typeof plan.tasks)[number], level: 0 | 1) => ({
			task,
			level,
			eff: index.state.get(task.id)!.eff,
			readiness: index.state.get(task.id)!.readiness
		});
		expect(collapsedStage.rows).toEqual([expectedRow(plan.tasks[0], 0)]);
		expect(itemCount(collapsedStage)).toBe(1);
		expect(itemCount(collapsedGantt)).toBe(1);

		const expanded = buildPrintModel({
			plan,
			index,
			isExpanded: (id) => id === 'p',
			today: '2027-01-10'
		});
		const expandedStage = expanded.find((s): s is StageSegment => s.kind === 'stage')!;
		const expandedGantt = expanded.find((s) => s.kind === 'gantt')!;
		expect(expandedStage.rows).toEqual([
			expectedRow(plan.tasks[0], 0),
			expectedRow(plan.tasks[1], 1),
			expectedRow(plan.tasks[2], 1)
		]);
		expect(itemCount(expandedStage)).toBe(3);
		expect(itemCount(expandedGantt)).toBe(3);
	});
});

describe('buildPrintModel with selected diagrams', () => {
	const plan = makePlan([makeTask({ id: 't1', stageId: 's1' })], ['s1', 's2']);
	plan.remarks = [{ id: 'r1', title: 'R', bullets: ['x'] }];
	const input: PrintModelInput = {
		plan,
		index: indexTasks(plan.tasks),
		isExpanded: () => false,
		today: '2027-01-10'
	};

	const scene = (diagram: string, id: string, items: number): SceneSegment => ({
		kind: 'scene',
		id,
		diagram,
		items: Array.from({ length: items }, (_, i) => i),
		keep: 1,
		gap: 16,
		breakBefore: false
	});

	/** Fake diagrams in registry order. Each one has its main block and one legend block. */
	const diagrams: Record<string, () => PrintDiagram> = {
		gantt: () => ({ id: 'gantt', orientation: 'portrait', segments: ganttPrintSegments(input) }),
		'test-list': () => ({
			id: 'test-list',
			orientation: 'portrait',
			segments: [scene('test-list', 'test-list-scene', 4), scene('test-list', 'test-list-key', 1)]
		}),
		'test-board': () => ({
			id: 'test-board',
			orientation: 'landscape',
			segments: [
				scene('test-board', 'test-board-scene', 3),
				scene('test-board', 'test-board-key', 1)
			]
		})
	};
	const ORDER = ['gantt', 'test-list', 'test-board'];
	const SHARED_TAIL = ['cards', 'stage-s1', 'stage-s2', 'remarks'];
	const subsets = Array.from({ length: 7 }, (_, n) =>
		ORDER.filter((_, bit) => ((n + 1) >> bit) & 1)
	);

	it('keeps segment ids unique when diagrams repeat an id, also within one diagram', () => {
		const model = buildPrintModel({
			...input,
			diagrams: [
				diagrams.gantt(),
				{
					id: 'test-list',
					orientation: 'portrait',
					segments: [
						scene('test-list', 'legend-stages', 2),
						scene('test-list', 'legend-stages', 1),
						scene('test-list', 'header', 1)
					]
				}
			]
		});
		const ids = model.map((segment) => segment.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toEqual(
			expect.arrayContaining([
				'test-list:legend-stages',
				'test-list:legend-stages:2',
				'test-list:header'
			])
		);
	});

	it('returns the Gantt segment and its legends from ganttPrintSegments', () => {
		expect(ganttPrintSegments(input).map((s) => s.id)).toEqual(['gantt', 'legend-stages']);
		plan.milestones = [
			{ id: 'm1', title: 'M', description: '', date: '2027-01-10', symbol: 'diamond' }
		];
		try {
			expect(ganttPrintSegments(input).map((s) => s.id)).toEqual([
				'gantt',
				'legend-stages',
				'legend-milestones'
			]);
		} finally {
			plan.milestones = [];
		}
	});

	it('gives the same Gantt-only portrait model without a diagram list', () => {
		const model = buildPrintModel(input);
		expect(model).toEqual(buildPrintModel({ ...input, diagrams: [diagrams.gantt()] }));
		expect(model.map((s) => s.id)).toEqual(['header', 'gantt', 'legend-stages', ...SHARED_TAIL]);
		expect(model.every((s) => (s.orientation ?? 'portrait') === 'portrait')).toBe(true);
	});

	it.each(subsets.map((ids) => [ids.join(' + '), ids]))(
		'prints %s between the header and the shared content',
		(_, ids) => {
			const selected = (ids as string[]).map((id) => diagrams[id]());
			const model = buildPrintModel({ ...input, diagrams: selected });

			expect(model.map((s) => s.id)).toEqual([
				'header',
				...selected.flatMap((d) => d.segments.map((s) => s.id)),
				...SHARED_TAIL
			]);

			const owner = new Map(selected.flatMap((d) => d.segments.map((s) => [s.id, d] as const)));
			const firsts = new Set(selected.map((d) => d.segments[0].id));
			for (const segment of model) {
				const diagram = owner.get(segment.id);
				if (!diagram) {
					expect(segment.orientation ?? 'portrait').toBe('portrait');
					continue;
				}
				expect(segment.orientation).toBe(diagram.orientation);
				const startsLaterDiagram = firsts.has(segment.id) && diagram !== selected[0];
				expect(segment.breakBefore).toBe(startsLaterDiagram);
			}
			expect(model.find((s) => s.id === 'stage-s1')!.breakBefore).toBe(true);
		}
	);

	it('counts the items of a scene segment', () => {
		expect(itemCount(scene('test-list', 'test-list-scene', 4))).toBe(4);
		expect(itemCount(scene('test-list', 'test-list-empty', 0))).toBe(0);
	});
});
