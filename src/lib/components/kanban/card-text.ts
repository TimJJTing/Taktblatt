import { formatRangeDisplay } from '#lib/domain/format.ts';
import { m } from '#lib/paraglide/messages.js';
import type { KanbanCard } from '#lib/scene/kanban-board.ts';

export function cardDates(card: KanbanCard, locale: string): string {
	if (!card.start && !card.end) return m.gantt_no_dates();
	const value = formatRangeDisplay(card.start, card.end, locale);
	if (!card.end) return m.field_value({ label: m.date_start(), value });
	if (!card.start) return m.field_value({ label: m.date_end(), value });
	return card.start > card.end ? m.field_value({ label: m.gantt_invalid_dates(), value }) : value;
}
