import { describe, expect, it } from 'vitest';
import { kanbanColumnLabel } from '#lib/components/kanban/card-text.ts';
import { indexTasks } from '#lib/domain/derive.ts';
import type { Plan, Task } from '#lib/domain/schema.ts';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { KANBAN_COLUMNS, kanbanSwimlanes } from './kanban-board.ts';
import { done300, kanbanTask } from './kanban-fixtures.test-helper.ts';
import { kanbanPaperSegments, kanbanPaperItems } from './kanban-paper.ts';

function paper(plan: Plan, showSubtasks: (id: string) => boolean = () => false) {
	const segments = kanbanPaperSegments({
		plan,
		index: indexTasks(plan.tasks),
		showSubtasks,
		today: '2027-01-10'
	});
	const segment = segments[0];
	if (segment.kind !== 'scene') throw new Error('Expected the Kanban scene first');
	return { segments, segment };
}

describe('Kanban paper adapter', () => {
	it('uses swimlane items and repeats localized column totals and lane metadata (AC-23)', () => {
		const plan = makePlan(
			[
				kanbanTask('A'),
				kanbanTask('B', { dependsOn: ['A'] }),
				kanbanTask('C', { status: 'done' }),
				kanbanTask('D', { status: 'in_progress' })
			],
			['s1', 's2']
		);
		const board = kanbanSwimlanes(plan, indexTasks(plan.tasks));
		const { segment, segments } = paper(plan);
		expect(segment).toMatchObject({ id: 'kanban-scene', diagram: 'kanban', keep: 1, gap: 16 });
		expect(segment.items).toEqual(kanbanPaperItems(board, () => false).items);
		expect(segment.data).toMatchObject({
			columns: [
				{ id: 'blocked', count: 1 },
				{ id: 'todo', count: 1 },
				{ id: 'in_progress', count: 1 },
				{ id: 'done', count: 1 }
			],
			lanes: board.lanes.map(({ stageId, stageNumber, stageTitle, color, count }) => ({
				stageId,
				stageNumber,
				stageTitle,
				color,
				count
			}))
		});
		expect(KANBAN_COLUMNS.map(kanbanColumnLabel)).toEqual([
			'Blocked',
			'Todo',
			'In progress',
			'Done'
		]);
		expect(segments.slice(1)).toEqual([
			expect.objectContaining({ kind: 'legend', which: 'stages' })
		]);
	});
	it('passes per-parent print detail selection to the item model (AC-40)', () => {
		const plan = makePlan([
			kanbanTask('P'),
			kanbanTask('C1', { parentId: 'P' }),
			kanbanTask('Q'),
			kanbanTask('C2', { parentId: 'Q' })
		]);
		const board = kanbanSwimlanes(plan, indexTasks(plan.tasks));
		for (const selected of [() => false, (id: string) => id === 'P', () => true]) {
			expect(paper(plan, selected).segment.items).toEqual(kanbanPaperItems(board, selected).items);
		}
	});
	it.each<{ tasks: Task[]; emptyKind: 'no-tasks' | 'all-canceled' }>([
		{ tasks: [], emptyKind: 'no-tasks' },
		{ tasks: [kanbanTask('canceled', { status: 'canceled' })], emptyKind: 'all-canceled' }
	])('emits only empty lane items for $emptyKind (AC-65)', ({ tasks, emptyKind }) => {
		const plan = makePlan(tasks, ['s1', 's2']);
		const { segment } = paper(plan);
		expect(segment.data).toMatchObject({ emptyKind });
		expect(segment.items).toEqual([
			{ kind: 'lane-empty', laneId: 's1' },
			{ kind: 'lane-empty', laneId: 's2' }
		]);
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
