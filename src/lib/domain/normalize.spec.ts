import { describe, expect, it } from 'vitest';
import { createBand, createEmptyPlan, createMilestone } from '#lib/domain/factory.js';
import { normalizeBand, normalizeMilestone, normalizePlan } from '#lib/domain/normalize.js';

describe('timeline normalization', () => {
	it('trims milestone text and keeps its identity, date and symbol', () => {
		const entry = {
			...createMilestone('2027-01-01'),
			title: ' Review ',
			description: ' Discuss\nresults ',
			symbol: 'star' as const
		};
		expect(normalizeMilestone(entry)).toEqual({
			...entry,
			title: 'Review',
			description: 'Discuss\nresults'
		});
		expect(entry.title).toBe(' Review ');
	});
	it('trims band titles and keeps dates and tint', () => {
		const entry = { ...createBand('2027-01-01', '2027-02-01'), title: ' Launch ' };
		expect(normalizeBand(entry)).toEqual({ ...entry, title: 'Launch' });
		expect(entry.title).toBe(' Launch ');
	});
	it('keeps empty timeline text', () => {
		expect(
			normalizeMilestone({ ...createMilestone(), title: ' ', description: ' ' })
		).toMatchObject({ title: '', description: '' });
		expect(normalizeBand({ ...createBand(), title: ' ' })).toMatchObject({ title: '' });
	});
	it('stores subheading text as typed and trims other header fields', () => {
		const plan = {
			...createEmptyPlan(),
			heading: ' Plan ',
			subheading: ' Mixed Case  ',
			objective: ' Goal '
		};
		expect(normalizePlan(plan)).toMatchObject({
			heading: 'Plan',
			subheading: ' Mixed Case  ',
			objective: 'Goal'
		});
	});
});
