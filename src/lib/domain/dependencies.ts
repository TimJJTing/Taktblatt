/**
 * Dependencies, validation, the ready light, deletion and move conflicts.
 * Refer to docs/spec.md, section 3, and ADR 6.
 */
import { effectiveOf, effectiveValues, indexTasks, type TaskIndex } from './derive.js';
import type { Plan, Task } from './schema.js';
import { removeMentions } from './mentions.js';

// ---------------------------------------------------------------------------
// Effective graph
// ---------------------------------------------------------------------------

/**
 * Returns the effective dependencies of a task.
 * Subtask: its own dependencies.
 * Parent: its own dependencies and those of its subtasks, minus its own subtasks.
 */
export function effectiveDependencies(index: TaskIndex, id: string): Set<string> {
	const task = index.byId.get(id);
	if (!task) return new Set();
	const children = index.children.get(id) ?? [];
	const childIds = new Set(children.map((c) => c.id));
	const result = new Set<string>();
	for (const source of [task, ...children]) {
		for (const dep of source.dependsOn) {
			if (dep !== id && !childIds.has(dep) && index.byId.has(dep)) result.add(dep);
		}
	}
	return result;
}

/** The dependencies that a parent inherits from its subtasks, with the subtask that owns each one. */
export function inheritedDependencies(
	index: TaskIndex,
	id: string
): { depId: string; fromId: string }[] {
	const children = index.children.get(id) ?? [];
	const childIds = new Set(children.map((c) => c.id));
	const own = new Set(index.byId.get(id)?.dependsOn ?? []);
	const result: { depId: string; fromId: string }[] = [];
	for (const child of children) {
		for (const dep of child.dependsOn) {
			if (!childIds.has(dep) && !own.has(dep) && dep !== id)
				result.push({ depId: dep, fromId: child.id });
		}
	}
	return result;
}

