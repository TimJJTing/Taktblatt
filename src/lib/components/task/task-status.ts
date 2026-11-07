import type { TaskStatus } from '#lib/domain/schema.ts';
import { m } from '#lib/paraglide/messages.js';

export function taskStatusLabel(status: TaskStatus): string {
	return {
		todo: m.task_status_todo(),
		in_progress: m.task_status_in_progress(),
		done: m.task_status_done()
	}[status];
}
