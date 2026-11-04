/**
 * Date formatting and parsing for the document language.
 * All functions use UTC, because stored dates have no time zone.
 */
import { isISODate, type ISODate } from './date';

const toDate = (date: ISODate) => new Date(`${date}T00:00:00Z`);

const cache = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = `${locale}|${JSON.stringify(options)}`;
	let f = cache.get(key);
	if (!f) {
		f = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
		cache.set(key, f);
	}
	return f;
}

/** "Nov 27" */
export function formatDay(date: ISODate, locale: string): string {
	return formatter(locale, { month: 'short', day: 'numeric' }).format(toDate(date));
}

/** "Nov 27, 2026" */
export function formatDate(date: ISODate, locale: string): string {
	return formatter(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(
		toDate(date)
	);
}

/** "Nov 1, 2026 – Jan 31, 2027". The year shows only when it is necessary. */
export function formatRange(start: ISODate, end: ISODate, locale: string, withYear = true): string {
	const options: Intl.DateTimeFormatOptions = withYear
		? { year: 'numeric', month: 'short', day: 'numeric' }
		: { month: 'short', day: 'numeric' };
	return formatter(locale, options).formatRange(toDate(start), toDate(end));
}

/** "Nov" or "Nov – Dec". */
export function formatMonthSpan(start: ISODate, end: ISODate, locale: string): string {
	const f = formatter(locale, { month: 'short' });
	const a = f.format(toDate(start));
	const b = f.format(toDate(end));
	return start.slice(0, 7) === end.slice(0, 7) || a === b ? a : `${a} – ${b}`;
}

/** "Nov 2026" */
export function formatMonth(date: ISODate, locale: string): string {
	return formatter(locale, { year: 'numeric', month: 'short' }).format(toDate(date));
}

type Part = 'year' | 'month' | 'day';

/** The order of year, month and day in a numeric date of the locale. */
function numericOrder(locale: string): Part[] {
	return formatter(locale, { year: 'numeric', month: 'numeric', day: 'numeric' })
		.formatToParts(new Date(Date.UTC(2033, 10, 22)))
		.filter((p): p is Intl.DateTimeFormatPart & { type: Part } =>
			['year', 'month', 'day'].includes(p.type)
		)
		.map((p) => p.type);
}

function build(y: number, m: number, d: number): ISODate | null {
	const value = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	return isISODate(value) ? value : null;
}

/**
 * Parses a date that a person typed. Accepts "YYYY-MM-DD" and numeric dates in the order of the locale,
 * for example "1/5/2027" (en), "5.1.2027" (de), "2027/1/5" (ja). Without a year, `referenceYear` is used.
 */
export function parseUserDate(text: string, locale: string, referenceYear: number): ISODate | null {
	const value = text.trim();
	if (isISODate(value)) return value;
	const numbers = value
		.split(/[^0-9]+/)
		.filter(Boolean)
		.map(Number);
	if (numbers.length < 2 || numbers.length > 3) return null;
	// A leading 4-digit number is always the year.
	if (numbers.length === 3 && value.trim().match(/^\d{4}/))
		return build(numbers[0], numbers[1], numbers[2]);
	const order = numericOrder(locale).filter((p) => numbers.length === 3 || p !== 'year');
	const parts: Record<Part, number> = { year: referenceYear, month: 0, day: 0 };
	order.forEach((part, i) => (parts[part] = numbers[i]));
	if (parts.year < 100) parts.year += 2000;
	return build(parts.year, parts.month, parts.day);
}

/** Converts a locale code of the app to a BCP 47 tag for `Intl`. */
export function intlLocale(locale: string): string {
	return locale === 'en' ? 'en-US' : locale;
}
