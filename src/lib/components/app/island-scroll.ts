const SCROLL_THRESHOLD = 48;

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
		compact: last === 0 ? 0 : Math.min(1, Math.max(0, state.compact + delta / SCROLL_THRESHOLD))
	};
}

export type TimelineAutoCollapseState = { last: number; down: number; collapsed: boolean };
export type TimelineAutoCollapseInput = {
	top: number;
	max: number;
	heightDelta: number;
	user: boolean;
	keepOpen: boolean;
	userCollapsed: boolean;
	/** Keyboard focus is inside the Timeline content. */
	focusInside: boolean;
};

/** Counts user movement and checks the scroll range after the height change. */
export function nextTimelineAutoCollapse(
	state: TimelineAutoCollapseState,
	input: TimelineAutoCollapseInput
): TimelineAutoCollapseState {
	const last = Math.min(Math.max(0, input.max), Math.max(0, input.top));
	if (!input.user) return { last, down: 0, collapsed: state.collapsed };
	const delta = last - Math.min(Math.max(0, input.max), Math.max(0, state.last));
	if (input.userCollapsed) return { last, down: 0, collapsed: state.collapsed };
	if (state.collapsed) return { last, down: 0, collapsed: last !== 0 };
	if (input.keepOpen || input.focusInside) return { last, down: 0, collapsed: false };
	const down = delta < 0 ? 0 : state.down + delta;
	const room = Math.max(0, input.max - input.heightDelta) - last;
	return { last, down, collapsed: down >= SCROLL_THRESHOLD && room >= SCROLL_THRESHOLD };
}
