import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { THEME_COLORS } from './theme.ts';

const css = readFileSync(new URL('../routes/layout.css', import.meta.url), 'utf8');

/** Converts an OKLCH token to relative luminance in the sRGB gamut. */
function luminance(theme: ':root' | '.dark', token: string): number {
	const block = css.match(theme === ':root' ? /:root\s*\{([^}]+)\}/ : /\.dark\s*\{([^}]+)\}/)?.[1];
	const value = block?.match(new RegExp(String.raw`--${token}:\s*oklch\(([^)]+)\)`))?.[1];
	if (!value) throw new Error(`Missing ${theme} --${token} OKLCH token`);
	const [lightness, chroma, hue] = value.trim().split(/\s+/).map(Number);
	if (![lightness, chroma, hue].every(Number.isFinite)) {
		throw new Error(`Invalid ${theme} --${token} OKLCH token`);
	}
	const a = chroma * Math.cos((hue * Math.PI) / 180);
	const b = chroma * Math.sin((hue * Math.PI) / 180);
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
	// These are linear sRGB channels. Do not apply gamma decoding a second time.
	const channels = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	].map((channel) => Math.min(1, Math.max(0, channel)));
	return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

/** Returns the WCAG relative luminance of a "#RRGGBB" color. */
function hexLuminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
		return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

it('the dark background matches the browser theme color within 0.002 relative luminance', () => {
	expect(
		Math.abs(luminance('.dark', 'background') - hexLuminance(THEME_COLORS.dark))
	).toBeLessThanOrEqual(0.002);
});

for (const [theme, name] of [
	[':root', 'light'],
	['.dark', 'dark']
] as const) {
	for (const [token, minimum] of [
		['muted-foreground', 4.5],
		['foreground', 7]
	] as const) {
		it(`the ${name} ${token} has at least ${minimum} to 1 contrast against the background`, () => {
			const foreground = luminance(theme, token);
			const background = luminance(theme, 'background');
			expect(
				(Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
			).toBeGreaterThanOrEqual(minimum);
		});
	}

	it(`the ${name} focus ring has at least 3 to 1 contrast against the background`, () => {
		const ring = luminance(theme, 'ring');
		const background = luminance(theme, 'background');
		expect(
			(Math.max(ring, background) + 0.05) / (Math.min(ring, background) + 0.05)
		).toBeGreaterThanOrEqual(3);
	});
}

it('the light focus ring has at least 3 to 1 contrast against the hover background', () => {
	const ring = luminance(':root', 'ring');
	const background = luminance(':root', 'accent');
	expect(
		(Math.max(ring, background) + 0.05) / (Math.min(ring, background) + 0.05)
	).toBeGreaterThanOrEqual(3);
});
