/**
 * Shared screen layout values of the app shell.
 * AppHeader and Timeline measure their heights. Other components read these values.
 * The root variables --app-header-h and --gantt-pinned-h have the same values.
 * The pinned Timeline height is zero when it is unpinned or removed.
 */
export const appHeader = $state({ height: 0 });
export const pinnedTimeline = $state({ height: 0 });
