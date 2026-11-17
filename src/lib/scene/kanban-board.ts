import {
	boardColumn,
	familySummary,
	type BoardColumn,
	type FamilySummary,
	type Readiness,
	type TaskIndex,
	type TaskState
} from '#lib/domain/derive.ts';
import type { Plan, Stage, Task, TaskStatus } from '#lib/domain/schema.ts';

export const KANBAN_COLUMNS = ['blocked', 'todo', 'in_progress', 'done'] as const;
export type KanbanEmptyKind = 'none' | 'no-tasks' | 'all-canceled';
export interface KanbanCard {
	id: string;
	title: string;
	status: TaskStatus;
	column: BoardColumn;
	stageNumber: number;
	stageTitle: string;
	owners: string[];
	start: string | null;
	end: string | null;
	readiness: Readiness;
	isParent: boolean;
	summary: FamilySummary | null;
}
function buildCard(
	task: Task,
	state: TaskState,
	column: BoardColumn,
	stage: Stage,
	stageNumber: number,
	summary: FamilySummary | null = null
): KanbanCard {
	return {
		id: task.id,
		title: task.title,
		status: state.eff.status,
		column,
		stageNumber,
		stageTitle: stage.title,
		owners: state.eff.owners,
		start: state.eff.start,
		end: state.eff.end,
		readiness: state.readiness,
		isParent: summary !== null,
		summary
	};
}
export interface KanbanItem {
	id: string;
	title: string;
	status: TaskStatus;
	column: BoardColumn | null;
	parentId: string;
}
export interface KanbanFamily {
	parentId: string;
	title: string;
	total: number;
	children: KanbanItem[];
}
export interface KanbanLane {
	stageId: string;
	stageNumber: number;
	stageTitle: string;
	color: Stage['color'];
	count: number;
	cells: Record<BoardColumn, KanbanCard[]>;
	families: KanbanFamily[];
}
export interface KanbanSwimlanes {
	columns: { id: BoardColumn; count: number }[];
	lanes: KanbanLane[];
	total: number;
	emptyKind: KanbanEmptyKind;
}
/** Build stage lanes from the current task index. */
export function kanbanSwimlanes(plan: Plan, index: TaskIndex): KanbanSwimlanes {
	const lanes = plan.stages.map((stage, i) => {
		const lane: KanbanLane = {
			stageId: stage.id,
			stageNumber: i + 1,
			stageTitle: stage.title,
			color: stage.color,
			count: 0,
			cells: { blocked: [], todo: [], in_progress: [], done: [] },
			families: []
		};
		for (const task of index.stageTasks.get(stage.id) ?? []) {
			const state = index.state.get(task.id)!;
			const column = boardColumn(state);
			if (column === null) continue;
			const children = index.children.get(task.id) ?? [];
			const summary = children.length ? familySummary(index, task.id) : null;
			lane.cells[column].push(buildCard(task, state, column, stage, i + 1, summary));
			lane.count++;
			if (summary !== null) {
				lane.families.push({
					parentId: task.id,
					title: task.title,
					total: children.length,
					children: children.map((child) => {
						const childState = index.state.get(child.id)!;
						return {
							id: child.id,
							title: child.title,
							status: childState.eff.status,
							column: boardColumn(childState),
							parentId: task.id
						};
					})
				});
			}
		}
		return lane;
	});
	const columns = KANBAN_COLUMNS.map((id) => ({
		id,
		count: lanes.reduce((sum, lane) => sum + lane.cells[id].length, 0)
	}));
	const total = columns.reduce((sum, column) => sum + column.count, 0);
	return {
		columns,
		lanes,
		total,
		emptyKind: total ? 'none' : plan.tasks.length ? 'all-canceled' : 'no-tasks'
	};
}
