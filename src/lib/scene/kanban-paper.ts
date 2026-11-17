import type { BoardColumn } from '#lib/domain/derive.ts';
import type { DiagramSegment, PrintModelInput } from '#lib/domain/print-model.ts';
import {
	KANBAN_COLUMNS,
	kanbanSwimlanes,
	type KanbanCard,
	type KanbanEmptyKind,
	type KanbanFamily,
	type KanbanItem,
	type KanbanLane,
	type KanbanSwimlanes
} from './kanban-board.ts';
export interface KanbanPaperSceneData {
	columns: { id: BoardColumn; count: number }[];
	lanes: (Pick<KanbanLane, 'stageId' | 'stageNumber' | 'stageTitle' | 'color' | 'count'> & {
		families: Pick<KanbanFamily, 'parentId' | 'title' | 'total'>[];
	})[];
	emptyKind: KanbanEmptyKind;
}
export function kanbanPaperSegments(input: PrintModelInput): DiagramSegment[] {
	const board = kanbanSwimlanes(input.plan, input.index);
	const scene = kanbanPaperItems(board, input.showSubtasks);
	const data: KanbanPaperSceneData = {
		columns: scene.repeat.columns.map(({ id, count }) => ({
			id,
			count
		})),
		lanes: board.lanes.map(({ stageId, stageNumber, stageTitle, color, count, families }) => ({
			stageId,
			stageNumber,
			stageTitle,
			color,
			count,
			families: families.map(({ parentId, title, total }) => ({
				parentId,
				title,
				total
			}))
		})),
		emptyKind: scene.repeat.emptyKind
	};
	return [
		{
			kind: 'scene',
			id: 'kanban-scene',
			diagram: 'kanban',
			items: scene.items,
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
