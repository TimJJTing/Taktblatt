import type { BoardColumn } from '#lib/domain/derive.ts';
import type { DiagramSegment, PrintModelInput } from '#lib/domain/print-model.ts';
import { m } from '#lib/paraglide/messages.js';
import { kanbanBoard, type KanbanCard, type KanbanEmptyKind } from './kanban-board.ts';
export const KANBAN_PAPER_METRICS = { cardHeight: (34 * 96) / 25.4 };
export interface KanbanPaperRow {
	cards: readonly (KanbanCard | null)[];
}
export interface KanbanPaperData {
	columns: { id: BoardColumn; label: string; count: number }[];
	emptyKind: KanbanEmptyKind;
}
export function kanbanColumnLabel(id: BoardColumn): string {
	switch (id) {
		case 'blocked':
			return m.kanban_blocked();
		case 'todo':
			return m.task_status_todo();
		case 'in_progress':
			return m.task_status_in_progress();
		case 'done':
			return m.task_status_done();
	}
}
export function kanbanPaperSegments(input: PrintModelInput): DiagramSegment[] {
	const board = kanbanBoard(input.plan, input.index);
	const data: KanbanPaperData = {
		columns: board.columns.map((c) => ({
			id: c.id,
			label: kanbanColumnLabel(c.id),
			count: c.count
		})),
		emptyKind: board.emptyKind
	};
	const items: KanbanPaperRow[] = Array.from(
		{ length: Math.max(1, ...board.columns.map((c) => c.count)) },
		(_, i) => ({ cards: board.columns.map((c) => c.cards[i] ?? null) })
	);
	return [
		{
			kind: 'scene',
			id: 'kanban-scene',
			diagram: 'kanban',
			items,
			data,
			keep: 1,
			gap: 16,
			breakBefore: false
		},
		{ kind: 'legend', id: 'legend-stages', which: 'stages', keep: 1, gap: 6, breakBefore: false }
	];
}
