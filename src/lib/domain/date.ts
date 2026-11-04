/**
 * Date-only helpers. A date is an ISO string "YYYY-MM-DD".
 * Do not use `Date` objects for stored dates. They cause time-zone shifts.
 */

export type ISODate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns true when the value is a real calendar date in "YYYY-MM-DD" format. */
export function isISODate(value: string): value is ISODate {
	if (!ISO_DATE.test(value)) return false;
	const [y, m, d] = value.split('-').map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Returns the local date of the viewer as "YYYY-MM-DD". */
export function todayISO(now: Date = new Date()): ISODate {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}
