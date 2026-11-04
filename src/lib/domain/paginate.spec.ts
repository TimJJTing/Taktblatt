import { describe, expect, it } from 'vitest';
import { paginate, type SegmentInput } from './paginate';

const segment = (id: string, patch: Partial<SegmentInput> = {}): SegmentInput => ({
	id,
	lead: 0,
	repeat: 0,
	extra: 0,
	items: [],
	keep: 1,
	gap: 0,
	breakBefore: false,
	...patch
});

/** A readable summary: one string for each fragment, for example "gantt 0-3". */
const shape = (sheets: ReturnType<typeof paginate>) =>
	sheets.map((s) =>
		s.fragments.map((f) => `${f.id} ${f.from}-${f.to}${f.first ? '' : ' cont'}`).join(' | ')
	);

describe('paginate', () => {
	it('returns one empty sheet for an empty plan', () => {
		expect(paginate(100, [])).toEqual([{ number: 1, fragments: [] }]);
	});

	it('keeps the blocks of an empty segment on one sheet', () => {
		const sheets = paginate(100, [segment('head', { lead: 40, items: [] })]);
		expect(shape(sheets)).toEqual(['head 0-0']);
	});

	it('puts small blocks on one sheet and adds the gap between them', () => {
		const sheets = paginate(100, [
			segment('a', { items: [30] }),
			segment('b', { items: [30], gap: 10 }),
			segment('c', { items: [30], gap: 10 })
		]);
		// 30 + 10 + 30 + 10 + 30 = 110 > 100: the third block moves to sheet 2.
		expect(shape(sheets)).toEqual(['a 0-1 | b 0-1', 'c 0-1']);
		expect(sheets[1].fragments[0].gap).toBe(0);
		expect(sheets[0].fragments[1].gap).toBe(10);
	});

	it('numbers the sheets from 1', () => {
		const sheets = paginate(10, [segment('a', { items: [10, 10, 10] })]);
		expect(sheets.map((s) => s.number)).toEqual([1, 2, 3]);
	});

	it('splits a segment between items and never inside an item', () => {
		const sheets = paginate(100, [segment('rows', { items: [40, 40, 40, 40, 40] })]);
		expect(shape(sheets)).toEqual(['rows 0-2', 'rows 2-4 cont', 'rows 4-5 cont']);
	});

	it('repeats the header on every continuation fragment', () => {
		// Head: lead 10 + repeat 10 + extra 5 on the first fragment. Only the repeat on the next ones.
		const sheets = paginate(100, [
			segment('gantt', { lead: 10, repeat: 10, extra: 5, items: Array(10).fill(20) })
		]);
		// First: 25 head + 3 rows of 20 = 85. Next: 10 head + 4 rows = 90. Next: 10 + 3 rows.
		expect(shape(sheets)).toEqual(['gantt 0-3', 'gantt 3-7 cont', 'gantt 7-10 cont']);
		expect(sheets[0].fragments[0].first).toBe(true);
		expect(sheets[1].fragments[0].first).toBe(false);
	});

	it('starts a segment with break-before on a new sheet', () => {
		const sheets = paginate(100, [
			segment('overview', { items: [20] }),
			segment('plan', { items: [20], breakBefore: true })
		]);
		expect(shape(sheets)).toEqual(['overview 0-1', 'plan 0-1']);
	});

	it('does not add an empty sheet for a break at the top of a sheet', () => {
		const sheets = paginate(100, [segment('plan', { items: [20], breakBefore: true })]);
		expect(shape(sheets)).toEqual(['plan 0-1']);
	});

	it('keeps a stage header with its first rows', () => {
		const sheets = paginate(100, [
			segment('overview', { items: [70] }),
			// Header 10 + 2 rows of 10 need 30. Only 30 is free, so this fits exactly.
			segment('stage-1', { lead: 10, repeat: 0, items: [10, 10, 10], keep: 2, gap: 0 }),
			// The third row of stage 1 goes to sheet 2. Stage 2 follows it there.
			segment('stage-2', { lead: 10, items: [10, 10, 10], keep: 2, gap: 0 })
		]);
		expect(shape(sheets)).toEqual(['overview 0-1 | stage-1 0-2', 'stage-1 2-3 cont | stage-2 0-3']);
	});

	it('moves a stage with no room for its keep rows to the next sheet (no orphan header)', () => {
		const sheets = paginate(100, [
			segment('overview', { items: [85] }),
			segment('stage', { lead: 10, repeat: 5, items: [10, 10, 10], keep: 2 })
		]);
		// 100 - 85 = 15: header 15 fits, but no row. The stage moves as a whole.
		expect(shape(sheets)).toEqual(['overview 0-1', 'stage 0-3']);
	});

	it('uses the keep value of one when it is the only one that fits', () => {
		const sheets = paginate(100, [
			segment('a', { items: [60] }),
			segment('stage', { lead: 10, items: [10, 10, 10], keep: 1 })
		]);
		// 40 free: header 10 + 3 rows = 40. Everything fits.
		expect(shape(sheets)).toEqual(['a 0-1 | stage 0-3']);
		const tight = paginate(100, [
			segment('a', { items: [70] }),
			segment('stage', { lead: 10, items: [10, 10, 10], keep: 1 })
		]);
		// 30 free: header 10 + 2 rows. One row goes on.
		expect(shape(tight)).toEqual(['a 0-1 | stage 0-2', 'stage 2-3 cont']);
	});

	it('limits keep to the number of items', () => {
		const sheets = paginate(100, [
			segment('a', { items: [85] }),
			segment('stage', { lead: 10, items: [10], keep: 3 })
		]);
		expect(shape(sheets)).toEqual(['a 0-1', 'stage 0-1']);
	});

	it('repeats the table header of a stage that continues', () => {
		const sheets = paginate(100, [
			segment('stage', { lead: 20, repeat: 10, items: Array(8).fill(20), keep: 2 })
		]);
		// First: 30 + 3 rows = 90. Next: 10 + 4 rows = 90. Last: 10 + 1 row.
		expect(shape(sheets)).toEqual(['stage 0-3', 'stage 3-7 cont', 'stage 7-8 cont']);
	});

	it('gives an oversize item its own sheet and lets it overflow', () => {
		const sheets = paginate(100, [
			segment('a', { items: [20] }),
			segment('big', { items: [250] }),
			segment('b', { items: [20] })
		]);
		expect(shape(sheets)).toEqual(['a 0-1', 'big 0-1', 'b 0-1']);
	});

	it('places an oversize item on an empty sheet and continues after it', () => {
		const sheets = paginate(100, [segment('rows', { repeat: 10, items: [20, 300, 20] })]);
		expect(shape(sheets)).toEqual(['rows 0-1', 'rows 1-2 cont', 'rows 2-3 cont']);
	});

	it('does not loop when the head alone is taller than a sheet', () => {
		const sheets = paginate(50, [segment('rows', { lead: 80, repeat: 80, items: [10, 10] })]);
		expect(sheets.length).toBeGreaterThan(0);
		expect(sheets.flatMap((s) => s.fragments).reduce((n, f) => n + (f.to - f.from), 0)).toBe(2);
	});

	it('moves an empty segment whose blocks do not fit to the next sheet', () => {
		const sheets = paginate(100, [
			segment('a', { items: [90] }),
			segment('empty', { lead: 20, items: [] })
		]);
		expect(shape(sheets)).toEqual(['a 0-1', 'empty 0-0']);
	});

	it('plans a complete example: overview, Gantt, work plan, remarks', () => {
		const sheets = paginate(1000, [
			segment('header', { items: [100] }),
			segment('gantt', {
				lead: 20,
				repeat: 20,
				extra: 20,
				items: Array(60).fill(20),
				keep: 3,
				gap: 10
			}),
			segment('legend', { items: [30], gap: 10 }),
			segment('cards', { lead: 20, items: [150, 150], gap: 10 }),
			segment('stage-1', {
				lead: 40,
				repeat: 20,
				items: Array(25).fill(30),
				keep: 2,
				breakBefore: true
			}),
			segment('stage-2', { lead: 20, repeat: 20, items: Array(5).fill(30), keep: 2, gap: 16 }),
			segment('remarks', { lead: 20, items: [100, 100], gap: 16 })
		]);
		const fragments = sheets.map((s) => s.fragments.map((f) => f.id));
		// The Gantt does not fit on sheet 1 with the header: it continues on sheet 2.
		expect(fragments[0]).toEqual(['header', 'gantt']);
		expect(fragments[1]).toContain('gantt');
		// The work plan starts on a new sheet.
		const firstStage = sheets.findIndex((s) => s.fragments.some((f) => f.id === 'stage-1'));
		expect(sheets[firstStage].fragments[0].id).toBe('stage-1');
		expect(sheets[firstStage].fragments[0].first).toBe(true);
		// Remarks come after the last stage.
		const lastRemark = sheets.findLastIndex((s) => s.fragments.some((f) => f.id === 'remarks'));
		const lastStage = sheets.findLastIndex((s) => s.fragments.some((f) => f.id === 'stage-2'));
		expect(lastRemark).toBeGreaterThanOrEqual(lastStage);
		// Every item appears once.
		const count = (id: string) =>
			sheets
				.flatMap((s) => s.fragments)
				.filter((f) => f.id === id)
				.reduce((n, f) => n + f.to - f.from, 0);
		expect(count('gantt')).toBe(60);
		expect(count('stage-1')).toBe(25);
		expect(count('stage-2')).toBe(5);
	});

	it('never overfills a sheet except for an oversize block', () => {
		const items = [13, 27, 41, 9, 55, 33, 21, 47, 18, 62, 7, 29];
		const segments = [
			segment('a', { lead: 14, repeat: 8, extra: 6, items, keep: 2, gap: 5 }),
			segment('b', { lead: 14, repeat: 8, items, keep: 2, gap: 5, breakBefore: true })
		];
		const sheets = paginate(120, segments);
		for (const sheet of sheets) {
			let used = 0;
			for (const f of sheet.fragments) {
				const s = segments[f.segment];
				const head = f.first ? s.lead + s.repeat + s.extra : s.repeat;
				used += f.gap + head + items.slice(f.from, f.to).reduce((n, h) => n + h, 0);
			}
			expect(used).toBeLessThanOrEqual(120);
		}
	});
});
