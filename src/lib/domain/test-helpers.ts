/** Helpers to build small plans in unit tests. */
import { createEmptyPlan } from './factory.js';
import type { Plan, Task } from './schema.js';

let counter = 0;

export function makeTask(partial: Partial<Task> & { id: string }): Task {
	counter += 1;
	return {
		stageId: 's1',
		parentId: null,
		title: partial.id,
		deliverable: '',
		start: null,
		end: null,
		owners: [],
		done: false,
		note: '',
		dependsOn: [],
		createdAt: new Date(Date.UTC(2027, 0, 1, 0, 0, counter)).toISOString(),
		...partial
	};
}

export function makePlan(tasks: Task[], stageIds: string[] = ['s1']): Plan {
	const plan = createEmptyPlan('2027-01-10');
	plan.stages = stageIds.map((id) => ({ id, title: id, description: '', color: 'blue' }));
	plan.tasks = tasks;
	return plan;
}
