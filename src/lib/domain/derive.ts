/**
 * Derived values. Each derived value has one calculation here. All views use it.
 * Refer to docs/spec.md, section 2.
 */
import type { ISODate } from './date.ts';
import { normalizeOwners } from './owners.ts';
import type { Milestone, Task, TaskStatus } from './schema.ts';

export interface TaskIndex {
	byId: ReadonlyMap<string, Task>;
	/** Subtasks of each parent, in sort order. */
	children: ReadonlyMap<string, readonly Task[]>;
	/** Tasks (level 1) of each stage, in sort order. */
	stageTasks: ReadonlyMap<string, readonly Task[]>;
}

export interface EffectiveValues {
	start: ISODate | null;
	end: ISODate | null;
	owners: string[];
	status: TaskStatus;
}

function minDate(dates: (ISODate | null)[]): ISODate | null {
	let result: ISODate | null = null;
	for (const d of dates) if (d !== null && (result === null || d < result)) result = d;
	return result;
}

function maxDate(dates: (ISODate | null)[]): ISODate | null {
	let result: ISODate | null = null;
	for (const d of dates) if (d !== null && (result === null || d > result)) result = d;
	return result;
}

/** Returns the effective values of a task. A parent derives them from its subtasks. */
export function effectiveValues(task: Task, children: readonly Task[] = []): EffectiveValues {
	if (children.length === 0) {
		return {
			start: task.start,
			end: task.end,
			owners: normalizeOwners(task.owners),
			status: task.status
		};
	}
	const doneCount = children.filter((c) => c.status === 'done').length;
	const todoCount = children.filter((c) => c.status === 'todo').length;
	return {
		start: minDate(children.map((c) => c.start)),
		end: maxDate(children.map((c) => c.end)),
		owners: normalizeOwners(children.flatMap((c) => c.owners)),
		status:
			doneCount === children.length
				? 'done'
				: todoCount === children.length
					? 'todo'
					: 'in_progress'
	};
}

/** Sort rule: by start, then by createdAt. Items without start go last. */
export function compareByStart(
	a: { start: ISODate | null; createdAt: string },
	b: { start: ISODate | null; createdAt: string }
): number {
	if (a.start !== b.start) {
		if (a.start === null) return 1;
		if (b.start === null) return -1;
		return a.start < b.start ? -1 : 1;
	}
	return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

/** Makes the lookup tables for the tasks of a plan, with the sort rule applied. */
export function indexTasks(tasks: readonly Task[]): TaskIndex {
	const byId = new Map(tasks.map((t) => [t.id, t]));
	const children = new Map<string, Task[]>();
	const stageTasks = new Map<string, Task[]>();
	for (const task of tasks) {
		if (task.parentId === null) {
			const list = stageTasks.get(task.stageId) ?? [];
			list.push(task);
			stageTasks.set(task.stageId, list);
		} else {
			const list = children.get(task.parentId) ?? [];
			list.push(task);
			children.set(task.parentId, list);
		}
	}
	for (const list of children.values()) list.sort(compareByStart);
	for (const list of stageTasks.values()) {
		const start = (t: Task) => effectiveValues(t, children.get(t.id)).start;
		list.sort((a, b) =>
			compareByStart(
				{ start: start(a), createdAt: a.createdAt },
				{ start: start(b), createdAt: b.createdAt }
			)
		);
	}
	return { byId, children, stageTasks };
}

/** Returns the effective values of a task by id. */
export function effectiveOf(index: TaskIndex, id: string): EffectiveValues | null {
	const task = index.byId.get(id);
	return task ? effectiveValues(task, index.children.get(id)) : null;
}

/** The date span of a stage: the earliest date to the latest date of its tasks. */
export function stageSpan(
	index: TaskIndex,
	stageId: string
): { start: ISODate; end: ISODate } | null {
	const dates: ISODate[] = [];
	for (const task of index.stageTasks.get(stageId) ?? []) {
		const eff = effectiveValues(task, index.children.get(task.id));
		if (eff.start) dates.push(eff.start);
		if (eff.end) dates.push(eff.end);
	}
	if (dates.length === 0) return null;
	dates.sort();
	return { start: dates[0], end: dates[dates.length - 1] };
}

/** Counts level-1 tasks by their effective status. */
export function stageProgress(
	index: TaskIndex,
	stageId: string
): { done: number; inProgress: number; total: number } {
	const tasks = index.stageTasks.get(stageId) ?? [];
	let done = 0;
	let inProgress = 0;
	for (const task of tasks) {
		const status = effectiveValues(task, index.children.get(task.id)).status;
		if (status === 'done') done++;
		if (status === 'in_progress') inProgress++;
	}
	return { done, inProgress, total: tasks.length };
}

/** The deliverables of the tasks of a stage, in task order. Empty values are skipped. */
export function stageDeliverables(index: TaskIndex, stageId: string): string[] {
	return (index.stageTasks.get(stageId) ?? [])
		.map((t) => t.deliverable.trim())
		.filter((d) => d.length > 0);
}

/** Milestones in date order, with their labels M1 … Mn. */
export function orderedMilestones(
	milestones: readonly Milestone[]
): { label: string; milestone: Milestone }[] {
	return [...milestones]
		.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : 1))
		.map((milestone, i) => ({ label: `M${i + 1}`, milestone }));
}

/** The range that contains all effective task dates. Null when no task has a date. */
export function tasksSpan(index: TaskIndex): { start: ISODate; end: ISODate } | null {
	const dates: ISODate[] = [];
	for (const id of index.byId.keys()) {
		const eff = effectiveOf(index, id)!;
		if (eff.start) dates.push(eff.start);
		if (eff.end) dates.push(eff.end);
	}
	if (dates.length === 0) return null;
	dates.sort();
	return { start: dates[0], end: dates[dates.length - 1] };
}

/** Returns true when the task has a valid range: both dates are set and start ≤ end. */
export function hasValidRange(values: { start: ISODate | null; end: ISODate | null }): boolean {
	return values.start !== null && values.end !== null && values.start <= values.end;
}
