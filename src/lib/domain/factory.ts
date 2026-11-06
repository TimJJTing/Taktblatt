/** Functions that make new, empty entities with correct default values. */
import { todayISO, type ISODate } from './date.ts';
import { createId } from './ids.ts';
import { nextStageColor } from './palette.ts';
import type { Band, Milestone, Plan, RemarkSection, Stage, Task } from './schema.ts';

/** Returns the first day of the month of `date`, plus `months` months. */
function monthStart(date: ISODate, months: number): ISODate {
	const [y, m] = date.split('-').map(Number);
	const total = y * 12 + (m - 1) + months;
	return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

/** Returns the last day of the month of `date`, plus `months` months. */
function monthEnd(date: ISODate, months: number): ISODate {
	const next = monthStart(date, months + 1);
	const [y, m] = next.split('-').map(Number);
	const last = new Date(Date.UTC(y, m - 1, 0));
	return last.toISOString().slice(0, 10);
}

export function createStage(used: Stage['color'][] = []): Stage {
	return { id: createId(), title: '', description: '', color: nextStageColor(used) };
}

export function createTask(stageId: string, parentId: string | null = null): Task {
	return {
		id: createId(),
		stageId,
		parentId,
		title: '',
		deliverable: '',
		start: null,
		end: null,
		owners: [],
		done: false,
		note: '',
		dependsOn: [],
		createdAt: new Date().toISOString()
	};
}

export function createRemarkSection(): RemarkSection {
	return { id: createId(), title: '', bullets: [] };
}

/**
 * Returns an empty plan. The range is the current month and the next two months.
 * The heading is empty. The UI shows "Untitled plan" as a placeholder.
 */
export function createEmptyPlan(today: ISODate = todayISO()): Plan {
	const now = new Date().toISOString();
	return {
		id: createId(),
		heading: '',
		subheading: '',
		range: { start: monthStart(today, 0), end: monthEnd(today, 2) },
		objective: '',
		paper: 'a4',
		footer: { note: '', version: '', date: null, right: '' },
		stages: [createStage()],
		tasks: [],
		milestones: [],
		bands: [],
		remarks: [],
		createdAt: now,
		updatedAt: now
	};
}

export function createMilestone(date: ISODate = todayISO()): Milestone {
	return { id: createId(), title: '', description: '', date, symbol: 'diamond' };
}

export function createBand(start: ISODate = todayISO(), end: ISODate = start): Band {
	return { id: createId(), title: '', start, end, color: 'gray' };
}
