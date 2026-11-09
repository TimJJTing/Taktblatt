/** Screen layout values shared by the workspace and Timeline. */
export const workspaceLayout = $state({ split: true });
/** Scroll progress of the floating tabs. This value is not persisted. */
export const workspaceTabs = $state({ compact: 0 });
export const pinnedTimeline = $state({ height: 0 });

/** Tabs always keep the Timeline at the top of the workspace. */
export function isTimelinePinned(viewer: { ganttPinned: boolean }): boolean {
	return !workspaceLayout.split || viewer.ganttPinned;
}
