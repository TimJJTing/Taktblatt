/**
 * Sizes of the printed sheets and of the printed Gantt, in CSS pixels.
 * The sheet size is in CSS units, so the sheet is the same size on all screens.
 */
import type { PaperSize } from '#lib/domain/schema.ts';
export {
	GANTT_LABEL_WIDTH,
	GANTT_MILESTONE_HEIGHT,
	GANTT_ROW_HEIGHT
} from '#lib/scene/paper-layout.ts';

/** The sheet size as CSS lengths. */
export const PAPER: Record<PaperSize, { width: string; height: string; css: string }> = {
	a4: { width: '210mm', height: '297mm', css: 'A4' },
	letter: { width: '8.5in', height: '11in', css: 'letter' }
};

/** The named page rule of landscape diagram sheets (ADR 20). */
export const LANDSCAPE_PAGE = 'taktblatt-landscape';

export const GANTT_MONTH_HEIGHT = 20;
/** The fixed paper tag width keeps its side independent of font and paint timing. */
export const GANTT_TODAY_TAG_WIDTH = 28;

/**
 * The paginator keeps this much free space at the bottom of the content area.
 * It covers rounding errors between the measurement and the print layout.
 */
export const SHEET_SAFETY = 2;
