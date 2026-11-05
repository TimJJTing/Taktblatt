import { describe, expect, it } from 'vitest';
import { createBand, createEmptyPlan, createMilestone } from '#lib/domain/factory.js';
import {
	isPermutation,
	normalizeBand,
	normalizeFooter,
	normalizeMilestone,
	normalizePlan,
	normalizeRemark,
	normalizeStage,
	normalizeTask
} from '#lib/domain/normalize.js';
import { makeTask } from '#lib/domain/test-helpers.js';

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

describe('content normalization', () => {
	it('trims task text, cleans owners and keeps note spaces', () => {
		const task = makeTask({
			id: 't1',
			title: ' Draft ',
			deliverable: ' Report ',
			owners: [' Ana', 'ANA', ' '],
			note: '  indented\n'
		});
		expect(normalizeTask(task)).toEqual({
			...task,
			title: 'Draft',
			deliverable: 'Report',
			owners: ['Ana'],
			note: '  indented\n'
		});
		expect(task.title).toBe(' Draft ');
	});

	it('trims stage text and keeps the color', () => {
		const stage = { id: 's', title: ' Plan ', description: ' Scope\n', color: 'teal' as const };
		expect(normalizeStage(stage)).toEqual({ ...stage, title: 'Plan', description: 'Scope' });
	});

	it('trims remark bullets and removes empty bullets', () => {
		expect(
			normalizeRemark({ id: 'r', title: ' Risks ', bullets: [' A ', '', '   ', 'B'] })
		).toEqual({ id: 'r', title: 'Risks', bullets: ['A', 'B'] });
	});

	it('trims all footer fields', () => {
		expect(
			normalizeFooter({ note: ' N ', version: ' v2 ', date: '2027-01-01', right: ' R ' })
		).toEqual({
			note: 'N',
			date: '2027-01-01',
			version: 'v2',
			right: 'R'
		});
	});
});

describe('isPermutation', () => {
	it('accepts the same ids in any order', () => {
		expect(isPermutation(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true);
		expect(isPermutation([], [])).toBe(true);
	});

	it.each([[['a']], [['a', 'b', 'c', 'd']], [['a', 'a', 'b']], [['a', 'b', 'x']]])(
		'rejects %j for the ids a, b and c',
		(ids) => {
			expect(isPermutation(['a', 'b', 'c'], ids)).toBe(false);
		}
	);
});
