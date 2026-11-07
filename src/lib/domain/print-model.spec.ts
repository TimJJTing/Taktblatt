import { describe, expect, it } from 'vitest';
import { indexTasks } from './derive.ts';
import {
	buildPrintModel,
	CARDS_PER_ROW,
	itemCount,
	printToday,
	REMARKS_PER_ROW,
	type CardsSegment,
	type RemarksSegment,
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
		expect(collapsedStage.rows.map((r) => [r.task.id, r.level, r.isParent])).toEqual([
			['p', 0, true]
		]);
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
		expect(expandedStage.rows.map((r) => [r.task.id, r.level, r.isParent])).toEqual([
			['p', 0, true],
			['c1', 1, false],
			['c2', 1, false]
		]);
		expect(itemCount(expandedStage)).toBe(3);
		expect(itemCount(expandedGantt)).toBe(3);
	});
});
