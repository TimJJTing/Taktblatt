import { describe, expect, it } from 'vitest';
import { boardColumn, familySummary, indexTasks } from '#lib/domain/derive.ts';
import { lineKey } from '#lib/domain/route.ts';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { KANBAN_COLUMNS, kanbanBoard, kanbanEdges, kanbanSwimlanes } from './kanban-board.ts';
import {
	canceledSubtasks,
	done300,
	emptyStage,
	garden,
	isolatedParent,
	kanbanTask,
	longStageTitle,
	mixedBoard
} from './kanban-fixtures.test-helper.ts';

const ids = (board: ReturnType<typeof kanbanBoard>) =>
	board.columns.map((column) => column.cards.map((card) => card.id));

describe('Kanban leaf projection', () => {
	it('projects inherited blockers, satisfied prerequisites and stored progress without parent cards', () => {
		const plan = mixedBoard();
		const index = indexTasks(plan.tasks);
		const before = structuredClone(plan);
		const board = kanbanBoard(plan, index);
		expect(board.columns.map((column) => column.id)).toEqual([
			'blocked',
			'todo',
			'in_progress',
			'done'
		]);
		expect(board.columns.map((column) => column.id)).toEqual([...KANBAN_COLUMNS]);
		expect(ids(board)).toEqual([
			['child'],
			['open', 'ready', 'after-derived'],
			['working'],
			['finished', 'derived-child', 'stage-two']
		]);
		expect(board.columns.map((column) => column.count)).toEqual([1, 3, 1, 3]);
		expect(board.total).toBe(8);
		expect(board.emptyKind).toBe('none');
		expect(board.columns[0].cards[0]).toMatchObject({
			id: 'child',
			title: 'Child',
			status: 'todo',
			column: 'blocked',
			stageId: 's1',
			stageNumber: 1,
			stageTitle: 'Design',
			parentId: 'P',
			parentTitle: 'Parent',
			owners: ['Ada', 'Lin'],
			start: '2027-01-03',
			end: '2027-01-04',
			readiness: { kind: 'blocked', blockers: [{ kind: 'task', id: 'open' }] }
		});
		expect(board.columns[1].cards.find((card) => card.id === 'ready')?.readiness).toEqual({
			kind: 'ready',
			via: 'dependencies',
			count: 2
		});
		expect(board.columns[3].cards.at(-1)).toMatchObject({ stageId: 's2', stageNumber: 2 });
		expect(plan).toEqual(before);
	});

	it('keeps stage order, sorted parent positions, sorted children, missing starts and stable ties', () => {
		const plan = makePlan(
			[
				kanbanTask('second-stage', { stageId: 's2', start: '2026-01-01' }),
				kanbanTask('missing-late', { createdAt: '2027-01-02T00:00:00.000Z' }),
				kanbanTask('tie-z', { start: '2027-01-10' }),
				kanbanTask('tie-a', { start: '2027-01-10' }),
				kanbanTask('P', { start: '2027-01-05' }),
				kanbanTask('child-late', { parentId: 'P', start: '2027-01-08' }),
				kanbanTask('child-tie-z', { parentId: 'P', start: '2027-01-06' }),
				kanbanTask('child-tie-a', { parentId: 'P', start: '2027-01-06' }),
				kanbanTask('child-missing', { parentId: 'P' }),
				kanbanTask('earlier-created', {
					start: '2027-01-10',
					createdAt: '2026-12-01T00:00:00.000Z'
				}),
				kanbanTask('missing-early'),
				kanbanTask('first', { start: '2027-01-01' })
			],
			['s1', 's2']
		);
		const index = indexTasks(plan.tasks);
		expect(ids(kanbanBoard(plan, index))[1]).toEqual([
			'first',
			'child-tie-z',
			'child-tie-a',
			'child-late',
			'child-missing',
			'earlier-created',
			'tie-z',
			'tie-a',
			'missing-early',
			'missing-late',
			'second-stage'
		]);
	});

	it('distinguishes no tasks and canceled leaves, including a parent with only canceled children', () => {
		const emptyPlan = makePlan([]);
		const emptyIndex = indexTasks(emptyPlan.tasks);
		expect(kanbanBoard(emptyPlan, emptyIndex)).toMatchObject({
			total: 0,
			emptyKind: 'no-tasks'
		});
		const plan = makePlan([
			kanbanTask('P'),
			kanbanTask('C', { parentId: 'P', status: 'canceled' })
		]);
		const index = indexTasks(plan.tasks);
		expect(kanbanBoard(plan, index)).toMatchObject({
			total: 0,
			emptyKind: 'all-canceled'
		});
		expect(ids(kanbanBoard(plan, index))).toEqual([[], [], [], []]);
		const childlessPlan = makePlan([kanbanTask('P')]);
		const childlessIndex = indexTasks(childlessPlan.tasks);
		expect(ids(kanbanBoard(childlessPlan, childlessIndex))).toEqual([[], ['P'], [], []]);
	});

	it('retains all 300 Done cards in deterministic traversal order', () => {
		const plan = done300();
		const index = indexTasks(plan.tasks);
		const board = kanbanBoard(plan, index);
		expect(board.columns.map((column) => column.count)).toEqual([0, 0, 0, 300]);
		expect(board).toMatchObject({ total: 300, emptyKind: 'none' });
		expect(ids(board)[3]).toEqual(
			Array.from({ length: 300 }, (_, i) => `D${String(i + 1).padStart(3, '0')}`)
		);
	});
});

