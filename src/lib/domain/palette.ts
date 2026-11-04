/**
 * Curated colors for stages and bands.
 * Each stage color has a 3:1 contrast or more against white (WCAG AA for graphics).
 * The `dark` value is for the screen in dark mode. Print always uses `light`.
 */

export const STAGE_COLORS = {
	blue: { light: '#2F5FBF', dark: '#6F98E8' },
	amber: { light: '#B7791F', dark: '#E2A84B' },
	green: { light: '#2E8B66', dark: '#5CC197' },
	violet: { light: '#6B4FBB', dark: '#A28BE6' },
	red: { light: '#C2453A', dark: '#EC7D72' },
	teal: { light: '#1F7A8C', dark: '#55B5C8' },
	pink: { light: '#B83D86', dark: '#E57CB9' },
	slate: { light: '#5B6475', dark: '#9AA3B5' }
} as const;

export type StageColor = keyof typeof STAGE_COLORS;
export const STAGE_COLOR_KEYS = Object.keys(STAGE_COLORS) as StageColor[];

export const BAND_TINTS = {
	gray: { light: '#EEF0F3', dark: 'rgb(255 255 255 / 0.07)' },
	blue: { light: '#E5EDFA', dark: 'rgb(111 152 232 / 0.14)' },
	amber: { light: '#FAF0DC', dark: 'rgb(226 168 75 / 0.14)' },
	green: { light: '#E2F2EA', dark: 'rgb(92 193 151 / 0.14)' }
} as const;

export type BandTint = keyof typeof BAND_TINTS;
export const BAND_TINT_KEYS = Object.keys(BAND_TINTS) as BandTint[];

/** Returns the first palette color that no stage uses. When all are used, the colors repeat. */
export function nextStageColor(used: readonly StageColor[]): StageColor {
	const free = STAGE_COLOR_KEYS.find((key) => !used.includes(key));
	return free ?? STAGE_COLOR_KEYS[used.length % STAGE_COLOR_KEYS.length];
}
