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
	state: ReadonlyMap<string, TaskState>;
}

export interface EffectiveValues {
	start: ISODate | null;
	end: ISODate | null;
	owners: string[];
	status: TaskStatus;
}

export type Blocker = { kind: 'task'; id: string };

export type Readiness =
	| { kind: 'ready'; via: 'dependencies'; count: number }
	| { kind: 'ready'; via: 'subtasks'; count: number }
	| { kind: 'blocked'; blockers: Blocker[] }
	| { kind: 'inactive' };

export interface TaskState {
	eff: EffectiveValues;
	finished: boolean;
	readiness: Readiness;
}

export type BoardColumn = 'blocked' | 'todo' | 'in_progress' | 'done';

/** Returns the board column. Canceled tasks have no column. */
export function boardColumn(state: TaskState): BoardColumn | null {
	switch (state.eff.status) {
		case 'canceled':
			return null;
		case 'todo':
			return state.readiness.kind === 'blocked' ? 'blocked' : 'todo';
		default:
			return state.eff.status;
	}
}

/** Returns the light data when the ready light is on. */
export function readyLight(
	readiness: Readiness
): { via: 'dependencies' | 'subtasks'; count: number } | null {
	if (readiness.kind !== 'ready') return null;
	return { via: readiness.via, count: readiness.count };
}

/**
 * Returns the effective dependencies of a task.
 * Subtask: its own dependencies and the own dependencies of its parent.
 * Task, with or without subtasks: its own dependencies, minus its own subtasks.
 */
export function effectiveDependencies(index: TaskIndex, id: string): Set<string> {
	const task = index.byId.get(id);
	if (!task) return new Set();
	const children = index.children.get(id) ?? [];
	const childIds = new Set(children.map((c) => c.id));
	const result = new Set<string>();
	const parent = task.parentId === null ? undefined : index.byId.get(task.parentId);
	const sources = parent ? [task, parent] : [task];
	for (const source of sources) {
		for (const dep of source.dependsOn) {
			if (dep !== id && !childIds.has(dep) && index.byId.has(dep)) result.add(dep);
		}
	}
	return result;
}

/** Returns inherited dependencies with the parent that owns each one. */
export function inheritedDependencies(
	index: TaskIndex,
	id: string
): { depId: string; fromId: string }[] {
	const task = index.byId.get(id);
	if (!task) return [];
	const own = new Set(task.dependsOn);
	if (task.parentId !== null) {
		const parent = index.byId.get(task.parentId);
		return [...new Set(parent?.dependsOn ?? [])]
			.filter((dep) => dep !== id && !own.has(dep) && index.byId.has(dep))
			.map((depId) => ({ depId, fromId: task.parentId! }));
	}
	return [];
}

/** Returns true for done and canceled. A finished task satisfies dependencies and looks muted. */
export function isFinished(status: TaskStatus): boolean {
	return status === 'done' || status === 'canceled';
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
	// Canceled subtasks do not count. All subtasks canceled gives canceled.
	const active = children.filter((c) => c.status !== 'canceled');
	const doneCount = active.filter((c) => c.status === 'done').length;
	const todoCount = active.filter((c) => c.status === 'todo').length;
	return {
		start: minDate(children.map((c) => c.start)),
		end: maxDate(children.map((c) => c.end)),
		owners: normalizeOwners(children.flatMap((c) => c.owners)),
		status:
			active.length === 0
				? 'canceled'
				: doneCount === active.length
					? 'done'
					: todoCount === active.length
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

/**
 * Makes the lookup tables and task state, with the sort rule applied.
 * A plain index is a snapshot. Rebuild it after a mutation.
 */
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
	const state = new Map<string, TaskState>();
	for (const task of tasks) {
		const eff = effectiveValues(task, children.get(task.id));
		state.set(task.id, { eff, finished: isFinished(eff.status), readiness: { kind: 'inactive' } });
	}
	const index: TaskIndex = { byId, children, stageTasks, state };
	// All effective values and finished flags must exist before readiness is calculated.
	for (const [id, taskState] of state) {
		if (taskState.eff.status !== 'todo' || children.get(id)?.length) continue;
		const deps = effectiveDependencies(index, id);
		const blockers: Blocker[] = [];
		for (const dep of deps) {
			if (!state.get(dep)!.finished) blockers.push({ kind: 'task', id: dep });
		}
		taskState.readiness =
			blockers.length > 0
				? { kind: 'blocked', blockers }
				: { kind: 'ready', via: 'dependencies', count: deps.size };
	}
	// Parents read subtask readiness only after all leaves have their readiness.
	for (const [id, subtasks] of children) {
		const taskState = state.get(id);
		if (!taskState || taskState.eff.status !== 'todo') continue;
		let count = 0;
		const blockers = new Map<string, Blocker>();
		for (const subtask of subtasks) {
			const readiness = state.get(subtask.id)!.readiness;
			if (readiness.kind === 'ready') count++;
			if (readiness.kind === 'blocked') {
				for (const blocker of readiness.blockers) blockers.set(blocker.id, blocker);
			}
		}
		taskState.readiness =
			count > 0
				? { kind: 'ready', via: 'subtasks', count }
				: { kind: 'blocked', blockers: [...blockers.values()] };
	}
	for (const list of stageTasks.values()) {
		const start = (t: Task) => state.get(t.id)!.eff.start;
		list.sort((a, b) =>
			compareByStart(
				{ start: start(a), createdAt: a.createdAt },
				{ start: start(b), createdAt: b.createdAt }
			)
		);
	}
	return index;
}

/** Returns the effective values of a task by id. */
export function effectiveOf(index: TaskIndex, id: string): EffectiveValues | null {
	return index.state.get(id)?.eff ?? null;
}

/** The date span of a stage: the earliest date to the latest date of its tasks. */
export function stageSpan(
	index: TaskIndex,
	stageId: string
): { start: ISODate; end: ISODate } | null {
	const dates: ISODate[] = [];
	for (const task of index.stageTasks.get(stageId) ?? []) {
		const eff = index.state.get(task.id)!.eff;
		if (eff.start) dates.push(eff.start);
		if (eff.end) dates.push(eff.end);
	}
	if (dates.length === 0) return null;
	dates.sort();
	return { start: dates[0], end: dates[dates.length - 1] };
}

/** Counts level-1 tasks by their effective status. The total leaves out canceled tasks. */
export function stageProgress(
	index: TaskIndex,
	stageId: string
): { done: number; inProgress: number; total: number } {
	const tasks = index.stageTasks.get(stageId) ?? [];
	let done = 0;
	let inProgress = 0;
	let total = 0;
	for (const task of tasks) {
		const status = index.state.get(task.id)!.eff.status;
		if (status === 'canceled') continue;
		total++;
		if (status === 'done') done++;
		if (status === 'in_progress') inProgress++;
	}
	return { done, inProgress, total };
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
