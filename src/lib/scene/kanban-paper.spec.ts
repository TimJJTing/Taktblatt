import { describe, expect, it } from 'vitest';
import { indexTasks } from '#lib/domain/derive.ts';
import type { Plan, Task } from '#lib/domain/schema.ts';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { kanbanBoard, kanbanSwimlanes } from './kanban-board.ts';
import { done300, isolatedParent, kanbanTask } from './kanban-fixtures.test-helper.ts';
import {
	KANBAN_PAPER_METRICS,
	kanbanPaperSegments,
	kanbanPaperItems,
	type KanbanPaperData,
	type KanbanPaperRow
} from './kanban-paper.ts';

function paper(plan: Plan, showSubtasks = false) {
	const segments = kanbanPaperSegments({
		plan,
		index: indexTasks(plan.tasks),
		showSubtasks: () => showSubtasks,
		today: '2027-01-10'
	});
	const segment = segments[0];
	if (segment.kind !== 'scene') throw new Error('Expected the Kanban scene first');
	return {
		segments,
		segment,
		rows: segment.items as KanbanPaperRow[],
		data: segment.data as KanbanPaperData
	};
}

const rowIds = (rows: KanbanPaperRow[]) =>
	rows.flatMap((row) => row.cards.flatMap((card) => (card ? [card.id] : [])));

describe('Kanban paper card rows', () => {
	it('uses complete four-column rows and repeats total counts instead of fragment counts', () => {
		const plan = makePlan([
			kanbanTask('A'),
			kanbanTask('B'),
			kanbanTask('C', { dependsOn: ['A'] }),
			kanbanTask('D', { status: 'done' }),
			kanbanTask('E', { status: 'in_progress' })
		]);
		const { segment, rows, data, segments } = paper(plan);
		expect(segment).toMatchObject({ kind: 'scene', id: 'kanban-scene', diagram: 'kanban' });
		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.cards.map((card) => card?.id ?? null))).toEqual([
			['C', 'A', 'E', 'D'],
			[null, 'B', null, null]
		]);
		expect(data.columns).toEqual([
			{ id: 'blocked', label: 'Blocked', count: 1 },
			{ id: 'todo', label: 'Todo', count: 2 },
			{ id: 'in_progress', label: 'In progress', count: 1 },
			{ id: 'done', label: 'Done', count: 1 }
		]);
		expect(segments.slice(1)).toEqual([
			expect.objectContaining({ kind: 'legend', which: 'stages' })
		]);
	});

	it.each([false, true])(
		'includes every Done id once with fixed paper metrics (unbroken title: %s)',
		(longTitle) => {
			const plan = done300(longTitle);
			const { rows, data } = paper(plan);
			expect(rows).toHaveLength(300);
			expect(rowIds(rows)).toEqual(plan.tasks.map((task) => task.id));
			expect(new Set(rowIds(rows)).size).toBe(300);
			expect(data.columns.map((column) => column.count)).toEqual([0, 0, 0, 300]);
			expect(KANBAN_PAPER_METRICS.cardHeight).toBeCloseTo((34 * 96) / 25.4, 6);
			if (longTitle) expect(rows[149].cards[3]?.title).toBe('W'.repeat(512));
		}
	);

	it.each<{ tasks: Task[]; emptyKind: 'no-tasks' | 'all-canceled' }>([
		{ tasks: [], emptyKind: 'no-tasks' },
		{ tasks: [kanbanTask('canceled', { status: 'canceled' })], emptyKind: 'all-canceled' }
	])('prints one item with explanation data for $emptyKind', ({ tasks, emptyKind }) => {
		const { rows, data } = paper(makePlan(tasks));
		expect(rows).toHaveLength(1);
		expect(rowIds(rows)).toEqual([]);
		expect(data.emptyKind).toBe(emptyKind);
		expect(data.columns.map((column) => column.count)).toEqual([0, 0, 0, 0]);
	});

	// The Kanban family detail slice will replace this leaf projection.
	it('uses the same leaves and traversal regardless of print detail', () => {
		const plan = isolatedParent(true);
		const withoutSubtasks = paper(plan),
			withSubtasks = paper(plan, true);
		expect(withoutSubtasks.rows).toEqual(withSubtasks.rows);
		expect(rowIds(withoutSubtasks.rows).sort()).toEqual(['C1', 'C2', 'U']);
		const screen = kanbanBoard(plan, indexTasks(plan.tasks)).columns;
		for (let column = 0; column < 4; column++) {
			expect(
				withoutSubtasks.rows.flatMap((row) => (row.cards[column] ? [row.cards[column]!.id] : []))
			).toEqual(screen[column].cards.map((card) => card.id));
		}
	});
});

