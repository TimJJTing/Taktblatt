/**
 * Dependencies, validation, deletion and move conflicts.
 * Refer to docs/spec.md, section 3, and ADR 6.
 */
import {
	effectiveDependencies,
	effectiveOf,
	indexTasks,
	expandParents,
	type TaskIndex
} from './derive.ts';
import type { Plan, Task } from './schema.ts';
import { removeMentions } from './mentions.ts';

// ---------------------------------------------------------------------------
// Effective graph
// ---------------------------------------------------------------------------

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
	const candidate = index.byId.get(candidateId);
	if (!dependent || !candidate) return false;
	if (dependent.parentId !== null && candidate.parentId !== dependent.parentId) return false;
	if (dependentId === candidateId) return false;
	if (isParentAndChild(index, dependentId, candidateId)) return false;
	if (effectiveDependencies(index, dependentId).has(candidateId)) return false;
	return true;
}

/** Returns warnings for the new effective edges of a picker candidate. */
export function candidateWarnings(
	index: TaskIndex,
	dependentId: string,
	candidateId: string
): ('cycle' | 'date')[] {
	const result: ('cycle' | 'date')[] = [];
	const nodes = [dependentId, ...(index.children.get(dependentId) ?? []).map((t) => t.id)];
	if (
		nodes.some(
			(node) =>
				!effectiveDependencies(index, node).has(candidateId) && reaches(index, candidateId, node)
		)
	)
		result.push('cycle');
	if (breaksDateRule(index, candidateId, dependentId)) result.push('date');
	return result;
}

/** Computes strongly connected components with two iterative graph passes. */
function cycleComponents(index: TaskIndex): Map<string, number> {
	const edges = new Map<string, string[]>();
	const reverse = new Map<string, string[]>();
	for (const id of index.byId.keys()) reverse.set(id, []);
	for (const id of index.byId.keys()) {
		const deps = [...effectiveDependencies(index, id)];
		edges.set(id, deps);
		for (const dep of deps) reverse.get(dep)!.push(id);
	}
	const seen = new Set<string>();
	const order: string[] = [];
	for (const id of edges.keys()) {
		if (seen.has(id)) continue;
		seen.add(id);
		const stack = [{ id, next: 0 }];
		while (stack.length) {
			const frame = stack[stack.length - 1];
			const deps = edges.get(frame.id)!;
			if (frame.next === deps.length) {
				order.push(frame.id);
				stack.pop();
			} else {
				const dep = deps[frame.next++];
				if (!seen.has(dep)) {
					seen.add(dep);
					stack.push({ id: dep, next: 0 });
				}
			}
		}
	}
	const components = new Map<string, number>();
	for (const id of order.reverse()) {
		if (components.has(id)) continue;
		const component = components.size;
		const stack = [id];
		components.set(id, component);
		while (stack.length) {
			for (const next of reverse.get(stack.pop()!)!) {
				if (components.has(next)) continue;
				components.set(next, component);
				stack.push(next);
			}
		}
	}
	return components;
}

/** A stored dependency that breaks the date rule. The UI shows a warning on it. */
export interface DateWarning {
	/** The task that stores the dependency. */
	taskId: string;
	dependencyId: string;
}

/** A warning on a stored dependency. An edge can have more than one kind. */
export interface DependencyWarning extends DateWarning {
	kind: 'date' | 'subtask_scope' | 'cycle';
}

