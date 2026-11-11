import { describe, expect, it } from 'vitest';
import { positionFromThumb, thumbMetrics } from './overlay-scrollbar-geometry.ts';

describe('scrollbar geometry at small sizes', () => {
	it('omits controls for a hidden scroll area', () => {
		expect(thumbMetrics({ client: 0, scroll: 1000, track: 100, min: 24, position: 0 })).toBeNull();
		expect(thumbMetrics({ client: 100, scroll: 1000, track: 0, min: 24, position: 0 })).toBeNull();
	});

	it('keeps a minimum thumb within a track shorter than the minimum', () => {
		const dimensions = { client: 100, scroll: 1000, track: 16 };
		const thumb = thumbMetrics({ ...dimensions, min: 24, position: 900 })!;
		expect(thumb).toEqual({ size: 16, offset: 0 });
		expect(positionFromThumb({ ...dimensions, ...thumb })).toBe(0);
	});
});
