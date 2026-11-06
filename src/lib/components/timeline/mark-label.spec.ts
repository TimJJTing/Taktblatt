import { afterEach, describe, expect, it } from 'vitest';
import { formatDate, formatRangeDisplay } from '#lib/domain/format.ts';
import { m } from '#lib/paraglide/messages.js';
import { getLocale, overwriteGetLocale } from '#lib/paraglide/runtime.js';
import { uiIntl } from '#lib/ui-language.ts';
import { markLabel } from './mark-label.ts';

describe('markLabel', () => {
	const original = getLocale;
	afterEach(() => overwriteGetLocale(original));

	const dates = { start: '2027-04-02', end: '2027-04-10' };

	it('returns an empty text for marks that are not drawn', () => {
		expect(markLabel({ mark: { kind: 'none' }, title: 'Site survey', dates, done: false })).toBe(
			''
		);
		expect(markLabel({ mark: { kind: 'invalid' }, title: 'Site survey', dates, done: true })).toBe(
			''
		);
		expect(
			markLabel({
				mark: { kind: 'outside', side: 'before' },
				title: 'Site survey',
				dates,
				done: true
			})
		).toBe('');
	});

	it.each([
		['en', ', '],
		['de', ', '],
		['zh-TW', '，'],
		['ja', '、']
	] as const)('formats single and multi-clause labels in %s', (locale, separator) => {
		overwriteGetLocale(() => locale);
		const intl = uiIntl();
		const range = formatRangeDisplay(dates.start, dates.end, intl);
		const pointDate = formatDate('2027-04-02', intl);
		const baseBar = m.gantt_bar({ task: 'Site survey', dates: range });
		const basePoint = m.gantt_bar({ task: 'Permit', dates: pointDate });

		expect(
			markLabel({
				mark: { kind: 'bar', x0: 0.1, x1: 0.5, clipStart: false, clipEnd: false },
				title: 'Site survey',
				dates,
				done: false
			})
		).toBe(baseBar);

		expect(
			markLabel({
				mark: { kind: 'point', x: 0.2, date: '2027-04-02' },
				title: 'Permit',
				dates: { start: '2027-04-02', end: null },
				done: false
			})
		).toBe(basePoint);

		const doneBar = markLabel({
			mark: { kind: 'bar', x0: 0.1, x1: 0.5, clipStart: false, clipEnd: false },
			title: 'Site survey',
			dates,
			done: true
		});
		expect(doneBar).toBe(`${baseBar}${separator}${m.gantt_done()}`);
		expect(doneBar).not.toMatch(/\band\b|\bund\b|和/);

		const donePoint = markLabel({
			mark: { kind: 'point', x: 0.2, date: '2027-04-02' },
			title: 'Permit',
			dates: { start: '2027-04-02', end: null },
			done: true
		});
		expect(donePoint).toBe(`${basePoint}${separator}${m.gantt_done()}`);

		const clippedDoneBar = markLabel({
			mark: { kind: 'bar', x0: 0, x1: 1, clipStart: true, clipEnd: true },
			title: 'Site survey',
			dates,
			done: true
		});
		expect(clippedDoneBar).toBe(
			[baseBar, m.gantt_done(), m.gantt_clipped_start(), m.gantt_clipped_end()].join(separator)
		);
	});
});
