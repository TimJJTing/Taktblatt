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
/** The duration of the row and line motion, before motionDuration. */
export const ROW_MOTION_MS = 240;
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

/** An elbow path from the end of the predecessor to the start of the dependent. */
export function elbowPath(x0: number, y0: number, x1: number, y1: number): string {
	const out = x0 + 6;
	if (x1 >= out + 4) return `M ${x0} ${y0} H ${out} V ${y1} H ${x1}`;
	// The dependent starts before the predecessor ends: go around between the rows.
	const mid = (y0 + y1) / 2;
	return `M ${x0} ${y0} H ${out} V ${mid} H ${x1 - 6} V ${y1} H ${x1}`;
}

/** A clip path that gives a jagged edge to each clipped side of a bar. */
export function clipEdges(clipStart: boolean, clipEnd: boolean): string | undefined {
	if (!clipStart && !clipEnd) return undefined;
	const left = clipStart ? ['4px 100%', '0 75%', '4px 50%', '0 25%', '4px 0'] : ['0 100%', '0 0'];
	const right = clipEnd
		? [
				'calc(100% - 4px) 0',
				'100% 25%',
				'calc(100% - 4px) 50%',
				'100% 75%',
				'calc(100% - 4px) 100%'
			]
		: ['100% 0', '100% 100%'];
	return `polygon(${[...left, ...right].join(', ')})`;
}

/** The limits of the pinned height in pixels, for a viewport height. */
export function heightLimits(viewport: number, split = true): { min: number; max: number } {
	const max = (split ? GANTT_HEIGHT.max : 0.4) * viewport;
	return { min: Math.min(GANTT_HEIGHT.minPx, max), max };
}

/** The pinned height in pixels, clamped to the limits. */
export function pinnedHeight(fraction: number, viewport: number, split = true): number {
	const { min, max } = heightLimits(viewport, split);
	return Math.min(max, Math.max(min, fraction * viewport));
}
