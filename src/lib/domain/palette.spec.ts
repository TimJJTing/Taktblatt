import { describe, expect, it } from 'vitest';
import { THEME_COLORS } from '#lib/theme.ts';
import {
	BAND_TINT_KEYS,
	STAGE_BADGE_TEXT,
	STAGE_COLOR_KEYS,
	STAGE_COLORS,
	nextStageColor
} from './palette.ts';

/** Returns the WCAG relative luminance of a "#RRGGBB" color. */
function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(first: string, second: string): number {
	const a = luminance(first);
	const b = luminance(second);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('nextStageColor', () => {
	it('returns the first unused color', () => {
		expect(nextStageColor(['blue', 'amber'])).toBe('green');
	});

	it('returns the first color when no color is used', () => {
		expect(nextStageColor([])).toBe(STAGE_COLOR_KEYS[0]);
	});

	it('fills a gap before it uses a later color', () => {
		expect(nextStageColor(['amber', 'green'])).toBe('blue');
	});

	it('repeats the colors in order when all colors are used', () => {
		const all = [...STAGE_COLOR_KEYS];
		expect(nextStageColor(all)).toBe(STAGE_COLOR_KEYS[0]);
		expect(nextStageColor([...all, STAGE_COLOR_KEYS[0]])).toBe(STAGE_COLOR_KEYS[1]);
	});
});

describe('palette', () => {
	it('gives each light stage color a contrast of 4.5:1 or more against white', () => {
		for (const key of STAGE_COLOR_KEYS) {
			expect.soft(contrast(STAGE_COLORS[key].light, '#FFFFFF'), key).toBeGreaterThanOrEqual(4.5);
		}
	});

	it('gives each dark stage color a contrast of 6:1 or more against the dark ground', () => {
		for (const key of STAGE_COLOR_KEYS) {
			expect
				.soft(contrast(STAGE_COLORS[key].dark, THEME_COLORS.dark), key)
				.toBeGreaterThanOrEqual(6);
		}
	});

	for (const theme of ['light', 'dark'] as const) {
		it(`gives ${theme} badge text a contrast of 4.5:1 or more against every stage fill`, () => {
			for (const key of STAGE_COLOR_KEYS) {
				expect
					.soft(contrast(STAGE_BADGE_TEXT[theme], STAGE_COLORS[key][theme]), key)
					.toBeGreaterThanOrEqual(4.5);
			}
		});
	}

	it('starts the band tints with gray, the default band tint', () => {
		expect(BAND_TINT_KEYS[0]).toBe('gray');
	});
});
