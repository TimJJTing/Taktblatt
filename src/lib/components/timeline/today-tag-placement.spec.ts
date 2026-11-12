import { describe, expect, it } from 'vitest';
import { todayTagPlacement } from './today-tag-placement.ts';

describe('todayTagPlacement', () => {
	it('keeps a same-date milestone half-width clear on either side of the tag', () => {
		for (const chartWidth of [600, 420]) {
			const tagWidth = 28;
			const placement = todayTagPlacement(0.5, [0.5], chartWidth, tagWidth);
			expect(placement.side).toBe('left');
			expect(placement.offset + tagWidth).toBeLessThanOrEqual(-7);
			const nearLeft = todayTagPlacement(0.02, [0.02], chartWidth, tagWidth);
			expect(nearLeft.side).toBe('right');
			expect(nearLeft.offset).toBeGreaterThanOrEqual(7);
		}
	});

	it('places the tag on the right when no milestone overlaps it', () => {
		expect(todayTagPlacement(0.5, [], 128, 28)).toEqual({ side: 'right', offset: 4 });
		expect(todayTagPlacement(0.5, [0.25, 0.875], 128, 28)).toEqual({ side: 'right', offset: 4 });
	});

	it('flips left when a milestone on the right overlaps the tag', () => {
		expect(todayTagPlacement(0.5, [0.25, 0.625], 128, 28)).toEqual({ side: 'left', offset: -32 });
	});

	it('flips left when a milestone sign crosses the Today line', () => {
		expect(todayTagPlacement(0.5, [0.46875], 128, 28)).toEqual({ side: 'left', offset: -39 });
	});

	it('requires an overlap at both edges of the collision range', () => {
		expect(todayTagPlacement(0.5, [0.5 - 7 / 128], 128, 28)).toEqual({ side: 'right', offset: 4 });
		expect(todayTagPlacement(0.5, [0.5 - 6.5 / 128], 128, 28)).toEqual({
			side: 'left',
			offset: -41.5
		});
		expect(todayTagPlacement(0.5, [0.5 + 39 / 128], 128, 28)).toEqual({ side: 'right', offset: 4 });
		expect(todayTagPlacement(0.5, [0.5 + 38.5 / 128], 128, 28)).toEqual({
			side: 'left',
			offset: -32
		});
	});

	it('uses the chart width to convert date fractions to distances', () => {
		expect(todayTagPlacement(0.5, [0.625], 128, 28)).toEqual({ side: 'left', offset: -32 });
		expect(todayTagPlacement(0.5, [0.625], 512, 28)).toEqual({ side: 'right', offset: 4 });
	});

	it('uses the localized tag width for the collision range', () => {
		expect(todayTagPlacement(0.5, [0.75], 128, 12)).toEqual({ side: 'right', offset: 4 });
		expect(todayTagPlacement(0.5, [0.75], 128, 28)).toEqual({ side: 'left', offset: -32 });
	});

	it('keeps the tag on the right when the left edge blocks a collision flip', () => {
		expect(todayTagPlacement(0, [0.0625], 128, 28)).toEqual({ side: 'right', offset: 4 });
		expect(todayTagPlacement(0.125, [0.1875], 128, 28)).toEqual({
			side: 'right',
			offset: 4
		});
	});

	it('flips left when the right edge blocks the tag without a milestone', () => {
		expect(todayTagPlacement(1, [], 128, 28)).toEqual({ side: 'left', offset: -32 });
		expect(todayTagPlacement(0.875, [], 128, 28)).toEqual({ side: 'left', offset: -32 });
	});

	it('clamps the offset inside the date area when neither side fits', () => {
		for (const milestones of [[], [0.625]]) {
			const placement = todayTagPlacement(0.5, milestones, 40, 28);
			expect(placement).toEqual({ side: 'right', offset: -8 });
			expect(20 + placement.offset).toBeGreaterThanOrEqual(0);
			expect(20 + placement.offset + 28).toBeLessThanOrEqual(40);
		}
	});

	it('hides the tag when Today is outside the chart range', () => {
		expect(todayTagPlacement(null, [0.5], 128, 28)).toEqual({ side: 'hidden', offset: 0 });
		expect(todayTagPlacement(-0.01, [], 128, 28)).toEqual({ side: 'hidden', offset: 0 });
		expect(todayTagPlacement(1.01, [], 128, 28)).toEqual({ side: 'hidden', offset: 0 });
		expect(todayTagPlacement(0, [], 128, 28)).toEqual({ side: 'right', offset: 4 });
		expect(todayTagPlacement(1, [], 128, 28)).toEqual({ side: 'left', offset: -32 });
	});
});
