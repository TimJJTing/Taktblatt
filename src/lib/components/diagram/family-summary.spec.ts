import { describe, expect, it } from 'vitest';
import type { FamilySummary } from '#lib/domain/derive.ts';
import { getLocale, overwriteGetLocale } from '#lib/paraglide/runtime.js';
import { familySummaryText } from './family-summary.ts';

const empty: FamilySummary = {
	ready: 0,
	blocked: 0,
	inProgress: 0,
	done: 0,
	canceled: 0,
	total: 0
};

describe('familySummaryText', () => {
	it('omits zero counts and joins ready and blocked in order', () => {
		expect(familySummaryText({ ...empty, ready: 1, blocked: 1, total: 2 }, 'en')).toBe(
			'1 ready and 1 blocked'
		);
	});

	it('joins in-progress and done counts in order', () => {
		expect(familySummaryText({ ...empty, inProgress: 1, done: 1, total: 2 }, 'en')).toBe(
			'1 in progress and 1 done'
		);
	});

	it('uses the English list format for three nonzero counts', () => {
		expect(familySummaryText({ ...empty, ready: 1, blocked: 2, canceled: 1, total: 4 }, 'en')).toBe(
			'1 ready, 2 blocked, and 1 canceled'
		);
	});

	it('keeps all five counts in the specified order', () => {
		expect(
			familySummaryText(
				{ ready: 1, blocked: 2, inProgress: 3, done: 4, canceled: 5, total: 15 },
				'en'
			)
		).toBe('1 ready, 2 blocked, 3 in progress, 4 done, and 5 canceled');
	});

	it('uses the passed locale when the ambient locale differs', () => {
		const original = getLocale;
		overwriteGetLocale(() => 'en');
		try {
			expect(familySummaryText({ ...empty, ready: 1, blocked: 2, total: 3 }, 'de')).toBe(
				'1 bereit und 2 blockiert'
			);
		} finally {
			overwriteGetLocale(original);
		}
	});

	it('returns an empty string when all counts are zero', () => {
		expect(familySummaryText(empty, 'en')).toBe('');
	});
});
