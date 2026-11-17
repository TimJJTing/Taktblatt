import type { FamilySummary } from '#lib/domain/derive.ts';
import { joinList } from '#lib/domain/format.ts';
import { m } from '#lib/paraglide/messages.js';
import type { Locale } from '#lib/paraglide/runtime.js';

export function familySummaryText(summary: FamilySummary, locale: Locale): string {
	const parts: string[] = [];
	if (summary.ready) parts.push(m.diagram_family_ready({ count: summary.ready }, { locale }));
	if (summary.blocked) parts.push(m.diagram_family_blocked({ count: summary.blocked }, { locale }));
	if (summary.inProgress)
		parts.push(m.diagram_family_in_progress({ count: summary.inProgress }, { locale }));
	if (summary.done) parts.push(m.diagram_family_done({ count: summary.done }, { locale }));
	if (summary.canceled)
		parts.push(m.diagram_family_canceled({ count: summary.canceled }, { locale }));
	return joinList(parts, locale);
}
