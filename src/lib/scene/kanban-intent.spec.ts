import { describe, expect, it, vi } from 'vitest';
import { indexTasks } from '#lib/domain/derive.ts';
import type { Plan } from '#lib/domain/schema.ts';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { kanbanTask } from './kanban-fixtures.test-helper.ts';
import {
	KanbanIntentHolder,
	dispatchKanbanIntent,
	resolveKanbanIntent,
	type KanbanIntent,
	type KanbanIntentContext
} from './kanban-intent.ts';

const context = (plan: Plan): KanbanIntentContext => ({
	activePlanId: plan.id,
	plan,
	index: indexTasks(plan.tasks)
});
const intent = (plan: Plan, taskId: string, targetColumn: string): KanbanIntent => ({
	sourcePlanId: plan.id,
	taskId,
	targetColumn
});

describe('future Kanban status intents', () => {
	it.each(['in_progress', 'done'] as const)(
		'requests %s even when a dependency is unfinished',
		(status) => {
			const plan = makePlan([kanbanTask('A'), kanbanTask('B', { dependsOn: ['A'] })]);
			const before = structuredClone(plan);
			expect(resolveKanbanIntent(context(plan), intent(plan, 'B', status))).toEqual({
				kind: 'request',
				taskId: 'B',
				patch: { status }
			});
			expect(plan).toEqual(before);
		}
	);

	it('evaluates hypothetical Todo with inherited, canceled and derived parent prerequisites', () => {
		const plan = makePlan([
			kanbanTask('open'),
			kanbanTask('P', { dependsOn: ['open'] }),
			kanbanTask('blocked-child', { parentId: 'P', status: 'done' }),
			kanbanTask('canceled', { status: 'canceled' }),
			kanbanTask('derived'),
			kanbanTask('done-child', { parentId: 'derived', status: 'done' }),
			kanbanTask('ready', { status: 'in_progress', dependsOn: ['canceled', 'derived'] })
		]);
		const before = structuredClone(plan);
		expect(resolveKanbanIntent(context(plan), intent(plan, 'blocked-child', 'blocked'))).toEqual({
			kind: 'request',
			taskId: 'blocked-child',
			patch: { status: 'todo' }
		});
		expect(resolveKanbanIntent(context(plan), intent(plan, 'blocked-child', 'todo'))).toMatchObject(
			{ kind: 'reject', reason: 'incompatible-column' }
		);
		expect(resolveKanbanIntent(context(plan), intent(plan, 'ready', 'todo'))).toEqual({
			kind: 'request',
			taskId: 'ready',
			patch: { status: 'todo' }
		});
		expect(resolveKanbanIntent(context(plan), intent(plan, 'ready', 'blocked'))).toMatchObject({
			kind: 'reject',
			reason: 'incompatible-column'
		});
		expect(plan).toEqual(before);
	});

	it('rejects missing, canceled, parent and unavailable targets and leaves the plan unchanged', () => {
		const plan = makePlan([
			kanbanTask('P'),
			kanbanTask('C', { parentId: 'P' }),
			kanbanTask('Z', { status: 'canceled' })
		]);
		const before = structuredClone(plan);
		for (const [taskId, target, reason] of [
			['missing', 'done', 'missing-task'],
			['Z', 'done', 'canceled-task'],
			['P', 'done', 'parent-task'],
			['C', 'canceled', 'unavailable-target']
		]) {
			expect(resolveKanbanIntent(context(plan), intent(plan, taskId, target))).toEqual({
				kind: 'reject',
				reason
			});
		}
		expect(plan).toEqual(before);
	});

	it('does nothing for the current derived column', () => {
		const plan = makePlan([
			kanbanTask('ready'),
			kanbanTask('blocked', { dependsOn: ['ready'] }),
			kanbanTask('working', { status: 'in_progress' }),
			kanbanTask('done', { status: 'done' })
		]);
		for (const [taskId, column] of [
			['ready', 'todo'],
			['blocked', 'blocked'],
			['working', 'in_progress'],
			['done', 'done']
		]) {
			expect(resolveKanbanIntent(context(plan), intent(plan, taskId, column))).toEqual({
				kind: 'noop'
			});
		}
	});

	it('rejects a source-plan mismatch before task lookup when two plans share an id', () => {
		const first = makePlan([kanbanTask('same')]),
			second = makePlan([kanbanTask('same')]);
		first.id = 'first';
		second.id = 'second';
		const ctx = context(second);
		const lookup = vi.spyOn(ctx.index.byId, 'get');
		const membership = vi.spyOn(ctx.index.byId, 'has');
		expect(resolveKanbanIntent(ctx, intent(first, 'same', 'done'))).toEqual({
			kind: 'reject',
			reason: 'stale-plan'
		});
		expect(lookup).not.toHaveBeenCalled();
		expect(membership).not.toHaveBeenCalled();
	});

	it('resolves pending intents against the current index at commit time', () => {
		const plan = makePlan([kanbanTask('A'), kanbanTask('B', { status: 'done', dependsOn: ['A'] })]);
		const pending = new KanbanIntentHolder(intent(plan, 'B', 'todo'));
		plan.tasks[0].status = 'done';
		expect(pending.resolve(context(plan))).toEqual({
			kind: 'request',
			taskId: 'B',
			patch: { status: 'todo' }
		});
	});
});

