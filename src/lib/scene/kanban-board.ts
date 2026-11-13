import {
	boardColumn,
	indexTasks,
	type BoardColumn,
	type Readiness,
	type TaskIndex
} from '#lib/domain/derive.ts';
import { dependencyEdgeKey, dependencyWarnings } from '#lib/domain/dependencies.ts';
import { effectiveDependencyGraph, lineKey } from '#lib/domain/route.ts';
import type { Plan, Task, TaskStatus } from '#lib/domain/schema.ts';
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
}
export interface KanbanBoard {
	columns: { id: BoardColumn; cards: KanbanCard[]; count: number }[];
	total: number;
	emptyKind: KanbanEmptyKind;
}
export function kanbanBoard(plan: Plan, index: TaskIndex = indexTasks(plan.tasks)): KanbanBoard {
	const columns = KANBAN_COLUMNS.map((id) => ({ id, cards: [] as KanbanCard[], count: 0 }));
	for (const [i, stage] of plan.stages.entries()) {
		const add = (task: Task, parent: Task | null) => {
			const state = index.state.get(task.id)!;
			const column = boardColumn(state);
			if (!column) return;
			columns
				.find((c) => c.id === column)!
				.cards.push({
					id: task.id,
					title: task.title,
					status: task.status,
					column,
					stageId: stage.id,
					stageNumber: i + 1,
					stageTitle: stage.title,
					parentId: parent?.id ?? null,
					parentTitle: parent?.title ?? null,
					owners: state.eff.owners,
					start: state.eff.start,
					end: state.eff.end,
					readiness: state.readiness
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
	const cycles = new Set(
		dependencyWarnings(index)
			.filter((w) => w.kind === 'cycle')
			.map((w) => dependencyEdgeKey(w.taskId, w.dependencyId))
	);
	return effectiveDependencyGraph(index)
		.pairs.filter(([from, to]) => leafIds.has(from) && leafIds.has(to))
		.map(([from, to]) => ({
			from,
			to,
			key: lineKey(from, to),
			cycle: cycles.has(dependencyEdgeKey(to, from))
		}));
}
