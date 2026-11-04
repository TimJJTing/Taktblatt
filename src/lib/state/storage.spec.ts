import { expect, it } from 'vitest';
import { MemoryStorage } from './memory-storage';
import { PlanStorage } from './storage';

it('keeps each damaged value when timestamps are equal', () => {
	const storage = new MemoryStorage();
	const plans = new PlanStorage(storage);
	const now = new Date('2027-01-01T00:00:00.000Z');
	const first = plans.keepDamaged('first', now);
	const second = plans.keepDamaged('second', now);
	expect(first).not.toBe(second);
	expect(first).toMatch(/^taktblatt:damaged:2027-01-01T00:00:00.000Z:/);
	expect(storage.getItem(first)).toBe('first');
	expect(storage.getItem(second)).toBe('second');
});
