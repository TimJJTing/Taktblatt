/** The accessible name of a bar or a point of the Gantt. The screen Gantt and the printed Gantt share it. */
import { formatDate, formatRangeDisplay } from '#lib/domain/format.js';
import type { GanttMark } from '#lib/domain/gantt.js';
import { uiIntl } from '#lib/domain/locale.js';
import { m } from '#lib/paraglide/messages.js';

interface MarkLabelInput {
	mark: GanttMark;
	/** The title of the task, or the text for an untitled task. */
	title: string;
	/** The effective dates of the task. */
	dates: { start: string | null; end: string | null } | null | undefined;
	done: boolean;
}

/**
 * Returns the name of a bar or a point with the task, the dates, the done state and the clipped sides.
 * Returns an empty text for any other mark.
 * The texts and the dates use the UI language.
 */
export function markLabel({ mark, title, dates, done }: MarkLabelInput): string {
	if (mark.kind !== 'bar' && mark.kind !== 'point') return '';
	const intl = uiIntl();
	const range =
		mark.kind === 'point'
			? formatDate(mark.date, intl)
			: formatRangeDisplay(dates?.start ?? null, dates?.end ?? null, intl);
	const parts = [m.gantt_bar({ task: title, dates: range })];
	if (done) parts.push(m.gantt_done());
	if (mark.kind === 'bar' && mark.clipStart) parts.push(m.gantt_clipped_start());
	if (mark.kind === 'bar' && mark.clipEnd) parts.push(m.gantt_clipped_end());
	return parts.join(', ');
}
