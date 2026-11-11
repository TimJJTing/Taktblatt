/** Screen colors of the palettes. They follow the light or dark theme through CSS variables. */
import { BAND_TINTS, STAGE_COLORS, type BandTint, type StageColor } from '#lib/domain/palette.ts';
import { m } from '#lib/paraglide/messages.js';
import type { TaskStatus } from '#lib/domain/schema.ts';

/** Select one opaque color level for a task sign. */
export function markColorLevel(
	status: TaskStatus,
	part: 'line' | 'dot' | 'connector',
	offRoute = false,
	still = false
): number {
	if (offRoute && !still) return 30;
	return status === 'canceled' || (status === 'done' && part !== 'dot') ? 40 : 100;
}

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

/** The stage color on paper. Print is always light, so it uses the light value and ignores the theme. */
export function stagePaperColor(color: StageColor): string {
	return STAGE_COLORS[color].light;
}

/** The band tint on paper. */
export function bandPaperTint(color: BandTint): string {
	return BAND_TINTS[color].light;
}

/** The fill of a subtask bar for a stage color (a screen or paper color). */
export function subtaskFill(color: string, ground: string): string {
	return `color-mix(in oklab, ${color} 55%, ${ground})`;
}

/** The fill of a band for a band tint (a screen or paper color). */
export function bandFill(tint: string): string {
	return `color-mix(in oklab, ${tint} 60%, transparent)`;
}
