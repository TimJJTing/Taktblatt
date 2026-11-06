import { describe, expect, it } from 'vitest';
import { clipEdges, elbowPath, heightLimits, pinnedHeight, rowCenterY } from './gantt-layout.ts';

describe('gantt-layout', () => {
	it('calculates the vertical center of a row', () => {
		expect(rowCenterY(0)).toBe(42);
		expect(rowCenterY(2, 20, 30)).toBe(95);
	});

	it('builds a 4-segment elbow path when the dependent starts at least 10px after the predecessor ends', () => {
		expect(elbowPath(10, 20, 20, 50)).toBe('M 10 20 H 16 V 50 H 20');
		expect(elbowPath(10, 20, 40, 50)).toBe('M 10 20 H 16 V 50 H 40');
	});

	it('builds a 6-segment detour path when the dependent starts before x0 + 10', () => {
		expect(elbowPath(10, 20, 19, 50)).toBe('M 10 20 H 16 V 35 H 13 V 50 H 19');
		expect(elbowPath(30, 20, 10, 60)).toBe('M 30 20 H 36 V 40 H 4 V 60 H 10');
	});

	it('returns undefined or a jagged polygon clip-path for each combination of clipped edges', () => {
		expect(clipEdges(false, false)).toBeUndefined();
		expect(clipEdges(true, false)).toBe(
			'polygon(4px 100%, 0 75%, 4px 50%, 0 25%, 4px 0, 100% 0, 100% 100%)'
		);
		expect(clipEdges(false, true)).toBe(
			'polygon(0 100%, 0 0, calc(100% - 4px) 0, 100% 25%, calc(100% - 4px) 50%, 100% 75%, calc(100% - 4px) 100%)'
		);
		expect(clipEdges(true, true)).toBe(
			'polygon(4px 100%, 0 75%, 4px 50%, 0 25%, 4px 0, calc(100% - 4px) 0, 100% 25%, calc(100% - 4px) 50%, 100% 75%, calc(100% - 4px) 100%)'
		);
	});

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
});
