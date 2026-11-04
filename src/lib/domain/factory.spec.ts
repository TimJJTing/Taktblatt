import { describe, expect, it } from 'vitest';
import { __test, createEmptyPlan } from './factory';
import { normalizeOwners, renameOwner } from './owners';
import { nextStageColor } from './palette';

describe('createEmptyPlan', () => {
	it('uses the current month and the next two months as the range', () => {
		const plan = createEmptyPlan('en', '2027-11-15');
		expect(plan.range).toEqual({ start: '2027-11-01', end: '2028-01-31' });
		expect(plan.stages).toHaveLength(1);
		expect(plan.heading).toBe('');
	});

	it('calculates month ends in leap years', () => {
		expect(__test.monthEnd('2028-02-10', 0)).toBe('2028-02-29');
	});
});

describe('owners', () => {
	it('trims, removes empty names and removes duplicates without case', () => {
		expect(normalizeOwners([' Ana', 'ana ', '', 'Bo'])).toEqual(['Ana', 'Bo']);
	});

	it('renames an owner and merges duplicates', () => {
		expect(renameOwner(['ana', 'Bo'], 'ANA', 'Bo')).toEqual(['Bo']);
	});
});

describe('nextStageColor', () => {
	it('returns the first unused color', () => {
		expect(nextStageColor(['blue', 'amber'])).toBe('green');
	});
});
