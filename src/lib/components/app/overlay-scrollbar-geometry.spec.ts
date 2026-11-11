import { describe, expect, it } from 'vitest';
import { positionFromThumb, thumbMetrics } from './overlay-scrollbar-geometry.ts';

const geometry = { client: 200, scroll: 1000, track: 300, min: 24 };

describe('thumbMetrics', () => {
	it('shows the visible proportion at the start', () => {
		expect(thumbMetrics({ ...geometry, position: 0 })).toEqual({ size: 60, offset: 0 });
	});
	it('maps the middle of the content to the middle of the track', () => {
		expect(thumbMetrics({ ...geometry, position: 400 })).toEqual({ size: 60, offset: 120 });
	});
	it('aligns the thumb end with the track end', () => {
		expect(thumbMetrics({ ...geometry, position: 800 })).toEqual({ size: 60, offset: 240 });
	});
	it('keeps a minimum length and adjusts the remaining travel', () => {
		expect(thumbMetrics({ ...geometry, scroll: 10000, position: 4900 })).toEqual({
			size: 24,
			offset: 138
		});
	});
	it('omits the thumb when content fits', () => {
		expect(thumbMetrics({ ...geometry, scroll: 200, position: 0 })).toBeNull();
		expect(thumbMetrics({ ...geometry, scroll: 100, position: 0 })).toBeNull();
	});
	it('clamps positions outside the content', () => {
		expect(thumbMetrics({ ...geometry, position: -50 })).toEqual({ size: 60, offset: 0 });
		expect(thumbMetrics({ ...geometry, position: 900 })).toEqual({ size: 60, offset: 240 });
	});
});

describe('positionFromThumb', () => {
	it('round-trips scroll positions, including a minimum-length thumb', () => {
		for (const scroll of [1000, 10000]) {
			for (const position of [0, (scroll - geometry.client) * 0.37, scroll - geometry.client]) {
				const metrics = thumbMetrics({ ...geometry, scroll, position })!;
				expect(positionFromThumb({ ...geometry, scroll, ...metrics })).toBeCloseTo(position);
			}
		}
	});
	it('clamps a drag beyond either end of the track', () => {
		expect(positionFromThumb({ ...geometry, size: 60, offset: -30 })).toBe(0);
		expect(positionFromThumb({ ...geometry, size: 60, offset: 300 })).toBe(800);
	});
});
