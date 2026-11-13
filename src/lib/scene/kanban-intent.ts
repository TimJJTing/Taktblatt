import { boardColumn, indexTasks, type TaskIndex } from '#lib/domain/derive.ts';
import type { Plan } from '#lib/domain/schema.ts';
import { KANBAN_COLUMNS } from './kanban-board.ts';
export interface KanbanIntent {
	sourcePlanId: string;
	taskId: string;
	targetColumn: string;
}
export interface KanbanIntentContext {
	activePlanId: string;
	plan: Plan;
	index: TaskIndex;
}
type Status = 'todo' | 'in_progress' | 'done';
export type KanbanIntentResult =
	| { kind: 'request'; taskId: string; patch: { status: Status } }
	| {
			kind: 'reject';
			reason:
				| 'stale-plan'
				| 'missing-task'
				| 'canceled-task'
				| 'parent-task'
				| 'unavailable-target'
				| 'incompatible-column';
	  }
	| { kind: 'noop' };
export function resolveKanbanIntent(
	ctx: KanbanIntentContext,
	intent: KanbanIntent
): KanbanIntentResult {
	if (intent.sourcePlanId !== ctx.activePlanId || intent.sourcePlanId !== ctx.plan.id)
		return { kind: 'reject', reason: 'stale-plan' };
	const task = ctx.index.byId.get(intent.taskId);
	if (!task) return { kind: 'reject', reason: 'missing-task' };
	if (task.status === 'canceled') return { kind: 'reject', reason: 'canceled-task' };
	if (ctx.index.children.get(task.id)?.length) return { kind: 'reject', reason: 'parent-task' };
	if (!KANBAN_COLUMNS.some((c) => c === intent.targetColumn))
		return { kind: 'reject', reason: 'unavailable-target' };
	if (boardColumn(ctx.index.state.get(task.id)!) === intent.targetColumn) return { kind: 'noop' };
	const status: Status =
		intent.targetColumn === 'blocked' || intent.targetColumn === 'todo'
			? 'todo'
			: (intent.targetColumn as Status);
	if (status === 'todo') {
		const index = indexTasks(
			ctx.plan.tasks.map((t) => (t.id === task.id ? { ...t, status: 'todo' as const } : t))
		);
		if (boardColumn(index.state.get(task.id)!) !== intent.targetColumn)
			return { kind: 'reject', reason: 'incompatible-column' };
	}
	return { kind: 'request', taskId: task.id, patch: { status } };
}
export class KanbanIntentHolder {
	private intent: KanbanIntent | null;
	constructor(intent: KanbanIntent) {
		this.intent = intent;
	}
	cancel() {
		this.intent = null;
	}
	resolve(ctx: KanbanIntentContext): KanbanIntentResult {
		const intent = this.intent;
		this.intent = null;
		return intent ? resolveKanbanIntent(ctx, intent) : { kind: 'noop' };
	}
}
export function dispatchKanbanIntent<W>(
	ctx: KanbanIntentContext,
	holder: KanbanIntentHolder,
	workspace: W,
	updateTask: (workspace: W, taskId: string, patch: { status: Status }) => void
): KanbanIntentResult {
	const result = holder.resolve(ctx);
	if (result.kind === 'request') updateTask(workspace, result.taskId, result.patch);
	return result;
}
