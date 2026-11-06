import { describe, expect, it } from 'vitest';
import {
	createBand,
	createEmptyPlan,
	createMilestone,
	createRemarkSection,
	createStage,
	createTask
} from './factory.ts';
import { PlanSchema } from './schema.ts';
import * as v from 'valibot';

describe('createEmptyPlan', () => {
	it('uses the current month and the next two months as the range', () => {
		const plan = createEmptyPlan('2027-11-15');
		expect(plan.range).toEqual({ start: '2027-11-01', end: '2028-01-31' });
		expect(plan.stages).toHaveLength(1);
		expect(plan.heading).toBe('');
	});

	it('calculates month ends in leap years', () => {
		expect(createEmptyPlan('2027-12-10').range.end).toBe('2028-02-29');
	});

	it('starts a range on the first day of the month on the last day of a month', () => {
		expect(createEmptyPlan('2027-01-31').range).toEqual({ start: '2027-01-01', end: '2027-03-31' });
	});

	it('makes a plan that passes the schema', () => {
		expect(v.safeParse(PlanSchema, createEmptyPlan('2027-11-15')).success).toBe(true);
	});

	it('gives each plan a new id', () => {
		expect(createEmptyPlan().id).not.toBe(createEmptyPlan().id);
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

describe('content factories', () => {
	it('makes a stage with the next free color', () => {
		expect(createStage(['blue'])).toMatchObject({ title: '', description: '', color: 'amber' });
	});

	it('makes an empty open task in the given stage and parent', () => {
		const task = createTask('s1', 'p1');
		expect(task).toMatchObject({
			stageId: 's1',
			parentId: 'p1',
			title: '',
			start: null,
			end: null,
			owners: [],
			done: false,
			dependsOn: []
		});
		expect(createTask('s1').parentId).toBeNull();
		expect(Number.isNaN(Date.parse(task.createdAt))).toBe(false);
	});

	it('makes an empty remark section', () => {
		expect(createRemarkSection()).toMatchObject({ title: '', bullets: [] });
	});
});
