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
		expect(markLabel({ mark: { kind: 'none' }, title: 'Site survey', dates, status: 'todo' })).toBe(
			''
		);
		expect(
			markLabel({ mark: { kind: 'invalid' }, title: 'Site survey', dates, status: 'done' })
		).toBe('');
		expect(
			markLabel({
				mark: { kind: 'outside', side: 'before' },
				title: 'Site survey',
				dates,
				status: 'done'
			})
		).toBe('');
	});

	it('adds the in-progress clause to a clipped bar and a point', () => {
		overwriteGetLocale(() => 'en');
		const base = m.gantt_bar({
			task: 'Site survey',
			dates: formatRangeDisplay(dates.start, dates.end, uiIntl())
		});
		expect(
			markLabel({
				mark: { kind: 'bar', x0: 0, x1: 1, clipStart: true, clipEnd: false },
				title: 'Site survey',
				dates,
				status: 'in_progress'
			})
		).toBe([base, m.gantt_in_progress(), m.gantt_clipped_start()].join(', '));
		const pointDate = '2027-04-02';
		expect(
			markLabel({
				mark: { kind: 'point', x: 0.2, date: pointDate },
				title: 'Permit',
				dates: { start: pointDate, end: null },
				status: 'in_progress'
			})
		).toBe(
			`${m.gantt_bar({ task: 'Permit', dates: formatDate(pointDate, uiIntl()) })}, ${m.gantt_in_progress()}`
		);
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
				status: 'todo'
			})
		).toBe(baseBar);

		expect(
			markLabel({
				mark: { kind: 'point', x: 0.2, date: '2027-04-02' },
				title: 'Permit',
				dates: { start: '2027-04-02', end: null },
				status: 'todo'
			})
		).toBe(basePoint);

		const doneBar = markLabel({
			mark: { kind: 'bar', x0: 0.1, x1: 0.5, clipStart: false, clipEnd: false },
			title: 'Site survey',
			dates,
			status: 'done'
		});
		expect(doneBar).toBe(`${baseBar}${separator}${m.gantt_done()}`);
		expect(doneBar).not.toMatch(/\band\b|\bund\b|和/);

		const donePoint = markLabel({
			mark: { kind: 'point', x: 0.2, date: '2027-04-02' },
			title: 'Permit',
			dates: { start: '2027-04-02', end: null },
			status: 'done'
		});
		expect(donePoint).toBe(`${basePoint}${separator}${m.gantt_done()}`);

		const clippedDoneBar = markLabel({
			mark: { kind: 'bar', x0: 0, x1: 1, clipStart: true, clipEnd: true },
			title: 'Site survey',
			dates,
			status: 'done'
		});
		expect(clippedDoneBar).toBe(
			[baseBar, m.gantt_done(), m.gantt_clipped_start(), m.gantt_clipped_end()].join(separator)
		);
	});
});
