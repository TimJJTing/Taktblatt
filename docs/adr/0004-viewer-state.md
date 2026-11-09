# 4. Viewer state is not in the plan

Status: Accepted (2026-11-04)

## Context

Some settings are personal: the expanded tasks, the pinned Timeline section, its height, the collapsed Timeline legends, the UI language and the screen theme. If these are in the plan, an import from a different person changes your view.

## Decision

- These settings are **viewer state**. The app keeps the UI language under `taktblatt:locale` and the screen theme under `taktblatt:theme`. It keeps the other viewer settings (`expanded`, `ganttPinned`, `ganttHeight`, `timelineLegendsCollapsed`, `splitRatio`, `narrowTab`, `timelineCollapsed` and `narrowLegendsCollapsed`) under `taktblatt:ui`.
- The stored keys `ganttPinned` and `ganttHeight` keep their old names for compatibility, although they now apply to the whole Timeline section.
- `narrowLegendsCollapsed` is the legend state with tabs (below 1024 px). It defaults to `true`, because the always-pinned Timeline is short on a phone. `timelineLegendsCollapsed` is the legend state in split view. An explicit stored boolean for `timelineLegendsCollapsed` takes priority over the pin state. If this field is absent from valid older viewer data, the legends start collapsed when `ganttPinned` is `true`. They start expanded when `ganttPinned` is `false` or absent. With no stored data, the split view legends start expanded and the Timeline section starts unpinned in split view. Unreadable or invalid viewer data gives these defaults. After this initial default, pin and unpin do not change the legend setting.
- The existing ModeWatcher applies and saves the screen theme. The **Menu** in the app header uses its state and actions.
- The app starts on the client only. ModeWatcher cannot apply the saved theme before the first paint. A startup script in `src/app.html` does this. `src/hooks.server.ts` writes the script into the prerendered page shell from `src/lib/theme.ts`. Thus the storage key and the theme colors have one source.
- `src/app.html` has the only theme-color tag. The layout keeps it current. ModeWatcher does not get `themeColors`, because it would add a second tag after the start.
- The export does not include viewer state.
- The Gantt and the table share one expand state for each plan.
- Print uses the current expand state.
- Preview and print show all Timeline legends. The screen legend setting does not change them.
- Preview sheets and printed sheets stay light for each screen theme.

## Consequences

- Two persons can have different views of the same plan file.
- A printed plan depends on the expand state of the person who prints it.