describe('Kanban paper items', () => {
	function paperBoard() {
		const plan = makePlan(
			[
				kanbanTask('P'),
				kanbanTask('A', { parentId: 'P' }),
				kanbanTask('B', { parentId: 'P', status: 'done' }),
				kanbanTask('Q'),
				kanbanTask('C', { parentId: 'Q' }),
				kanbanTask('D', { parentId: 'Q' }),
				kanbanTask('R'),
				kanbanTask('other', { stageId: 's2', status: 'done' })
			],
			['s1', 's2', 's3']
		);
		return kanbanSwimlanes(plan, indexTasks(plan.tasks));
	}

	it('keeps headings with first rows and emits all five kinds in order (AC-23, AC-65)', () => {
		const result = kanbanPaperItems(paperBoard(), () => true);
		expect(result.items.map((item) => [item.kind, item.laneId])).toEqual([
			['lane-start', 's1'],
			['card-row', 's1'],
			['family-start', 's1'],
			['family-line', 's1'],
			['family-start', 's1'],
			['family-line', 's1'],
			['lane-start', 's2'],
			['lane-empty', 's3']
		]);
		expect(result.items[0]).toMatchObject({
			kind: 'lane-start',
			cards: [null, { id: 'Q' }, { id: 'P' }, null]
		});
		expect(result.items[1]).toMatchObject({
			kind: 'card-row',
			cards: [null, { id: 'R' }, null, null]
		});
		expect(result.items[2]).toMatchObject({
			kind: 'family-start',
			parentId: 'P',
			line: { id: 'A' }
		});
		expect(result.items[3]).toMatchObject({
			kind: 'family-line',
			parentId: 'P',
			line: { id: 'B' }
		});
		expect(result.items.filter((item) => item.laneId === 's3')).toEqual([
			{ kind: 'lane-empty', laneId: 's3' }
		]);
		expect(result.repeat).toEqual({
			columns: [
				{ id: 'blocked', count: 0 },
				{ id: 'todo', count: 2 },
				{ id: 'in_progress', count: 1 },
				{ id: 'done', count: 1 }
			],
			emptyKind: 'none'
		});
	});

	it('selects family detail separately for each parent (AC-40)', () => {
		const board = paperBoard();
		const selected = kanbanPaperItems(board, (id) => id === 'P');
		expect(
			selected.items
				.filter((item) => item.kind === 'family-start' || item.kind === 'family-line')
				.map((item) => item.parentId)
		).toEqual(['P', 'P']);
		const none = kanbanPaperItems(board, () => false);
		expect(none.items.map((item) => item.kind)).toEqual([
			'lane-start',
			'card-row',
			'lane-start',
			'lane-empty'
		]);
	});

	it('puts every one of 300 Done cards in exactly one item', () => {
		const plan = done300();
		const board = kanbanSwimlanes(plan, indexTasks(plan.tasks));
		const result = kanbanPaperItems(board, () => true);
		const ids = result.items.flatMap((item) =>
			item.kind === 'lane-start' || item.kind === 'card-row'
				? item.cards.flatMap((card) => (card ? [card.id] : []))
				: []
		);
		expect(ids).toEqual(plan.tasks.map((task) => task.id));
		expect(new Set(ids).size).toBe(300);
	});
});
