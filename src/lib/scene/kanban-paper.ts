import type { BoardColumn } from '#lib/domain/derive.ts';
import type { DiagramSegment, PrintModelInput } from '#lib/domain/print-model.ts';
import { m } from '#lib/paraglide/messages.js';
import {
	KANBAN_COLUMNS,
	kanbanBoard,
	type KanbanCard,
	type KanbanEmptyKind,
	type KanbanItem,
	type KanbanSwimlanes
} from './kanban-board.ts';
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

export type KanbanPaperItem =
	| { kind: 'lane-start'; laneId: string; cards: (KanbanCard | null)[] }
	| { kind: 'card-row'; laneId: string; cards: (KanbanCard | null)[] }
	| { kind: 'family-start'; laneId: string; parentId: string; line: KanbanItem }
	| { kind: 'family-line'; laneId: string; parentId: string; line: KanbanItem }
	| { kind: 'lane-empty'; laneId: string };
export interface KanbanPaperScene {
	items: KanbanPaperItem[];
	repeat: { columns: { id: BoardColumn; count: number }[]; emptyKind: KanbanEmptyKind };
}
/** Build paper items in lane order with the selected family detail. */
export function kanbanPaperItems(
	board: KanbanSwimlanes,
	showSubtasks: (taskId: string) => boolean
): KanbanPaperScene {
	const items: KanbanPaperItem[] = [];
	for (const lane of board.lanes) {
		const rowCount = Math.max(...KANBAN_COLUMNS.map((id) => lane.cells[id].length));
		if (rowCount === 0) {
			items.push({ kind: 'lane-empty', laneId: lane.stageId });
			continue;
		}
		for (let i = 0; i < rowCount; i++) {
			items.push({
				kind: i === 0 ? 'lane-start' : 'card-row',
				laneId: lane.stageId,
				cards: KANBAN_COLUMNS.map((id) => lane.cells[id][i] ?? null)
			});
		}
		for (const family of lane.families) {
			if (!showSubtasks(family.parentId)) continue;
			for (const [i, line] of family.children.entries()) {
				items.push({
					kind: i === 0 ? 'family-start' : 'family-line',
					laneId: lane.stageId,
					parentId: family.parentId,
					line
				});
			}
		}
	}
	return {
		items,
		repeat: {
			columns: board.columns.map(({ id, count }) => ({ id, count })),
			emptyKind: board.emptyKind
		}
	};
}
