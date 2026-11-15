import { describe, expect, it } from 'vitest';
import { indexTasks } from '#lib/domain/derive.ts';
import { lineKey } from '#lib/domain/route.ts';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { KANBAN_COLUMNS, kanbanBoard, kanbanEdges } from './kanban-board.ts';
import { done300, isolatedParent, kanbanTask, mixedBoard } from './kanban-fixtures.test-helper.ts';

const ids = (board: ReturnType<typeof kanbanBoard>) =>
	board.columns.map((column) => column.cards.map((card) => card.id));

describe('Kanban leaf projection', () => {
	it('projects inherited blockers, satisfied prerequisites and stored progress without parent cards', () => {
		const plan = mixedBoard();
		const before = structuredClone(plan);
		const board = kanbanBoard(plan);
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
		expect(ids(kanbanBoard(plan, indexTasks(plan.tasks)))[1]).toEqual([
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
		expect(kanbanBoard(makePlan([]))).toMatchObject({ total: 0, emptyKind: 'no-tasks' });
		const plan = makePlan([
			kanbanTask('P'),
			kanbanTask('C', { parentId: 'P', status: 'canceled' })
		]);
		expect(kanbanBoard(plan)).toMatchObject({ total: 0, emptyKind: 'all-canceled' });
		expect(ids(kanbanBoard(plan))).toEqual([[], [], [], []]);
		plan.tasks = [kanbanTask('P')];
		expect(ids(kanbanBoard(plan))).toEqual([[], ['P'], [], []]);
	});

	it('retains all 300 Done cards in deterministic traversal order', () => {
		const board = kanbanBoard(done300());
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
		expect(kanbanEdges(indexTasks(plan.tasks), new Set(['C', 'X']))).toEqual(
			expect.arrayContaining([
				{ from: 'X', to: 'C', key: lineKey('X', 'C'), cycle: true },
				{ from: 'C', to: 'X', key: lineKey('C', 'X'), cycle: true }
			])
		);
	});
	it('does not substitute children for an isolated parent endpoint', () => {
		const plan = isolatedParent();
		expect(kanbanEdges(indexTasks(plan.tasks), new Set(['C1', 'C2', 'U']))).toEqual([]);
		const variant = isolatedParent(true);
		expect(kanbanEdges(indexTasks(variant.tasks), new Set(['C1', 'C2', 'U']))).toEqual([
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
		const leaves = new Set(
			kanbanBoard(plan).columns.flatMap((column) => column.cards.map((card) => card.id))
		);
		expect(kanbanEdges(indexTasks(plan.tasks), leaves)).toEqual([
			{ from: 'A', to: 'C', key: lineKey('A', 'C'), cycle: false }
		]);
	});
});