describe('eligible Kanban edges', () => {
	it('marks inherited effective edges that participate in a cycle', () => {
		const plan = makePlan([
			kanbanTask('P', { dependsOn: ['X'] }),
			kanbanTask('C', { parentId: 'P' }),
			kanbanTask('X', { dependsOn: ['C'] })
		]);
		const index = indexTasks(plan.tasks);
		expect(kanbanEdges(index, new Set(['C', 'X']))).toEqual(
			expect.arrayContaining([
				{ from: 'X', to: 'C', key: lineKey('X', 'C'), cycle: true },
				{ from: 'C', to: 'X', key: lineKey('C', 'X'), cycle: true }
			])
		);
	});
	it('does not substitute children for an isolated parent endpoint', () => {
		const plan = isolatedParent();
		const index = indexTasks(plan.tasks);
		expect(kanbanEdges(index, new Set(['C1', 'C2', 'U']))).toEqual([]);
		const variant = isolatedParent(true);
		const variantIndex = indexTasks(variant.tasks);
		expect(kanbanEdges(variantIndex, new Set(['C1', 'C2', 'U']))).toEqual([
			{ from: 'C1', to: 'C2', key: lineKey('C1', 'C2'), cycle: false }
		]);
	});

	it('includes inherited leaf edges without creating an edge across an omitted parent or canceled leaf', () => {
		const plan = makePlan([
			kanbanTask('A'),
			kanbanTask('P', { dependsOn: ['A'] }),
			kanbanTask('C', { parentId: 'P' }),
			kanbanTask('D', { dependsOn: ['P'] }),
			kanbanTask('Z', { status: 'canceled', dependsOn: ['C'] }),
			kanbanTask('E', { dependsOn: ['Z'] })
		]);
		const index = indexTasks(plan.tasks);
		const leaves = new Set(
			kanbanBoard(plan, index).columns.flatMap((column) => column.cards.map((card) => card.id))
		);
		expect(kanbanEdges(index, leaves)).toEqual([
			{ from: 'A', to: 'C', key: lineKey('A', 'C'), cycle: false }
		]);
	});
});

