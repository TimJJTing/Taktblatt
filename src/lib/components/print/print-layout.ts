/**
 * Sizes of the printed sheets and of the printed Gantt, in CSS pixels.
 * The sheet size is in CSS units, so the sheet is the same size on all screens.
 */
import type { PaperSize } from '#lib/domain/schema.ts';

/** The sheet size as CSS lengths. */
export const PAPER: Record<PaperSize, { width: string; height: string; css: string }> = {
	a4: { width: '210mm', height: '297mm', css: 'A4' },
	letter: { width: '8.5in', height: '11in', css: 'letter' }
};

/** The width of the label column of the printed Gantt. */
export const GANTT_LABEL_WIDTH = 150;
export const GANTT_ROW_HEIGHT = 18;
export const GANTT_MONTH_HEIGHT = 20;
export const GANTT_MILESTONE_HEIGHT = 22;

/**
 * The paginator keeps this much free space at the bottom of the content area.
 * It covers rounding errors between the measurement and the print layout.
 */
export const SHEET_SAFETY = 2;
