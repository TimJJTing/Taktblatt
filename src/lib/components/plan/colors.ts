/** Screen colors of the palettes. They follow the light or dark theme through CSS variables. */
import { BAND_TINTS, STAGE_COLORS, type BandTint, type StageColor } from '#lib/domain/palette.js';
import { m } from '#lib/paraglide/messages.js';

/** Returns a CSS value that changes with the theme. */
export function stageColorVar(color: StageColor): string {
	return `light-dark(${STAGE_COLORS[color].light}, ${STAGE_COLORS[color].dark})`;
}

export function bandTintVar(color: BandTint): string {
	return `light-dark(${BAND_TINTS[color].light}, ${BAND_TINTS[color].dark})`;
}

const NAMES: Record<StageColor | BandTint, () => string> = {
	blue: m.color_blue,
	amber: m.color_amber,
	green: m.color_green,
	violet: m.color_violet,
	red: m.color_red,
	teal: m.color_teal,
	pink: m.color_pink,
	slate: m.color_slate,
	gray: m.color_gray
};

export function colorName(color: StageColor | BandTint): string {
	return NAMES[color]();
}
