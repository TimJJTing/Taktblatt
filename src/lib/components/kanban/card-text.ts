import type { BoardColumn } from '#lib/domain/derive.ts';
import { formatRangeDisplay, joinList } from '#lib/domain/format.ts';
import { m } from '#lib/paraglide/messages.js';
import type { KanbanCard } from '#lib/scene/kanban-board.ts';
import { kanbanColumnLabel } from '#lib/scene/kanban-paper.ts';

export function kanbanTaskContext(
	stage: Pick<KanbanCard, 'stageNumber' | 'stageTitle'>,
	column: BoardColumn | null,
	locale: string
): string {
	return m.kanban_summary({
		stage: joinList([m.stage_badge({ n: stage.stageNumber }), stage.stageTitle], locale),
		status:
			column === null
				? m.task_status_canceled()
				: column === 'blocked'
					? joinList([m.task_status_todo(), kanbanColumnLabel(column)], locale)
					: kanbanColumnLabel(column)
	});
}

export function cardDates(card: KanbanCard, locale: string): string {
	if (!card.start && !card.end) return m.gantt_no_dates();
	const value = formatRangeDisplay(card.start, card.end, locale);
	if (!card.end) return m.field_value({ label: m.date_start(), value });
	if (!card.start) return m.field_value({ label: m.date_end(), value });
	return card.start > card.end ? m.field_value({ label: m.gantt_invalid_dates(), value }) : value;
}
