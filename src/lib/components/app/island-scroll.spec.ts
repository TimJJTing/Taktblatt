import { describe, expect, it } from 'vitest';
import { nextIslandScroll, nextTimelineAutoCollapse } from './island-scroll.ts';

describe('island scroll size', () => {
	it('uses valid user distance and bounds the compact fraction', () => {
		const down = nextIslandScroll({ last: 100, compact: 0 }, 124, 500, true);
		expect(down).toEqual({ last: 124, compact: 0.5 });
		const full = nextIslandScroll(down, 200, 500, true);
		expect(full).toEqual({ last: 200, compact: 1 });
		expect(nextIslandScroll(full, 128, 500, true)).toEqual({ last: 128, compact: 0 });
	});

	it('ignores top overscroll and its rebound before counting real downward movement', () => {
		let state = { last: 0, compact: 0 };
		for (const top of [-30, -60, -20, 0]) {
			state = nextIslandScroll(state, top, 500, true);
			expect(state).toEqual({ last: 0, compact: 0 });
		}
		expect(nextIslandScroll(state, 24, 500, true)).toEqual({ last: 24, compact: 0.5 });
	});

	it('ignores bottom overscroll and its rebound at a partial compact size', () => {
		let state = { last: 500, compact: 0.5 };
		for (const top of [530, 560, 520, 500]) {
			state = nextIslandScroll(state, top, 500, true);
			expect(state).toEqual({ last: 500, compact: 0.5 });
		}
		expect(nextIslandScroll(state, 488, 500, true)).toEqual({ last: 488, compact: 0.25 });
	});

	it('clamps a previous raw offset before calculating a scroll delta', () => {
		expect(nextIslandScroll({ last: -40, compact: 0 }, 0, 500, true)).toEqual({
			last: 0,
			compact: 0
		});
		expect(nextIslandScroll({ last: 540, compact: 0.5 }, 500, 500, true)).toEqual({
			last: 500,
			compact: 0.5
		});
	});

	it('tracks app scrolls without resizing and uses the next user delta', () => {
		const state = nextIslandScroll({ last: 50, compact: 0.5 }, 300, 500, false);
		expect(state).toEqual({ last: 300, compact: 0.5 });
		expect(nextIslandScroll(state, 312, 500, true)).toEqual({ last: 312, compact: 0.75 });
	});

	it('returns to full size with no scroll range or at the top after user scroll', () => {
		for (const max of [0, -50]) {
			expect(nextIslandScroll({ last: 100, compact: 1 }, 100, max, false)).toEqual({
				last: 0,
				compact: 0
			});
		}
		expect(nextIslandScroll({ last: 10, compact: 1 }, 0, 500, true)).toEqual({
			last: 0,
			compact: 0
		});
	});
});

const state = { last: 0, down: 0, collapsed: false };
const input = {
	top: 48,
	max: 500,
	heightDelta: 270,
	user: true,
	keepOpen: false,
	userCollapsed: false,
	focusInside: false
};

describe('Timeline automatic collapse decision', () => {
	it('accumulates 48 user pixels and resets the count after upward movement', () => {
		let next = nextTimelineAutoCollapse(state, { ...input, top: 30 });
		expect(next).toEqual({ last: 30, down: 30, collapsed: false });
		next = nextTimelineAutoCollapse(next, { ...input, top: 20 });
		next = nextTimelineAutoCollapse(next, { ...input, top: 67 });
		expect(next.collapsed).toBe(false);
		expect(nextTimelineAutoCollapse(next, { ...input, top: 68 }).collapsed).toBe(true);
	});
	it('requires 48 pixels of remaining range after the collapse', () => {
		expect(nextTimelineAutoCollapse(state, { ...input, max: 365 }).collapsed).toBe(false);
		expect(nextTimelineAutoCollapse(state, { ...input, max: 366 }).collapsed).toBe(true);
	});
	it('rebases app and layout scrolls without counting their distance', () => {
		const next = nextTimelineAutoCollapse(state, { ...input, top: 200, user: false });
		expect(next).toEqual({ last: 200, down: 0, collapsed: false });
		expect(nextTimelineAutoCollapse(next, { ...input, top: 247, max: 1000 }).collapsed).toBe(false);
		expect(nextTimelineAutoCollapse(next, { ...input, top: 248, max: 1000 }).collapsed).toBe(true);
	});
	it('does not collapse with Keep open, a manual collapse, or keyboard focus in the Timeline content', () => {
		for (const flag of ['keepOpen', 'userCollapsed', 'focusInside'] as const) {
			expect(nextTimelineAutoCollapse(state, { ...input, [flag]: true }).collapsed).toBe(false);
		}
	});
	it('expands an automatic collapse only on user input at the top', () => {
		const collapsed = { last: 100, down: 48, collapsed: true };
		expect(nextTimelineAutoCollapse(collapsed, { ...input, top: 0, user: false }).collapsed).toBe(
			true
		);
		expect(nextTimelineAutoCollapse(collapsed, { ...input, top: 50 }).collapsed).toBe(true);
		expect(nextTimelineAutoCollapse(collapsed, { ...input, top: 0 }).collapsed).toBe(false);
		expect(
			nextTimelineAutoCollapse(collapsed, { ...input, top: 0, userCollapsed: true }).collapsed
		).toBe(true);
	});
	it('ignores overscroll and its rebound at either edge', () => {
		let next = state;
		for (const top of [-30, -60, -20, 0]) next = nextTimelineAutoCollapse(next, { ...input, top });
		expect(next).toEqual(state);
		let bottom = { last: 500, down: 0, collapsed: false };
		for (const top of [530, 560, 520, 500])
			bottom = nextTimelineAutoCollapse(bottom, { ...input, top });
		expect(bottom).toEqual({ last: 500, down: 0, collapsed: false });
	});
});
