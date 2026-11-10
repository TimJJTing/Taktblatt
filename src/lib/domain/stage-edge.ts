/** Decorative stage geometry in fractions of the inclusive plan range. */
import { dayNumber, type ISODate } from './date.ts';
import { stageSpan, type TaskIndex } from './derive.ts';
import type { Stage } from './schema.ts';

export function stageEdgeSegments(
	index: TaskIndex,
	stages: readonly Stage[],
	range: { start: ISODate; end: ISODate },
	today: ISODate
): { segments: { stageId: string; left: number; width: number }[]; today: number | null } {
	const start = dayNumber(range.start);
	const end = dayNumber(range.end);
	const days = end - start + 1;
	const segments = stages.flatMap((stage) => {
		const span = stageSpan(index, stage.id);
		if (!span) return [];
		const left = Math.max(start, dayNumber(span.start));
		const right = Math.min(end, dayNumber(span.end));
		return right < left
			? []
			: [{ stageId: stage.id, left: (left - start) / days, width: (right - left + 1) / days }];
	});
	const date = dayNumber(today);
	return { segments, today: date < start || date > end ? null : (date - start) / days };
}
