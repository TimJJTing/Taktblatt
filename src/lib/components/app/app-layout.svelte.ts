import { MediaQuery } from 'svelte/reactivity';

export const coarsePointer = new MediaQuery('(pointer: coarse)');

/** Screen layout values shared by the workspace and Timeline. */
export const workspaceLayout = $state({ split: true });
/** Scroll progress of the floating tabs. This value is not persisted. */
export const workspaceTabs = $state({ compact: 0 });
export const pinnedTimeline = $state({ height: 0 });

/** Tabs always keep the Timeline at the top of the workspace. */
export function isTimelinePinned(viewer: { ganttPinned: boolean }): boolean {
	return !workspaceLayout.split || viewer.ganttPinned;
}

/**
 * autoCollapsed is the temporary scroll collapse. changing marks the active height change.
 * revision resets the scroll count after a user collapse. These values are not persisted.
 */
export const timelineLayout = $state({ autoCollapsed: false, changing: false, revision: 0 });

let timelineChangeOwner: symbol | undefined;

/** Starts a height change. Only this run can release it. */
export function beginTimelineLayoutChange(): symbol {
	const token = Symbol();
	timelineChangeOwner = token;
	timelineLayout.changing = true;
	return token;
}

export function endTimelineLayoutChange(token: symbol): void {
	if (timelineChangeOwner !== token) return;
	timelineChangeOwner = undefined;
	timelineLayout.changing = false;
}
