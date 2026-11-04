import { describe, expect, it } from 'vitest';
import { createEmptyPlan } from './factory';

describe('createEmptyPlan', () => {
	it('uses the current month and the next two months as the range', () => {
		const plan = createEmptyPlan('en', '2027-11-15');
		expect(plan.range).toEqual({ start: '2027-11-01', end: '2028-01-31' });
		expect(plan.stages).toHaveLength(1);
		expect(plan.heading).toBe('');
	});

	it('calculates month ends in leap years', () => {
		expect(createEmptyPlan('en', '2027-12-10').range.end).toBe('2028-02-29');
	});
});