/** Returns true when `to` can be reached from `from` in the effective graph. */
export function reaches(index: TaskIndex, from: string, to: string): boolean {
	const seen = new Set<string>();
	const stack = [from];
	while (stack.length > 0) {
		const current = stack.pop()!;
		if (current === to) return true;
		if (seen.has(current)) continue;
		seen.add(current);
		for (const next of effectiveDependencies(index, current)) stack.push(next);
	}
	return false;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Date rule: A cannot be a dependency of B if A.start > B.end. Empty dates skip the rule. */
export function breaksDateRule(
	index: TaskIndex,
	dependencyId: string,
	dependentId: string
): boolean {
	const a = effectiveOf(index, dependencyId);
	const b = effectiveOf(index, dependentId);
	if (!a || !b || a.start === null || b.end === null) return false;
	return a.start > b.end;
}

function isParentAndChild(index: TaskIndex, x: string, y: string): boolean {
	return index.byId.get(x)?.parentId === y || index.byId.get(y)?.parentId === x;
}

/**
 * Returns true when task `dependentId` can add `candidateId` to its own dependencies.
 * The picker hides the candidates that return false.
 */
export function canDependOn(index: TaskIndex, dependentId: string, candidateId: string): boolean {
	const dependent = index.byId.get(dependentId);
	if (!dependent || !index.byId.has(candidateId)) return false;
	if (dependentId === candidateId) return false;
	if (isParentAndChild(index, dependentId, candidateId)) return false;
	if (dependent.dependsOn.includes(candidateId)) return false;
	if (breaksDateRule(index, candidateId, dependentId)) return false;
	// The new edge is dependent → candidate. Its parent also gets the edge, unless the candidate is a sibling.
	const nodes = [dependentId];
	if (dependent.parentId !== null && index.byId.get(candidateId)?.parentId !== dependent.parentId) {
		nodes.push(dependent.parentId);
	}
	return nodes.every((node) => node !== candidateId && !reaches(index, candidateId, node));
}

/** A stored dependency that breaks the date rule. The UI shows a warning on it. */
export interface DateWarning {
	/** The task that stores the dependency. */
	taskId: string;
	dependencyId: string;
}

/** Returns all stored dependencies that break the date rule. */
export function dateWarnings(index: TaskIndex): DateWarning[] {
	const result: DateWarning[] = [];
	for (const task of index.byId.values()) {
		for (const dep of task.dependsOn) {
			if (breaksDateRule(index, dep, task.id)) result.push({ taskId: task.id, dependencyId: dep });
		}
	}
	return result;
}

// ---------------------------------------------------------------------------
// Ready light
// ---------------------------------------------------------------------------

/** Returns the number of effective dependencies when the ready light is on. Else returns 0. */
export function readyCount(index: TaskIndex, id: string): number {
	const task = index.byId.get(id);
	if (!task) return 0;
	if (effectiveValues(task, index.children.get(id)).done === 'done') return 0;
	const deps = effectiveDependencies(index, id);
	if (deps.size === 0) return 0;
	for (const dep of deps) if (effectiveOf(index, dep)?.done !== 'done') return 0;
	return deps.size;
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

export interface DeleteImpact {
	/** The ids that the deletion removes: the task and its subtasks. */
	ids: string[];
	/** The number of removed tasks whose parent is also removed. */
	subtasks: number;
	/** The number of other tasks that depend on a removed task. */
	dependents: number;
}

export function deleteImpact(plan: Plan, taskIds: readonly string[]): DeleteImpact {
	const index = indexTasks(plan.tasks);
	const roots = new Set(taskIds.filter((id) => index.byId.has(id)));
	const ids = new Set(roots);
	for (const id of roots) {
		for (const child of index.children.get(id) ?? []) ids.add(child.id);
	}
	const dependents = plan.tasks.filter(
		(t) => !ids.has(t.id) && t.dependsOn.some((d) => ids.has(d))
	);
	return {
		ids: [...ids],
		subtasks: [...ids].filter((id) => ids.has(index.byId.get(id)?.parentId ?? '')).length,
		dependents: dependents.length
	};
}

/** Returns the task and dependency counts for a stage deletion. */
export function stageDeleteImpact(plan: Plan, id: string): { tasks: number; dependents: number } {
	const taskIds = plan.tasks
		.filter((t) => t.stageId === id && t.parentId === null)
		.map((t) => t.id);
	const impact = deleteImpact(plan, taskIds);
	return { tasks: impact.ids.length, dependents: impact.dependents };
}

/** Deletes tasks and their subtasks. Removes them from all dependency lists and notes. Mutates the plan. */
export function deleteTasks(plan: Plan, taskIds: readonly string[]): void {
	const ids = new Set(deleteImpact(plan, taskIds).ids);
	plan.tasks = plan.tasks.filter((t) => !ids.has(t.id));
	for (const task of plan.tasks) {
		if (task.dependsOn.some((d) => ids.has(d)))
			task.dependsOn = task.dependsOn.filter((d) => !ids.has(d));
		if (task.note.includes('@[task:')) task.note = removeMentions(task.note, ids);
	}
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

export interface MoveTarget {
	stageId: string;
	parentId: string | null;
}

export type MoveFix =
	/** Remove `dependencyId` from the own dependencies of the moved task. It causes a cycle. */
	| { kind: 'remove-cycle-dependency'; dependencyId: string }
	/** Remove the moved task from the dependencies of its new parent. */
	| { kind: 'remove-parent-dependency'; parentId: string }
	/** Clear a date of the moved task. The new derived dates of the parent break the date rule. */
	| { kind: 'clear-date'; field: 'start' | 'end'; dependencyId: string; dependentId: string };

export interface MoveConflicts {
	fixes: MoveFix[];
	/** Date-rule breaks on the old parent. The move does not fix these. */
	warnings: DateWarning[];
}

function applyMoveTo(tasks: Task[], id: string, target: MoveTarget): Task[] {
	return tasks.map((t) => {
		if (t.id === id) return { ...t, stageId: target.stageId, parentId: target.parentId };
		if (t.parentId === id) return { ...t, stageId: target.stageId };
		return t;
	});
}

/** Returns true when the move is allowed by the structure rules (depth, stage). */
export function isValidMoveTarget(plan: Plan, id: string, target: MoveTarget): boolean {
	const index = indexTasks(plan.tasks);
	const task = index.byId.get(id);
	if (!task || !plan.stages.some((s) => s.id === target.stageId)) return false;
	if (target.parentId === null) return true;
	if (target.parentId === id) return false;
	const parent = index.byId.get(target.parentId);
	if (!parent || parent.parentId !== null || parent.stageId !== target.stageId) return false;
	// A task with subtasks cannot become a subtask (max depth 2).
	return !index.children.get(id)?.length;
}

function brokenEdgesAround(index: TaskIndex, nodeId: string): DateWarning[] {
	const result: DateWarning[] = [];
	for (const task of index.byId.values()) {
		for (const dep of task.dependsOn) {
			if ((task.id === nodeId || dep === nodeId) && breaksDateRule(index, dep, task.id)) {
				result.push({ taskId: task.id, dependencyId: dep });
			}
		}
	}
	return result;
}

const edgeKey = (w: DateWarning) => `${w.taskId}→${w.dependencyId}`;

/** Calculates the conflicts of a move. A stage move without a parent change has no conflicts. */
export function moveConflicts(plan: Plan, id: string, target: MoveTarget): MoveConflicts {
	const task = plan.tasks.find((t) => t.id === id);
	const result: MoveConflicts = { fixes: [], warnings: [] };
	if (!task || task.parentId === target.parentId) return result;

	const before = indexTasks(plan.tasks);
	const after = indexTasks(applyMoveTo(plan.tasks, id, target));
	const newParentId = target.parentId;
	const oldParentId = task.parentId;

	if (newParentId !== null) {
		const newParent = after.byId.get(newParentId)!;
		// Cycles: the only new edges are newParent → D, for each own dependency D of the moved task.
		for (const dep of task.dependsOn) {
			const sibling = after.byId.get(dep)?.parentId === newParentId;
			if (!sibling && (dep === newParentId || reaches(after, dep, newParentId))) {
				result.fixes.push({ kind: 'remove-cycle-dependency', dependencyId: dep });
			}
		}
		if (newParent.dependsOn.includes(id)) {
			result.fixes.push({ kind: 'remove-parent-dependency', parentId: newParentId });
		}
		// Dates: the derived dates of the new parent can break edges on the new parent.
		const old = new Set(brokenEdgesAround(before, newParentId).map(edgeKey));
		for (const edge of brokenEdgesAround(after, newParentId)) {
			if (old.has(edgeKey(edge))) continue;
			const parentIsDependency = edge.dependencyId === newParentId;
			// Parent is the dependency: its start is too late. Parent is the dependent: its end is too early.
			result.fixes.push({
				kind: 'clear-date',
				field: parentIsDependency ? 'start' : 'end',
				dependencyId: edge.dependencyId,
				dependentId: edge.taskId
			});
		}
	}

	if (oldParentId !== null) {
		const old = new Set(brokenEdgesAround(before, oldParentId).map(edgeKey));
		result.warnings = brokenEdgesAround(after, oldParentId).filter((e) => !old.has(edgeKey(e)));
	}

	return result;
}

/** Applies a move and its fixes. Mutates the plan. */
export function applyMove(
	plan: Plan,
	id: string,
	target: MoveTarget,
	fixes: readonly MoveFix[]
): void {
	const task = plan.tasks.find((t) => t.id === id);
	if (!task) return;
	for (const fix of fixes) {
		if (fix.kind === 'remove-cycle-dependency') {
			task.dependsOn = task.dependsOn.filter((d) => d !== fix.dependencyId);
		} else if (fix.kind === 'remove-parent-dependency') {
			const parent = plan.tasks.find((t) => t.id === fix.parentId);
			if (parent) parent.dependsOn = parent.dependsOn.filter((d) => d !== id);
		} else {
			task[fix.field] = null;
		}
	}
	plan.tasks = applyMoveTo(plan.tasks, id, target);
}
