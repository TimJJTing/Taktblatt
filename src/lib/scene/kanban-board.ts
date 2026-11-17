import {
	boardColumn,
	familySummary,
	type BoardColumn,
	type FamilySummary,
	type Readiness,
	type TaskIndex,
	type TaskState
} from '#lib/domain/derive.ts';
import { reaches } from '#lib/domain/dependencies.ts';
import { effectiveDependencyGraph, lineKey } from '#lib/domain/route.ts';
import type { Plan, Stage, Task, TaskStatus } from '#lib/domain/schema.ts';
import type { EdgeRef } from './types.ts';

export const KANBAN_COLUMNS = ['blocked', 'todo', 'in_progress', 'done'] as const;
export type KanbanEmptyKind = 'none' | 'no-tasks' | 'all-canceled';
export interface KanbanCard {
	id: string;
	title: string;
	status: TaskStatus;
	column: BoardColumn;
	stageId: string;
	stageNumber: number;
	stageTitle: string;
	parentId: string | null;
	parentTitle: string | null;
	owners: string[];
	start: string | null;
	end: string | null;
	readiness: Readiness;
	isParent: boolean;
	summary: FamilySummary | null;
}
export interface KanbanBoard {
	columns: { id: BoardColumn; cards: KanbanCard[]; count: number }[];
	total: number;
	emptyKind: KanbanEmptyKind;
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
		stageId: stage.id,
		stageNumber,
		stageTitle: stage.title,
		parentId: null,
		parentTitle: null,
		owners: state.eff.owners,
		start: state.eff.start,
		end: state.eff.end,
		readiness: state.readiness,
		isParent: summary !== null,
		summary
	};
}
/** Use an index built from this plan's current tasks. */
export function kanbanBoard(plan: Plan, index: TaskIndex): KanbanBoard {
	const columns = KANBAN_COLUMNS.map((id) => ({ id, cards: [] as KanbanCard[], count: 0 }));
	for (const [i, stage] of plan.stages.entries()) {
		const add = (task: Task, parent: Task | null) => {
			const state = index.state.get(task.id)!;
			const column = boardColumn(state);
			if (!column) return;
			columns
				.find((c) => c.id === column)!
				.cards.push({
					...buildCard(task, state, column, stage, i + 1),
					status: task.status,
					parentId: parent?.id ?? null,
					parentTitle: parent?.title ?? null
				});
		};
		for (const task of index.stageTasks.get(stage.id) ?? []) {
			const children = index.children.get(task.id) ?? [];
			if (children.length) children.forEach((child) => add(child, task));
			else add(task, null);
		}
	}
	for (const column of columns) column.count = column.cards.length;
	const total = columns.reduce((sum, c) => sum + c.count, 0);
	return {
		columns,
		total,
		emptyKind: total ? 'none' : plan.tasks.length ? 'all-canceled' : 'no-tasks'
	};
}
export function kanbanEdges(index: TaskIndex, leafIds: ReadonlySet<string>): EdgeRef[] {
	return effectiveDependencyGraph(index)
		.pairs.filter(([from, to]) => leafIds.has(from) && leafIds.has(to))
		.map(([from, to]) => ({
			from,
			to,
			key: lineKey(from, to),
			cycle: reaches(index, from, to)
		}));
}

export interface KanbanItem {
	id: string;
	title: string;
	status: TaskStatus;
	column: BoardColumn | null;
	parentId: string;
	readiness: Readiness;
}
export interface KanbanFamily {
	parentId: string;
	title: string;
	total: number;
	summary: FamilySummary;
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
					summary,
					children: children.map((child) => {
						const childState = index.state.get(child.id)!;
						return {
							id: child.id,
							title: child.title,
							status: childState.eff.status,
							column: boardColumn(childState),
							parentId: task.id,
							readiness: childState.readiness
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
