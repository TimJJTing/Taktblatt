/**
 * Spreadsheet navigation in the work-plan tables.
 * Each row has `data-grid-row`. Each editable cell has `data-grid-col="<name>"`.
 */

/** Moves the focus to the same column in the next (or previous) row of the same table. */
export function focusSiblingRow(from: Element, delta: 1 | -1): boolean {
	const row = from.closest('[data-grid-row]');
	const cell = from.closest('[data-grid-col]');
	const table = row?.closest('table');
	if (!row || !cell || !table) return false;
	const rows = [...table.querySelectorAll('[data-grid-row]')];
	const target = rows[rows.indexOf(row) + delta];
	const col = cell.getAttribute('data-grid-col');
	const next = target?.querySelector<HTMLElement>(
		`[data-grid-col="${col}"] button, [data-grid-col="${col}"] [tabindex]`
	);
	if (!next) return false;
	next.focus();
	return true;
}
