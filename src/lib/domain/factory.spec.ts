import { describe, expect, it } from 'vitest';
import { createBand, createMilestone, createEmptyPlan } from './factory';

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

describe('timeline factories', () => {
	it('makes milestones with unique ids and a default symbol', () => {
		const first = createMilestone('2027-03-01');
		expect(first).toMatchObject({
			title: '',
			description: '',
			date: '2027-03-01',
			symbol: 'diamond'
		});
		expect(first.id).not.toBe(createMilestone().id);
	});
	it('makes bands with a default tint and a single-day default range', () => {
		const first = createBand('2027-03-01');
		expect(first).toMatchObject({
			title: '',
			start: '2027-03-01',
			end: '2027-03-01',
			color: 'gray'
		});
		expect(first.id).not.toBe(createBand().id);
		expect(createBand('2027-03-01', '2027-04-01').end).toBe('2027-04-01');
	});
});
