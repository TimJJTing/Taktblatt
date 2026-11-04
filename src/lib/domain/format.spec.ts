import { describe, expect, it } from 'vitest';
import {
	formatDate,
	formatDay,
	formatMonthSpan,
	formatRange,
	formatRangeDisplay,
	parseUserDate,
	readTypedDate
} from './format';

describe('format', () => {
	it('formats short days in the document language', () => {
		expect(formatDay('2027-11-27', 'en-US')).toBe('Nov 27');
		expect(formatDay('2027-11-27', 'de')).toBe('27. Nov.');
	});

	it('formats a month span', () => {
		expect(formatMonthSpan('2027-11-02', '2027-11-30', 'en-US')).toBe('Nov');
		expect(formatMonthSpan('2027-11-02', '2027-12-30', 'en-US')).toBe('Nov – Dec');
	});

	it('formats a range across years', () => {
		expect(formatRange('2026-11-01', '2027-01-31', 'en-US')).toMatch(
			/Nov 1, 2026\s–\sJan 31, 2027/
		);
	});
});

describe('formatRangeDisplay', () => {
	it.each(['en-US', 'de', 'zh-TW', 'ja'])('formats all range states in %s', (locale) => {
		expect(formatRangeDisplay(null, null, locale)).toBe('–');
		expect(formatRangeDisplay('2026-11-01', null, locale)).toBe(formatDate('2026-11-01', locale));
		expect(formatRangeDisplay(null, '2027-01-31', locale)).toBe(formatDate('2027-01-31', locale));
		expect(formatRangeDisplay('2026-11-01', '2027-01-31', locale)).toBe(
			formatRange('2026-11-01', '2027-01-31', locale)
		);
	});

	it('formats equal endpoints as a full range', () => {
		expect(formatRangeDisplay('2026-11-01', '2026-11-01', 'en-US')).toBe(
			formatRange('2026-11-01', '2026-11-01', 'en-US')
		);
	});
});

describe('parseUserDate', () => {
	it('accepts ISO dates', () => {
		expect(parseUserDate('2027-01-05', 'en-US', 2030)).toBe('2027-01-05');
	});

	it('uses the order of the locale', () => {
		expect(parseUserDate('1/5/2027', 'en-US', 2030)).toBe('2027-01-05');
		expect(parseUserDate('5.1.2027', 'de', 2030)).toBe('2027-01-05');
		expect(parseUserDate('2027/1/5', 'ja', 2030)).toBe('2027-01-05');
	});

	it('uses the reference year when the year is missing', () => {
		expect(parseUserDate('5.1.', 'de', 2030)).toBe('2030-01-05');
		expect(parseUserDate('1/5', 'zh-TW', 2030)).toBe('2030-01-05');
	});

	it('rejects dates that do not exist', () => {
		expect(parseUserDate('2/30/2027', 'en-US', 2030)).toBeNull();
		expect(parseUserDate('hello', 'en-US', 2030)).toBeNull();
	});
});

describe('readTypedDate', () => {
	it('keeps the current date when the text shows it', () => {
		expect(readTypedDate(' Jan 5, 2027 ', '2027-01-05', 'en-US', 2027)).toEqual({ kind: 'same' });
		expect(readTypedDate('', null, 'en-US', 2027)).toEqual({ kind: 'same' });
	});

	it('reads empty text as no date', () => {
		expect(readTypedDate('', '2027-01-05', 'en-US', 2027)).toEqual({ kind: 'date', date: null });
	});

	it('reads a typed date', () => {
		expect(readTypedDate('2/3', null, 'en-US', 2028)).toEqual({ kind: 'date', date: '2028-02-03' });
	});

	it('rejects text that is not a date', () => {
		expect(readTypedDate('soon', null, 'en-US', 2027)).toEqual({ kind: 'invalid' });
	});
});
