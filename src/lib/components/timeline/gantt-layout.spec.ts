import { describe, expect, it } from 'vitest';
import { heightLimits, pinnedHeight } from './gantt-layout.ts';

describe('gantt-layout', () => {
	it('clamps heightLimits and pinnedHeight when the viewport is smaller than minPx / max', () => {
		// At viewport = 200, max = 0.5 * 200 = 100 < minPx (120), so min clamps to 100.
		expect(heightLimits(200)).toEqual({ min: 100, max: 100 });
		expect(pinnedHeight(0.1, 200)).toBe(100);
		expect(pinnedHeight(0.8, 200)).toBe(100);

		// Normal viewport (1000): min = 120, max = 500.
		expect(heightLimits(1000)).toEqual({ min: 120, max: 500 });
		expect(pinnedHeight(0.05, 1000)).toBe(120);
		expect(pinnedHeight(0.35, 1000)).toBe(350);
		expect(pinnedHeight(0.8, 1000)).toBe(500);
	});

	it('limits the pinned Timeline to 40 percent of the viewport with tabs', () => {
		expect(heightLimits(1000, false)).toEqual({ min: 120, max: 400 });
		expect(heightLimits(200, false)).toEqual({ min: 80, max: 80 });
		expect(pinnedHeight(0.5, 1000, false)).toBe(400);
	});
});
