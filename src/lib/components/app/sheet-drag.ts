export const SHEET_MAX_LIFT = 12;

/** Follow a drag down. Limit a drag up with resistance. */
export function sheetDragOffset(dy: number): number {
	return dy >= 0 ? dy : Math.max(-SHEET_MAX_LIFT, dy * 0.2);
}

/** Measure recent movement. Include time spent still before release. */
export function sheetDragVelocity(
	samples: readonly { y: number; time: number }[],
	now: number
): number {
	const last = samples.at(-1);
	if (!last || now - last.time >= 100) return 0;
	let first = samples[0];
	for (const sample of samples) {
		if (sample.time > now - 100) break;
		first = sample;
	}
	const elapsed = now - first.time;
	return elapsed > 0 ? (last.y - first.y) / elapsed : 0;
}

/** Close after a long drag down or a downward flick. */
export function shouldCloseSheet(dy: number, height: number, velocity: number): boolean {
	return height > 0 && dy > 0 && (dy >= height * 0.25 || velocity >= 0.4);
}
