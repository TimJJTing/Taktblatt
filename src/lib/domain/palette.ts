/**
 * Curated colors for stages and bands.
 * Each light stage color has a contrast of 4.5:1 or more against white.
 * Each dark stage color has a contrast of 6:1 or more against the dark ground.
 * The `dark` value is for the screen in dark mode. Print always uses `light`.
 */

import { THEME_COLORS } from '#lib/theme-colors.ts';

export const STAGE_BADGE_TEXT = { light: '#FFFFFF', dark: THEME_COLORS.dark } as const;

export const STAGE_COLORS = {
	blue: { light: '#2456C9', dark: '#6E97EC' },
	amber: { light: '#A0690A', dark: '#E6A940' },
	green: { light: '#1B835A', dark: '#4FC495' },
	violet: { light: '#6A4BC4', dark: '#A68CF0' },
	red: { light: '#C8352D', dark: '#F07A70' },
	teal: { light: '#167A8A', dark: '#4DBCCB' },
	pink: { light: '#B4337E', dark: '#EB7FBE' },
	slate: { light: '#5A6478', dark: '#9BA5B8' }
} as const;

export type StageColor = keyof typeof STAGE_COLORS;
export const STAGE_COLOR_KEYS = Object.keys(STAGE_COLORS) as StageColor[];

export const BAND_TINTS = {
	gray: { light: '#EEF0F3', dark: 'rgb(255 255 255 / 0.07)' },
	blue: { light: '#E5EDFA', dark: 'rgb(110 151 236 / 0.14)' },
	amber: { light: '#FAF0DC', dark: 'rgb(230 169 64 / 0.14)' },
	green: { light: '#E2F2EA', dark: 'rgb(79 196 149 / 0.14)' }
} as const;

export type BandTint = keyof typeof BAND_TINTS;
export const BAND_TINT_KEYS = Object.keys(BAND_TINTS) as BandTint[];

/** Returns the first palette color that no stage uses. When all are used, the colors repeat. */
export function nextStageColor(used: readonly StageColor[]): StageColor {
	const free = STAGE_COLOR_KEYS.find((key) => !used.includes(key));
	return free ?? STAGE_COLOR_KEYS[used.length % STAGE_COLOR_KEYS.length];
}
