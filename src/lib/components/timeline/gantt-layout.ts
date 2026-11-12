/**
 * Screen layout of the Gantt: sizes (CSS lengths and pixels) and small drawing helpers.
 * The geometry (fractions of the width) comes from #lib/domain/gantt.
 */
import { GANTT_HEIGHT } from '#lib/state/viewer.svelte.ts';

/**
 * The width of the label column. It is a CSS variable, so a phone can use a narrower column.
 * The classes on the Gantt root set the value. Use the Tailwind classes `w-(--gantt-label-width)`
 * and `left-(--gantt-label-width)` where possible. Use this constant in a `calc()` only.
 */
export const LABEL_WIDTH = 'var(--gantt-label-width)';
/** The minimum width of the timeline area. On a phone, the Gantt scrolls horizontally. */
export const TIMELINE_MIN_WIDTH = 640;
export const HEADER_HEIGHT = 28;
export const MILESTONE_ROW_HEIGHT = 28;
export const ROW_HEIGHT = 28;
export const CHART_BORDER_HEIGHT = 2;
export const MIN_CHART_HEIGHT =
	HEADER_HEIGHT + MILESTONE_ROW_HEIGHT + 3 * ROW_HEIGHT + CHART_BORDER_HEIGHT;
export const TIMELINE_HANDLE_RESERVE = 12;
export const STAGE_EDGE_HEIGHT = 4;
export const TIMELINE_HANDLE_HEIGHT = 20;
export const COLLAPSED_TIMELINE_HEIGHT = STAGE_EDGE_HEIGHT + TIMELINE_HANDLE_HEIGHT;
/**
 * The space above the heading in the expanded tabs section. It is the same as --pane-padding with
 * tabs (WorkspaceShell.svelte). Change both together.
 */
export const TABS_TIMELINE_TOP_SPACE = 16;
/** The duration of section height, control and legend motion, before motionDuration. */
export const TIMELINE_MOTION_MS = 180;

/**
 * The vertical center of a task row. `top` is the height above the first row (the milestone row)
 * and `rowHeight` is the height of a row. The defaults are the screen values.
 */
export function rowCenterY(
	row: number,
	top: number = MILESTONE_ROW_HEIGHT,
	rowHeight: number = ROW_HEIGHT
): number {
	return top + row * rowHeight + rowHeight / 2;
}

/**
 * The limits of the pinned height in pixels, for a viewport height. With tabs, the expanded section
 * adds TABS_TIMELINE_TOP_SPACE to this height.
 */
export function heightLimits(viewport: number, split = true): { min: number; max: number } {
	const max = (split ? GANTT_HEIGHT.max : GANTT_HEIGHT.narrowMax) * viewport;
	return { min: Math.min(GANTT_HEIGHT.minPx, max), max };
}

/** The pinned height in pixels, clamped to the limits. See heightLimits for the tabs top space. */
export function pinnedHeight(fraction: number, viewport: number, split = true): number {
	const { min, max } = heightLimits(viewport, split);
	return Math.min(max, Math.max(min, fraction * viewport));
}
