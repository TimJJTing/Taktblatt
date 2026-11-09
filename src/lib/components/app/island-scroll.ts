export type IslandScrollState = { last: number; compact: number };

/** Counts only user scroll distance inside the group's scroll range. */
export function nextIslandScroll(
	state: IslandScrollState,
	scrollTop: number,
	max: number,
	input: boolean
): IslandScrollState {
	const limit = Math.max(0, max);
	const clamp = (top: number) => Math.min(limit, Math.max(0, top));
	const last = clamp(scrollTop);
	if (limit === 0) return { last, compact: 0 };
	if (!input) return { last, compact: state.compact };
	const delta = last - clamp(state.last);
	return {
		last,
		compact: last === 0 ? 0 : Math.min(1, Math.max(0, state.compact + delta / 48))
	};
}
