import { describe, expect, it } from 'vitest';
import { indexTasks } from '#lib/domain/derive.ts';
import type { Plan, Task } from '#lib/domain/schema.ts';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { kanbanBoard } from './kanban-board.ts';
import { done300, isolatedParent, kanbanTask } from './kanban-fixtures.test-helper.ts';
import {
	KANBAN_PAPER_METRICS,
	kanbanPaperSegments,
	type KanbanPaperData,
	type KanbanPaperRow
} from './kanban-paper.ts';

function paper(plan: Plan, expanded = false) {
	const segments = kanbanPaperSegments({
		plan,
		index: indexTasks(plan.tasks),
		isExpanded: () => expanded,
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

	it('uses the same leaves and traversal regardless of Work plan expansion', () => {
		const plan = isolatedParent(true);
		const collapsed = paper(plan),
			expanded = paper(plan, true);
		expect(collapsed.rows).toEqual(expanded.rows);
		expect(rowIds(collapsed.rows).sort()).toEqual(['C1', 'C2', 'U']);
		const screen = kanbanBoard(plan).columns;
		for (let column = 0; column < 4; column++) {
			expect(
				collapsed.rows.flatMap((row) => (row.cards[column] ? [row.cards[column]!.id] : []))
			).toEqual(screen[column].cards.map((card) => card.id));
		}
	});
});
