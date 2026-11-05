/**
 * Shared screen layout values of the app shell.
 * AppHeader measures its height. Other components read it, for example the pinned Timeline section.
 * The CSS variable --app-header-h on the root element has the same value.
 */
export const appHeader = $state({ height: 0 });