describe('cancellation and dispatch seam', () => {
	it('cancellation on plan activation survives two plans with the same task id and return', () => {
		const first = makePlan([kanbanTask('same')]);
		const second = makePlan([kanbanTask('same')]);
		first.id = 'first';
		second.id = 'second';
		const pending = new KanbanIntentHolder(intent(first, 'same', 'done'));
		const updateTask = vi.fn();
		pending.cancel();
		expect(pending.resolve(context(second))).toEqual({ kind: 'noop' });
		expect(dispatchKanbanIntent(context(first), pending, {}, updateTask)).toEqual({ kind: 'noop' });
		expect(pending.resolve(context(first))).toEqual({ kind: 'noop' });
		expect(updateTask).not.toHaveBeenCalled();
	});

	it('cancellation on a view switch prevents commit after returning to Kanban in the same plan', () => {
		const plan = makePlan([kanbanTask('A')]);
		const pending = new KanbanIntentHolder(intent(plan, 'A', 'done'));
		const updateTask = vi.fn();
		// A view switch cancels the holder even when the active plan does not change.
		pending.cancel();
		expect(dispatchKanbanIntent(context(plan), pending, {}, updateTask)).toEqual({ kind: 'noop' });
		expect(dispatchKanbanIntent(context(plan), pending, {}, updateTask)).toEqual({ kind: 'noop' });
		expect(updateTask).not.toHaveBeenCalled();
	});

	it('dispatches one status command for a request and cannot dispatch a consumed holder twice', () => {
		const plan = makePlan([kanbanTask('A')]);
		const pending = new KanbanIntentHolder(intent(plan, 'A', 'done'));
		const updateTask = vi.fn();
		const workspace = { name: 'test-workspace' };
		expect(dispatchKanbanIntent(context(plan), pending, workspace, updateTask)).toEqual({
			kind: 'request',
			taskId: 'A',
			patch: { status: 'done' }
		});
		expect(updateTask).toHaveBeenCalledExactlyOnceWith(workspace, 'A', { status: 'done' });
		expect(dispatchKanbanIntent(context(plan), pending, workspace, updateTask)).toEqual({
			kind: 'noop'
		});
		expect(updateTask).toHaveBeenCalledTimes(1);
	});

	it('never dispatches for rejected or unchanged intents', () => {
		const plan = makePlan([kanbanTask('A')]);
		const updateTask = vi.fn();
		for (const candidate of [
			intent(plan, 'missing', 'done'),
			intent(plan, 'A', 'blocked'),
			intent(plan, 'A', 'todo')
		]) {
			const result = dispatchKanbanIntent(
				context(plan),
				new KanbanIntentHolder(candidate),
				{},
				updateTask
			);
			expect(result.kind).not.toBe('request');
		}
		expect(updateTask).not.toHaveBeenCalled();
	});
});
