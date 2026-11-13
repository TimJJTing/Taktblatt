import type { Plan, TaskStatus } from '#lib/domain/schema.ts';

export interface FixtureTask {
	id: string;
	title: string;
	status: TaskStatus;
	parentId: string | null;
}

/** All tasks and subtasks of a plan, in plan order. */
export function fixtureTasks(plan: Plan): FixtureTask[] {
	return plan.tasks.map((task) => ({
		id: task.id,
		title: task.title,
		status: task.status,
		parentId: task.parentId ?? null
	}));
}
