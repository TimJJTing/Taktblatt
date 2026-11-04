/** Paper colors. Print is always light, so the sheets use the light values and ignore the theme. */
import { BAND_TINTS, STAGE_COLORS, type BandTint, type StageColor } from '#lib/domain/palette.js';

export const stageHex = (color: StageColor): string => STAGE_COLORS[color].light;

/** A style string for the background of a band. */
export const bandStyle = (color: BandTint): string => `background: ${BAND_TINTS[color].light}`;
