/**
 * Named edits of the active plan. Views call these functions. Each call is one commit (one undo step).
 * The functions keep the domain rules. Views must not change the plan in other ways.
 */
import {
	applyMove,
	deleteImpact,
	deleteTasks,
	type MoveFix,
	type MoveTarget
} from '#lib/domain/dependencies.js';
import { createRemarkSection, createStage, createTask } from '#lib/domain/factory.js';
import { normalizeOwners, renameOwner } from '#lib/domain/owners.js';
import type { Plan, RemarkSection, Stage, Task } from '#lib/domain/schema.js';
import type { Workspace } from './workspace.svelte.js';

export type TaskPatch = Partial<
	Pick<Task, 'title' | 'deliverable' | 'start' | 'end' | 'owners' | 'done' | 'note' | 'dependsOn'>
>;

const findTask = (plan: Plan, id: string) => plan.tasks.find((t) => t.id === id);

// -------------------------------------------------------------------------
// Plan fields
// -------------------------------------------------------------------------

export function updatePlan(
	ws: Workspace,
	patch: Partial<Pick<Plan, 'heading' | 'subheading' | 'objective' | 'range' | 'locale' | 'paper'>>
): void {
	ws.commit((plan) => Object.assign(plan, patch));
}

export function updateFooter(ws: Workspace, patch: Partial<Plan['footer']>): void {
	ws.commit((plan) => Object.assign(plan.footer, patch));
}

// -------------------------------------------------------------------------
// Tasks
// -------------------------------------------------------------------------

export function addTask(
	ws: Workspace,
	stageId: string,
	parentId: string | null,
	patch: TaskPatch = {}
): string {
	const task = { ...createTask(stageId, parentId), ...patch };
	if (task.owners) task.owners = normalizeOwners(task.owners);
	ws.commit((plan) => {
		plan.tasks.push(task);
	});
	return task.id;
}

export function updateTask(ws: Workspace, id: string, patch: TaskPatch): void {
	ws.commit((plan) => {
		const task = findTask(plan, id);
		if (!task) return;
		Object.assign(task, patch);
		if (patch.owners) task.owners = normalizeOwners(patch.owners);
		if (patch.title !== undefined) task.title = patch.title.trim();
		if (patch.deliverable !== undefined) task.deliverable = patch.deliverable.trim();
	});
}

export function removeTasks(ws: Workspace, ids: readonly string[]): void {
	ws.commit((plan) => deleteTasks(plan, ids));
}

export function moveTask(
	ws: Workspace,
	id: string,
	target: MoveTarget,
	fixes: readonly MoveFix[]
): void {
	ws.commit((plan) => applyMove(plan, id, target, fixes));
}

/** Renames an owner in all tasks of the plan. */
export function renameOwnerEverywhere(ws: Workspace, from: string, to: string): void {
	const name = to.trim();
	if (!name) return;
	ws.commit((plan) => {
		for (const task of plan.tasks) task.owners = renameOwner(task.owners, from, name);
	});
}

// -------------------------------------------------------------------------
// Stages
// -------------------------------------------------------------------------

/** Adds an empty stage at `position`. Returns its id. */
export function addStage(ws: Workspace, position: number): string {
	const stage = createStage(ws.plan.stages.map((s) => s.color));
	ws.commit((plan) => {
		plan.stages.splice(position, 0, stage);
	});
	return stage.id;
}

export function updateStage(ws: Workspace, id: string, patch: Partial<Omit<Stage, 'id'>>): void {
	ws.commit((plan) => {
		const stage = plan.stages.find((s) => s.id === id);
		if (!stage) return;
		Object.assign(stage, patch);
		if (patch.title !== undefined) stage.title = patch.title.trim();
		if (patch.description !== undefined) stage.description = patch.description.trim();
	});
}

export function moveStage(ws: Workspace, id: string, delta: -1 | 1): void {
	ws.commit((plan) => {
		const from = plan.stages.findIndex((s) => s.id === id);
		const to = from + delta;
		if (from < 0 || to < 0 || to >= plan.stages.length) return;
		const [stage] = plan.stages.splice(from, 1);
		plan.stages.splice(to, 0, stage);
	});
}

/** Sets the stage order. `ids` must contain all stage ids. */
export function reorderStages(ws: Workspace, ids: readonly string[]): void {
	ws.commit((plan) => {
		if (ids.length !== plan.stages.length) return;
		const byId = new Map(plan.stages.map((s) => [s.id, s]));
		plan.stages = ids.map((id) => byId.get(id)!).filter(Boolean);
	});
}

export function stageDeleteImpact(plan: Plan, id: string): { tasks: number; dependents: number } {
	const taskIds = plan.tasks
		.filter((t) => t.stageId === id && t.parentId === null)
		.map((t) => t.id);
	const impact = deleteImpact(plan, taskIds);
	return { tasks: impact.ids.length, dependents: impact.dependents };
}

/** Deletes a stage and its tasks. */
export function removeStage(ws: Workspace, id: string): void {
	ws.commit((plan) => {
		deleteTasks(
			plan,
			plan.tasks.filter((t) => t.stageId === id && t.parentId === null).map((t) => t.id)
		);
		plan.stages = plan.stages.filter((s) => s.id !== id);
	});
}

// -------------------------------------------------------------------------
// Remarks
// -------------------------------------------------------------------------

export function addRemarkSection(
	ws: Workspace,
	patch: Partial<Omit<RemarkSection, 'id'>> = {}
): string {
	const section = { ...createRemarkSection(), ...patch };
	ws.commit((plan) => {
		plan.remarks.push(section);
	});
	return section.id;
}

export function updateRemarkSection(
	ws: Workspace,
	id: string,
	patch: Partial<Omit<RemarkSection, 'id'>>
): void {
	ws.commit((plan) => {
		const section = plan.remarks.find((r) => r.id === id);
		if (!section) return;
		Object.assign(section, patch);
		section.title = section.title.trim();
		section.bullets = section.bullets.map((b) => b.trim()).filter((b) => b.length > 0);
		if (section.title === '' && section.bullets.length === 0) {
			plan.remarks = plan.remarks.filter((r) => r.id !== id);
		}
	});
}

export function removeRemarkSection(ws: Workspace, id: string): void {
	ws.commit((plan) => {
		plan.remarks = plan.remarks.filter((r) => r.id !== id);
	});
}

export function moveRemarkSection(ws: Workspace, id: string, delta: -1 | 1): void {
	ws.commit((plan) => {
		const from = plan.remarks.findIndex((r) => r.id === id);
		const to = from + delta;
		if (from < 0 || to < 0 || to >= plan.remarks.length) return;
		const [section] = plan.remarks.splice(from, 1);
		plan.remarks.splice(to, 0, section);
	});
}

export function reorderRemarks(ws: Workspace, ids: readonly string[]): void {
	ws.commit((plan) => {
		if (ids.length !== plan.remarks.length) return;
		const byId = new Map(plan.remarks.map((r) => [r.id, r]));
		plan.remarks = ids.map((id) => byId.get(id)!).filter(Boolean);
	});
}
