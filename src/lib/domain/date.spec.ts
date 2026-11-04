import { describe, expect, it } from 'vitest';
import { isISODate, todayISO } from './date';

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
