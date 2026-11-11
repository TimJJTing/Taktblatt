import { describe, expect, it } from 'vitest';
import { routePath } from './route-path.ts';
import type { Pt } from './types.ts';

describe('routePath', () => {
	it('resolves fractional lengths and pixel offsets at two widths (Appendix A case 14)', () => {
		const points: Pt[] = [
			{ x: { f: 0.25, px: 6 }, y: { f: 0.5, px: -4 } },
			{ x: { f: 0.75, px: -2 }, y: { f: 1, px: 8 } }
		];
		expect(routePath(points, { w: 200, h: 100 })).toBe('M 56 46 L 148 108');
		expect(routePath(points, { w: 400, h: 200 })).toBe('M 106 96 L 298 208');
	});

	it('drops consecutive resolved duplicates but preserves a later return to a point', () => {
		const a = { x: { f: 0, px: 50 }, y: { f: 0, px: 20 } };
		const b = { x: { f: 0, px: 80 }, y: { f: 0, px: 40 } };
		const points: Pt[] = [a, { x: { f: 0.5, px: 0 }, y: { f: 0.2, px: 0 } }, b, b, a, a];
		expect(routePath(points, { w: 100, h: 100 })).toBe('M 50 20 L 80 40 L 50 20');
	});
});
