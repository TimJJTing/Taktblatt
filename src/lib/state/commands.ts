/**
 * Named edits of the active plan. Views call these functions. Each call is one commit (one undo step).
 * Views must use these functions to change plan content.
 * Plan creation, switching, deletion, duplication, import, undo and redo stay on Workspace.
 * These plan lifecycle and history operations are the explicit exception in ADR 3.
 */
import { applyMove, deleteTasks, type MoveFix, type MoveTarget } from '#lib/domain/dependencies.js';
import { createExamplePlan } from '#lib/domain/example.js';
import {
	isPermutation,
	normalizeTask,
	normalizeStage,
	normalizeRemark,
	normalizePlan,
	normalizeFooter,
	normalizeMilestone,
	normalizeBand
} from '#lib/domain/normalize.js';
import {
	createBand,
	createMilestone,
	createRemarkSection,
	createStage,
	createTask
} from '#lib/domain/factory.js';
import { renameOwner } from '#lib/domain/owners.js';
import type { Band, Milestone, Plan, RemarkSection, Stage, Task } from '#lib/domain/schema.js';
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
	ws.commit((plan) => Object.assign(plan, normalizePlan({ ...plan, ...patch })));
}

export function updateFooter(ws: Workspace, patch: Partial<Plan['footer']>): void {
	ws.commit((plan) => Object.assign(plan.footer, normalizeFooter({ ...plan.footer, ...patch })));
}

// -------------------------------------------------------------------------
// Tasks
// -------------------------------------------------------------------------

export function addTask(
	ws: Workspace,
	stageId: string,
	payload: { parentId: string | null; patch?: TaskPatch } = { parentId: null }
): string {
	// A new task can stay empty while the user edits it.
	const task = normalizeTask({ ...createTask(stageId, payload.parentId), ...payload.patch });
	ws.commit((plan) => {
		plan.tasks.push(task);
	});
	return task.id;
}

export function updateTask(ws: Workspace, id: string, patch: TaskPatch): void {
	ws.commit((plan) => {
		const task = findTask(plan, id);
		if (!task) return;
		Object.assign(task, normalizeTask({ ...task, ...patch }));
	});
}

export function removeTasks(ws: Workspace, ids: readonly string[]): void {
	ws.commit((plan) => deleteTasks(plan, ids));
}

export function moveTask(
	ws: Workspace,
	id: string,
	payload: { target: MoveTarget; fixes: readonly MoveFix[] }
): void {
	ws.commit((plan) => applyMove(plan, id, payload.target, payload.fixes));
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
	const stage = normalizeStage(createStage(ws.plan.stages.map((s) => s.color)));
	ws.commit((plan) => {
		plan.stages.splice(position, 0, stage);
	});
	return stage.id;
}

export function updateStage(ws: Workspace, id: string, patch: Partial<Omit<Stage, 'id'>>): void {
	ws.commit((plan) => {
		const stage = plan.stages.find((s) => s.id === id);
		if (!stage) return;
		Object.assign(stage, normalizeStage({ ...stage, ...patch }));
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
	if (
		!isPermutation(
			ws.plan.stages.map((item) => item.id),
			ids
		)
	)
		return;
	ws.commit((plan) => {
		const byId = new Map(plan.stages.map((s) => [s.id, s]));
		plan.stages = ids.map((id) => byId.get(id)!);
	});
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
	// Keep an empty section so the user can edit it.
	const section = normalizeRemark({ ...createRemarkSection(), ...patch });
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
		Object.assign(section, normalizeRemark({ ...section, ...patch }));
	});
}

/** Removes an empty remark section. Drops its creation step if it is the newest step. */
export function discardNewRemarkSection(ws: Workspace, id: string): void {
	const section = ws.plan.remarks.find((r) => r.id === id);
	if (!section || section.title || section.bullets.length > 0) return;
	const before = ws.history.peek();
	if (before && !before.remarks.some((r) => r.id === id)) ws.rollback();
	else removeRemarkSection(ws, id);
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
	if (
		!isPermutation(
			ws.plan.remarks.map((item) => item.id),
			ids
		)
	)
		return;
	ws.commit((plan) => {
		const byId = new Map(plan.remarks.map((r) => [r.id, r]));
		plan.remarks = ids.map((id) => byId.get(id)!);
	});
}

/** Replaces the active plan content with the example. */
export function loadExample(ws: Workspace): void {
	const example = createExamplePlan(ws.plan.locale);
	ws.commit((plan) => Object.assign(plan, { ...example, id: plan.id, createdAt: plan.createdAt }));
}

/** Removes an empty task. Drops its creation step if it is the newest step. */
export function discardNewTask(ws: Workspace, id: string): void {
	const task = findTask(ws.plan, id);
	if (
		!task ||
		task.title.trim() ||
		task.deliverable.trim() ||
		task.start ||
		task.end ||
		task.owners.length ||
		task.note.trim() ||
		task.dependsOn.length ||
		task.done ||
		ws.index.children.get(id)?.length
	)
		return;
	const before = ws.history.peek();
	if (before && !before.tasks.some((task) => task.id === id)) ws.rollback();
	else ws.commit((plan) => deleteTasks(plan, [id]));
}

// -------------------------------------------------------------------------
// Milestones and bands
// -------------------------------------------------------------------------

/** Adds a milestone. Returns its id. */
export function addMilestone(ws: Workspace, patch: Partial<Omit<Milestone, 'id'>> = {}): string {
	const milestone = normalizeMilestone({ ...createMilestone(), ...patch });
	ws.commit((plan) => {
		plan.milestones.push(milestone);
	});
	return milestone.id;
}

export function updateMilestone(
	ws: Workspace,
	id: string,
	patch: Partial<Omit<Milestone, 'id'>>
): void {
	ws.commit((plan) => {
		const milestone = plan.milestones.find((item) => item.id === id);
		if (!milestone) return;
		Object.assign(milestone, normalizeMilestone({ ...milestone, ...patch }));
	});
}

export function removeMilestone(ws: Workspace, id: string): void {
	ws.commit((plan) => {
		plan.milestones = plan.milestones.filter((item) => item.id !== id);
	});
}

/** Adds a band. Returns its id. */
export function addBand(ws: Workspace, patch: Partial<Omit<Band, 'id'>> = {}): string {
	const band = normalizeBand({ ...createBand(), ...patch });
	ws.commit((plan) => {
		plan.bands.push(band);
	});
	return band.id;
}

export function updateBand(ws: Workspace, id: string, patch: Partial<Omit<Band, 'id'>>): void {
	ws.commit((plan) => {
		const band = plan.bands.find((item) => item.id === id);
		if (!band) return;
		Object.assign(band, normalizeBand({ ...band, ...patch }));
	});
}

export function removeBand(ws: Workspace, id: string): void {
	ws.commit((plan) => {
		plan.bands = plan.bands.filter((item) => item.id !== id);
	});
}
