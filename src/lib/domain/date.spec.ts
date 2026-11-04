import { describe, expect, it } from 'vitest';
import { dayNumber, isISODate, isoFromDayNumber, todayISO } from './date';

describe('isISODate', () => {
	it('accepts a real calendar date', () => {
		expect(isISODate('2028-02-29')).toBe(true);
	});

	it('rejects a date that does not exist', () => {
		expect(isISODate('2027-02-29')).toBe(false);
	});

	it('rejects a timestamp', () => {
		expect(isISODate('2027-01-01T00:00:00Z')).toBe(false);
	});
});

describe('todayISO', () => {
	it('uses the local date', () => {
		expect(todayISO(new Date(2027, 0, 5, 23, 59))).toBe('2027-01-05');
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
});
