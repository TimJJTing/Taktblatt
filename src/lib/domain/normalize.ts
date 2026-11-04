/** Removes extra spaces from entity fields before a content change. */
import { normalizeOwners } from './owners';
import type { Band, Milestone, Plan, Task, Stage, RemarkSection } from './schema';

export const normalizeTask = (task: Task): Task => ({
	...task,
	title: task.title.trim(),
	deliverable: task.deliverable.trim(),
	// Keep note spaces. They can be part of the text layout.
	owners: normalizeOwners(task.owners)
});
export const normalizeStage = (stage: Stage): Stage => ({
	...stage,
	title: stage.title.trim(),
	description: stage.description.trim()
});
export const normalizeRemark = (section: RemarkSection): RemarkSection => ({
	...section,
	title: section.title.trim(),
	bullets: section.bullets.map((b) => b.trim()).filter(Boolean)
});
export const normalizePlan = (plan: Plan): Plan => ({
	...plan,
	heading: plan.heading.trim(),
	// Keep subheading spaces. The spec stores it as typed.
	subheading: plan.subheading,
	objective: plan.objective.trim()
});
export const normalizeFooter = (footer: Plan['footer']): Plan['footer'] => ({
	...footer,
	note: footer.note.trim(),
	version: footer.version.trim(),
	right: footer.right.trim()
});
export const normalizeMilestone = (milestone: Milestone): Milestone => ({
	...milestone,
	title: milestone.title.trim(),
	description: milestone.description.trim()
});
export const normalizeBand = (band: Band): Band => ({
	...band,
	title: band.title.trim()
});

export function isPermutation(current: readonly string[], ids: readonly string[]): boolean {
	const known = new Set(current);
	return (
		ids.length === current.length &&
		new Set(ids).size === ids.length &&
		ids.every((id) => known.has(id))
	);
}
