import { readyLightText } from '#lib/components/edit/ready-light-text.ts';
import { taskStatusLabel } from '#lib/components/task/task-status.ts';
import type { BoardColumn, Readiness } from '#lib/domain/derive.ts';
import { formatRangeDisplay, joinList } from '#lib/domain/format.ts';
import { m } from '#lib/paraglide/messages.js';
import type { KanbanCard } from '#lib/scene/kanban-board.ts';

export function kanbanColumnLabel(id: BoardColumn): string {
	return id === 'blocked' ? m.kanban_blocked() : taskStatusLabel(id);
}

export function cardOwners(owners: readonly string[], intl: string): string {
	return owners.length ? joinList(owners, intl) : m.kanban_no_owners();
}

export function cardReadinessText(readiness: Readiness): string {
	return readiness.kind === 'blocked' ? m.kanban_blocked() : readyLightText(readiness);
}

export function kanbanStateText(column: BoardColumn | null): string {
	return column === null ? m.task_status_canceled() : kanbanColumnLabel(column);
}

export function kanbanTaskContext(
	stage: Pick<KanbanCard, 'stageNumber' | 'stageTitle'>,
	column: BoardColumn | null,
	locale: string
): string {
	return m.kanban_summary({
		stage: joinList([m.stage_badge({ n: stage.stageNumber }), stage.stageTitle], locale),
		status:
			column === 'blocked'
				? joinList([m.task_status_todo(), kanbanStateText(column)], locale)
				: kanbanStateText(column)
	});
}

export function cardDates(card: KanbanCard, locale: string): string {
	if (!card.start && !card.end) return m.gantt_no_dates();
	const value = formatRangeDisplay(card.start, card.end, locale);
	if (!card.end) return m.field_value({ label: m.date_start(), value });
	if (!card.start) return m.field_value({ label: m.date_end(), value });
	return card.start > card.end ? m.field_value({ label: m.gantt_invalid_dates(), value }) : value;
}
