import { describe, expect, it } from 'vitest';
import { dayNumber, isISODate, isoFromDayNumber, todayISO } from './date.js';

describe('isISODate', () => {
	it('accepts a real calendar date', () => {
		expect(isISODate('2028-02-29')).toBe(true);
	});

	it('rejects a date that does not exist', () => {
		expect(isISODate('2027-02-29')).toBe(false);
	});

	it.each([
		'2027-13-01',
		'2027-00-10',
		'2027-04-31',
		'2027-01-00',
		'2027-1-01',
		'27-01-01',
		'',
		' 2027-01-01'
	])('rejects the invalid value "%s"', (value) => {
		expect(isISODate(value)).toBe(false);
	});

	it('accepts the first and last day of a year', () => {
		expect(isISODate('2027-01-01')).toBe(true);
		expect(isISODate('2027-12-31')).toBe(true);
	});

	it('rejects a timestamp', () => {
		expect(isISODate('2027-01-01T00:00:00Z')).toBe(false);
	});
});

describe('todayISO', () => {
	it('uses the local date', () => {
		expect(todayISO(new Date(2027, 0, 5, 23, 59))).toBe('2027-01-05');
		expect(todayISO(new Date(2027, 0, 5, 0, 0))).toBe('2027-01-05');
	});

	it('pads the month and the day', () => {
		expect(todayISO(new Date(2027, 8, 9, 12))).toBe('2027-09-09');
	});
});

describe('dayNumber', () => {
	it('counts days from 1970-01-01', () => {
		expect(dayNumber('1970-01-01')).toBe(0);
		expect(dayNumber('1970-01-02')).toBe(1);
	});

	it('is not affected by daylight saving time', () => {
		expect(dayNumber('2027-03-29') - dayNumber('2027-03-28')).toBe(1);
		expect(dayNumber('2027-10-31') - dayNumber('2027-10-30')).toBe(1);
	});
});

describe('isoFromDayNumber', () => {
	it('is the inverse of dayNumber', () => {
		expect(isoFromDayNumber(dayNumber('2028-02-29'))).toBe('2028-02-29');
		expect(isoFromDayNumber(dayNumber('2027-12-31') + 1)).toBe('2028-01-01');
	});

	it('handles dates before 1970', () => {
		expect(dayNumber('1969-12-31')).toBe(-1);
		expect(isoFromDayNumber(-1)).toBe('1969-12-31');
	});

	it('round-trips every day of a leap year', () => {
		const first = dayNumber('2028-01-01');
		const days = Array.from({ length: 366 }, (_, i) => isoFromDayNumber(first + i));
		expect(days.at(-1)).toBe('2028-12-31');
		for (const day of days) {
			expect(isISODate(day)).toBe(true);
			expect(isoFromDayNumber(dayNumber(day))).toBe(day);
		}
	});
});