describe('Kanban swimlanes', () => {
	it('projects eligible top-level cards and their effective parent state (AC-12, AC-13)', () => {
		const plan = mixedBoard();
		const index = indexTasks(plan.tasks);
		const board = kanbanSwimlanes(plan, index);
		const cards = board.lanes.flatMap((lane) => KANBAN_COLUMNS.flatMap((id) => lane.cells[id]));
		expect(cards.map((card) => card.id).sort()).toEqual(
			['P', 'after-derived', 'derived', 'finished', 'open', 'ready', 'stage-two', 'working'].sort()
		);
		expect(
			board.lanes.flatMap((lane) => lane.families.map((family) => family.parentId)).sort()
		).toEqual(['P', 'derived']);
		const parent = cards.find((card) => card.id === 'derived');
		expect(parent).toMatchObject({
			isParent: true,
			parentId: null,
			parentTitle: null,
			status: index.state.get('derived')!.eff.status,
			column: boardColumn(index.state.get('derived')!),
			summary: familySummary(index, 'derived')
		});
		expect(parent?.status).toBe('done');
	});

	it('counts garden cards across all lanes in column order (AC-14)', () => {
		const plan = garden();
		const board = kanbanSwimlanes(plan, indexTasks(plan.tasks));
		expect(board.columns.map((column) => column.id)).toEqual([...KANBAN_COLUMNS]);
		expect(board.columns.map((column) => column.count)).toEqual([2, 3, 1, 1]);
		expect(board.total).toBe(7);
		expect(board.columns.reduce((sum, column) => sum + column.count, 0)).toBe(board.total);
		expect(
			board.columns.map((column) =>
				board.lanes.reduce((sum, lane) => sum + lane.cells[column.id].length, 0)
			)
		).toEqual([2, 3, 1, 1]);
	});

	it('retains stage order and empty lanes with their metadata (AC-15)', () => {
		const plan = longStageTitle();
		plan.stages[1].color = 'amber';
		const board = kanbanSwimlanes(plan, indexTasks(plan.tasks));
		expect(
			board.lanes.map(({ stageId, stageNumber, stageTitle, color, count }) => ({
				stageId,
				stageNumber,
				stageTitle,
				color,
				count
			}))
		).toEqual([
			{ stageId: 's1', stageNumber: 1, stageTitle: 'W'.repeat(60), color: 'blue', count: 1 },
			{ stageId: 's2', stageNumber: 2, stageTitle: 's2', color: 'amber', count: 0 }
		]);
		expect(board.lanes[1].cells).toEqual({ blocked: [], todo: [], in_progress: [], done: [] });
		expect(board.lanes[1].families).toEqual([]);
	});

	it('keeps shared task order inside each stage and cell', () => {
		const plan = makePlan(
			[
				kanbanTask('missing-late', { createdAt: '2027-02-01T00:00:00.000Z' }),
				kanbanTask('tie-z', { start: '2027-01-10' }),
				kanbanTask('tie-a', { start: '2027-01-10' }),
				kanbanTask('earlier-created', {
					start: '2027-01-10',
					createdAt: '2026-01-01T00:00:00.000Z'
				}),
				kanbanTask('first', { start: '2027-01-01' }),
				kanbanTask('missing-early'),
				kanbanTask('second-stage', { stageId: 's2', start: '2026-01-01' }),
				kanbanTask('done', { status: 'done' })
			],
			['s1', 's2']
		);
		const board = kanbanSwimlanes(plan, indexTasks(plan.tasks));
		expect(board.lanes.map((lane) => lane.cells.todo.map((card) => card.id))).toEqual([
			['first', 'earlier-created', 'tie-z', 'tie-a', 'missing-early', 'missing-late'],
			['second-stage']
		]);
		expect(board.lanes[0].cells.done.map((card) => card.id)).toEqual(['done']);
	});

	it('includes canceled subtasks in family detail without a canceled card (AC-17)', () => {
		const plan = canceledSubtasks();
		const board = kanbanSwimlanes(plan, indexTasks(plan.tasks));
		expect(board.lanes).toHaveLength(1);
		expect(board.lanes[0].cells.in_progress.map((card) => card.id)).toEqual(['P']);
		expect(board.total).toBe(1);
		expect(board.lanes[0].families).toHaveLength(1);
		expect(board.lanes[0].families[0]).toMatchObject({
			parentId: 'P',
			total: 3,
			summary: { ready: 1, blocked: 0, inProgress: 0, done: 1, canceled: 1, total: 3 },
			children: [
				{ id: 'A', status: 'todo', column: 'todo' },
				{ id: 'B', status: 'done', column: 'done' },
				{ id: 'X', status: 'canceled', column: null }
			]
		});
		expect(
			board.lanes.flatMap((lane) =>
				KANBAN_COLUMNS.flatMap((id) => lane.cells[id].map((card) => card.id))
			)
		).not.toContain('T');
	});

	it('retains all 300 Done cards in order', () => {
		const plan = done300();
		const board = kanbanSwimlanes(plan, indexTasks(plan.tasks));
		expect(board.lanes).toHaveLength(1);
		expect(board.columns.map((column) => column.count)).toEqual([0, 0, 0, 300]);
		expect(board.total).toBe(300);
		expect(board.lanes[0].cells.done.map((card) => card.id)).toEqual(
			plan.tasks.map((task) => task.id)
		);
	});

	it('distinguishes empty kinds and does not mutate plans', () => {
		const empty = emptyStage();
		empty.tasks = [];
		const canceled = makePlan([
			kanbanTask('P'),
			kanbanTask('C', { parentId: 'P', status: 'canceled' })
		]);
		const before = structuredClone(canceled);
		const emptyBoard = kanbanSwimlanes(empty, indexTasks(empty.tasks));
		const board = kanbanSwimlanes(canceled, indexTasks(canceled.tasks));
		expect(emptyBoard.lanes).toHaveLength(2);
		expect(emptyBoard.emptyKind).toBe('no-tasks');
		expect(board.emptyKind).toBe('all-canceled');
		expect(board.lanes[0].families).toEqual([]);
		expect(canceled).toEqual(before);
	});
});
