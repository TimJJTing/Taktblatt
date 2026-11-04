import { prefersReducedMotion } from 'svelte/motion';

/** Return zero when the user prefers reduced motion. Otherwise, return the duration in milliseconds. */
export function motionDuration(ms: number): number {
	return prefersReducedMotion.current ? 0 : ms;
}
