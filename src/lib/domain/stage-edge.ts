/** Decorative stage geometry in fractions of the inclusive plan range. */
import type { ISODate } from './date.ts';
import { spanX, todayX, type GanttWindow } from './gantt.ts';
import { stageSpan, type TaskIndex } from './derive.ts';
import type { Stage } from './schema.ts';

export function stageEdgeSegments(
	index: TaskIndex,
	stages: readonly Stage[],
	range: GanttWindow,
	today: ISODate
): { segments: { stageId: string; left: number; width: number }[]; today: number | null } {
	const segments = stages.flatMap((stage) => {
		const dates = stageSpan(index, stage.id);
		const span = dates ? spanX(range, dates) : null;
		return span ? [{ stageId: stage.id, left: span.x0, width: span.x1 - span.x0 }] : [];
	});
	return { segments, today: todayX(range, today) };
}