/** Returns cycle, date and scope warnings on stored dependencies. */
export function dependencyWarnings(index: TaskIndex): DependencyWarning[] {
	const result: DependencyWarning[] = [];
	const components = cycleComponents(index);
	for (const task of index.byId.values()) {
		const nodes = [task.id, ...(index.children.get(task.id) ?? []).map((t) => t.id)];
		const cyclicTargets = new Set<string>();
		for (const node of nodes) {
			for (const dep of effectiveDependencies(index, node)) {
				if (components.get(node) === components.get(dep)) cyclicTargets.add(dep);
			}
		}
		for (const dep of new Set(task.dependsOn)) {
			if (cyclicTargets.has(dep))
				result.push({ kind: 'cycle', taskId: task.id, dependencyId: dep });
			if (breaksDateRule(index, dep, task.id))
				result.push({ kind: 'date', taskId: task.id, dependencyId: dep });
			if (task.parentId !== null && index.byId.get(dep)?.parentId !== task.parentId)
				result.push({ kind: 'subtask_scope', taskId: task.id, dependencyId: dep });
		}
	}
	return result;
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
	/** Remove a dependency that no longer points to a sibling. */
	| { kind: 'remove-scope-dependency'; taskId: string; dependencyId: string }
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

/** Returns a unique key for a stored dependency edge. */
export function dependencyEdgeKey(taskId: string, dependencyId: string): string {
	return JSON.stringify([taskId, dependencyId]);
}

/** Calculates the conflicts of a move. A stage move without a parent change has no conflicts. */
export function moveConflicts(plan: Plan, id: string, target: MoveTarget): MoveConflicts {
	const task = plan.tasks.find((t) => t.id === id);
	const result: MoveConflicts = { fixes: [], warnings: [] };
	if (!task || task.parentId === target.parentId) return result;

	const before = indexTasks(plan.tasks);
	const simulation: Plan = {
		...plan,
		tasks: plan.tasks.map((task) => ({
			...task,
			owners: [...task.owners],
			dependsOn: [...task.dependsOn]
		}))
	};
	const after = indexTasks(applyMoveTo(simulation.tasks, id, target));
	const newParentId = target.parentId;
	const oldParentId = task.parentId;

	if (newParentId !== null) {
		const newParent = after.byId.get(newParentId)!;
		for (const dep of task.dependsOn) {
			if (after.byId.get(dep)?.parentId !== newParentId) {
				result.fixes.push({ kind: 'remove-scope-dependency', taskId: id, dependencyId: dep });
			}
		}
		if (newParent.dependsOn.includes(id)) {
			result.fixes.push({ kind: 'remove-parent-dependency', parentId: newParentId });
		}
		// Dates: the derived dates of the new parent can break edges on the new parent.
		const old = new Set(
			brokenEdgesAround(before, newParentId).map((edge) =>
				dependencyEdgeKey(edge.taskId, edge.dependencyId)
			)
		);
		for (const edge of brokenEdgesAround(after, newParentId)) {
			if (old.has(dependencyEdgeKey(edge.taskId, edge.dependencyId))) continue;
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
		for (const sibling of before.children.get(oldParentId) ?? []) {
			if (sibling.id !== id && sibling.dependsOn.includes(id)) {
				result.fixes.push({
					kind: 'remove-scope-dependency',
					taskId: sibling.id,
					dependencyId: id
				});
			}
		}
	}

	applyMove(simulation, id, target, result.fixes);
	expandParents(simulation);
	const warningIndex = indexTasks(simulation.tasks);
	if (oldParentId !== null) {
		const old = new Set(
			brokenEdgesAround(before, oldParentId).map((edge) =>
				dependencyEdgeKey(edge.taskId, edge.dependencyId)
			)
		);
		result.warnings = brokenEdgesAround(warningIndex, oldParentId).filter(
			(e) => !old.has(dependencyEdgeKey(e.taskId, e.dependencyId))
		);
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
		if (fix.kind === 'remove-scope-dependency') {
			const owner = plan.tasks.find((t) => t.id === fix.taskId);
			if (owner) owner.dependsOn = owner.dependsOn.filter((d) => d !== fix.dependencyId);
		} else if (fix.kind === 'remove-parent-dependency') {
			const parent = plan.tasks.find((t) => t.id === fix.parentId);
			if (parent) parent.dependsOn = parent.dependsOn.filter((d) => d !== id);
		} else {
			task[fix.field] = null;
		}
	}
	plan.tasks = applyMoveTo(plan.tasks, id, target);
}
