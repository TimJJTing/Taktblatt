import { describe, expect, it } from 'vitest';
import { sheetDragOffset, sheetDragVelocity, shouldCloseSheet } from './sheet-drag.ts';

describe('sheet drag offset', () => {
	it('resists an upward drag before the upper limit', () => {
		expect(sheetDragOffset(-30)).toBe(-6);
	});

	it('caps upward travel at 12 pixels without limiting downward travel', () => {
		expect(sheetDragOffset(-60)).toBe(-12);
		expect(sheetDragOffset(-180)).toBe(-12);
		expect(sheetDragOffset(180)).toBe(180);
	});
});

describe('sheet drag close decision', () => {
	it('closes at a quarter height and returns just below it without a flick', () => {
		expect(shouldCloseSheet(99.9, 400, 0.1)).toBe(false);
		expect(shouldCloseSheet(100, 400, 0.1)).toBe(true);
	});

	it('closes a short downward flick at the velocity boundary', () => {
		expect(shouldCloseSheet(20, 400, 0.399)).toBe(false);
		expect(shouldCloseSheet(20, 400, 0.4)).toBe(true);
	});

	it('does not close on an upward or zero offset even after recent downward speed', () => {
		expect(shouldCloseSheet(-12, 400, 0.8)).toBe(false);
		expect(shouldCloseSheet(0, 400, 0.8)).toBe(false);
	});

	it('does not close when the sheet height is zero', () => {
		expect(shouldCloseSheet(20, 0, 0.8)).toBe(false);
	});
});

describe('sheet drag release velocity', () => {
	it('measures a short flick from its available samples', () => {
		expect(
			sheetDragVelocity(
				[
					{ y: 10, time: 0 },
					{ y: 30, time: 25 },
					{ y: 50, time: 50 }
				],
				50
			)
		).toBe(0.8);
	});

	it('uses the recent reversal rather than the speed of the entire gesture', () => {
		expect(
			sheetDragVelocity(
				[
					{ y: 0, time: 0 },
					{ y: 120, time: 200 },
					{ y: 140, time: 250 },
					{ y: 100, time: 300 }
				],
				300
			)
		).toBe(-0.2);
	});

	it('uses the last sample before the window when events do not align with its boundary', () => {
		expect(
			sheetDragVelocity(
				[
					{ y: 0, time: 0 },
					{ y: 20, time: 80 },
					{ y: 40, time: 160 },
					{ y: 80, time: 240 }
				],
				240
			)
		).toBe(0.375);
	});

	it('does not treat a flick followed by a long hold as a flick on release', () => {
		expect(
			sheetDragVelocity(
				[
					{ y: 0, time: 0 },
					{ y: 60, time: 50 }
				],
				151
			)
		).toBe(0);
	});

	it('returns zero when no positive sample interval is available', () => {
		expect(sheetDragVelocity([], 100)).toBe(0);
		expect(
			sheetDragVelocity(
				[
					{ y: 10, time: 100 },
					{ y: 20, time: 100 }
				],
				100
			)
		).toBe(0);
	});
});
