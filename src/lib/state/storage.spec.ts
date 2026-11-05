import { expect, it } from 'vitest';
import { MemoryStorage } from './memory-storage';
import { createEmptyPlan } from '#lib/domain/factory.js';
import { SCHEMA_VERSION } from '#lib/domain/schema.js';
import { KEYS, PlanStorage } from './storage';

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

it('loads a stored plan that still has the old locale key and drops the key', () => {
	const storage = new MemoryStorage();
	const plans = new PlanStorage(storage);
	const plan = createEmptyPlan('2027-04-01');
	storage.setItem(
		KEYS.plan(plan.id),
		JSON.stringify({ schemaVersion: SCHEMA_VERSION, plan: { ...plan, locale: 'ja' } })
	);
	const result = plans.loadPlan(plan.id);
	expect(result.ok).toBe(true);
	if (result.ok === true) expect(result.value).not.toHaveProperty('locale');
});
