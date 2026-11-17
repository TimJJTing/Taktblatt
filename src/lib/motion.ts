import { prefersReducedMotion } from 'svelte/motion';

/** The duration of geometry changes inside a diagram, before motionDuration. */
export const GEOMETRY_MOTION_MS = 240;
/** The duration of a switch between diagrams, before motionDuration. */
export const VIEW_MOTION_MS = 300;
/** The extra wait after a timed transition before its end handling runs: about two frames. */
export const MOTION_SETTLE_MS = 32;

/** Return zero when the user prefers reduced motion. Otherwise, return the duration in milliseconds. */
export function motionDuration(ms: number): number {
	return prefersReducedMotion.current ? 0 : ms;
}
