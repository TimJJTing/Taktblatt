import { describe, expect, it } from 'vitest';
import { makePlan, makeTask } from '#lib/domain/test-helpers.ts';
import { MemoryStorage } from './memory-storage.ts';
import { createEmptyPlan } from '#lib/domain/factory.ts';
import { SCHEMA_VERSION, type Plan } from '#lib/domain/schema.ts';
import { KEYS, PlanStorage } from './storage.ts';

describe('PlanStorage', () => {
	const setup = () => {
		const storage = new MemoryStorage();
		return { storage, plans: new PlanStorage(storage) };
	};

	it('keeps each damaged value when timestamps are equal', () => {
		const { storage, plans } = setup();
		const now = new Date('2027-01-01T00:00:00.000Z');
		const first = plans.keepDamaged('first', now);
		const second = plans.keepDamaged('second', now);
		expect(first).not.toBe(second);
		expect(first).toMatch(/^taktblatt:damaged:2027-01-01T00:00:00.000Z:/);
		expect(storage.getItem(first)).toBe('first');
		expect(storage.getItem(second)).toBe('second');
	});

	it('loads a stored plan that still has the old locale key and drops the key', () => {
		const { storage, plans } = setup();
		const plan = createEmptyPlan('2027-04-01');
		storage.setItem(
			KEYS.plan(plan.id),
			JSON.stringify({ schemaVersion: SCHEMA_VERSION, plan: { ...plan, locale: 'ja' } })
		);
		const result = plans.loadPlan(plan.id);
		expect(result.ok).toBe(true);
		if (result.ok === true) expect(result.value).not.toHaveProperty('locale');
	});

	it('reports a missing index and a missing plan', () => {
		const { plans } = setup();
		expect(plans.loadIndex()).toEqual({ ok: 'missing' });
		expect(plans.loadPlan('none')).toEqual({ ok: 'missing' });
	});

	it('saves and loads the index', () => {
		const { plans } = setup();
		const index = { planIds: ['a', 'b'], activeId: 'b' };
		plans.saveIndex(index);
		expect(plans.loadIndex()).toEqual({ ok: true, value: index });
	});

	it.each(['not json', '{"planIds":"a","activeId":null}', '{"planIds":[]}', 'null'])(
		'returns the raw text of a damaged index: %s',
		(raw) => {
			const { storage, plans } = setup();
			storage.setItem(KEYS.index, raw);
			expect(plans.loadIndex()).toEqual({ ok: false, raw });
		}
	);

	it('saves a plan with the schema version and loads it again', () => {
		const { storage, plans } = setup();
		const plan = createEmptyPlan('2027-04-01');
		plan.heading = 'Roadmap';
		plans.savePlan(plan);
		expect(JSON.parse(storage.getItem(KEYS.plan(plan.id))!).schemaVersion).toBe(SCHEMA_VERSION);
		expect(plans.loadPlan(plan.id)).toEqual({ ok: true, value: plan });
	});

	it.each([
		['text that is not JSON', () => 'oops'],
		['a plan without a schema version', (plan: Plan) => JSON.stringify({ plan })],
		[
			'a plan from a newer app version',
			(plan: Plan) => JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, plan })
		],
		[
			'a plan with an invalid field',
			(plan: Plan) =>
				JSON.stringify({ schemaVersion: SCHEMA_VERSION, plan: { ...plan, paper: 'a3' } })
		]
	])('returns the raw text of %s', (_name, make) => {
		const { storage, plans } = setup();
		const plan = createEmptyPlan('2027-04-01');
		const raw = make(plan);
		storage.setItem(KEYS.plan(plan.id), raw);
		expect(plans.loadPlan(plan.id)).toEqual({ ok: false, raw });
	});

	it('restores raw plan and index text, and removes the key for null', () => {
		const { storage, plans } = setup();
		const plan = createEmptyPlan('2027-04-01');
		plans.savePlan(plan);
		plans.saveIndex({ planIds: [plan.id], activeId: plan.id });
		const rawPlan = plans.rawPlan(plan.id);
		const rawIndex = plans.rawIndex();
		plans.savePlan({ ...plan, heading: 'Changed' });
		plans.saveIndex({ planIds: [], activeId: null });
		plans.restoreRawPlan(plan.id, rawPlan);
		plans.restoreRawIndex(rawIndex);
		expect(plans.rawPlan(plan.id)).toBe(rawPlan);
		expect(plans.rawIndex()).toBe(rawIndex);
		plans.restoreRawPlan(plan.id, null);
		plans.restoreRawIndex(null);
		expect(storage.getItem(KEYS.plan(plan.id))).toBeNull();
		expect(storage.getItem(KEYS.index)).toBeNull();
	});

	it('lists all stored plans, also plans that are not in the index, and nothing else', () => {
		const { storage, plans } = setup();
		const a = createEmptyPlan('2027-04-01');
		const b = createEmptyPlan('2027-04-01');
		plans.savePlan(a);
		plans.savePlan(b);
		plans.saveIndex({ planIds: [a.id], activeId: a.id });
		plans.keepDamaged('x');
		storage.setItem(KEYS.viewer, '{}');
		expect(plans.storedPlanIds().sort()).toEqual([a.id, b.id].sort());
		plans.removePlan(b.id);
		expect(plans.storedPlanIds()).toEqual([a.id]);
	});
});

describe('planned windows on load', () => {
	it('widens a narrow parent and keeps a wider parent when reading stored JSON', () => {
		const narrow = makeTask({
			id: 'narrow',
			start: '2027-02-05',
			end: '2027-02-10',
			owners: ['Own'],
			status: 'todo'
		});
		const wide = makeTask({
			id: 'wide',
			start: '2027-01-01',
			end: '2027-12-31',
			owners: ['Own', 'Child'],
			status: 'todo'
		});
		const plan = makePlan([
			narrow,
			makeTask({
				id: 'a',
				parentId: 'narrow',
				start: '2027-02-01',
				end: '2027-02-20',
				owners: ['Child'],
				status: 'done'
			}),
			wide,
			makeTask({
				id: 'b',
				parentId: 'wide',
				start: '2027-02-01',
				end: '2027-02-20',
				owners: ['Child'],
				status: 'done'
			})
		]);
		const storage = new MemoryStorage();
		storage.setItem(KEYS.plan(plan.id), JSON.stringify({ schemaVersion: SCHEMA_VERSION, plan }));
		const result = new PlanStorage(storage).loadPlan(plan.id);
		expect(result.ok).toBe(true);
		if (result.ok !== true) throw new Error('Expected the stored plan to load');
		expect(result.value.tasks.find((task) => task.id === 'narrow')).toMatchObject({
			start: '2027-02-01',
			end: '2027-02-20',
			owners: ['Own', 'Child'],
			status: 'done'
		});
		expect(result.value.tasks.find((task) => task.id === 'wide')).toEqual({
			...wide,
			status: 'done'
		});
	});
});
