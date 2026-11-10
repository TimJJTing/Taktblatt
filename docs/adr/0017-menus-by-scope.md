# 17. Menus by scope, bottom sheets on touch, and the narrow Timeline handle

Status: Accepted (2026-11-10). Amends the narrow Timeline in ADR 16 and the viewer state in ADR 4.

## Context

The app menu mixed scopes. **Print** and **Export this plan** act on the open plan. **Import** and **Export all plans** act on all plans. The plan switcher also held **Rename**, **Duplicate** and **Delete**, which act on the open plan. The Theme and Language groups used 9 of the 13 menu rows.

On a phone, the pinned Timeline used about 40 % of the screen. Its collapse button was a 28 px circle on the drag divider, so a tap and a drag competed. A collapsed Timeline showed nothing. The Legends button pushed the chart and changed the section height. A future Board view needs a stable frame around the chart.

## Decision

- **Plans** (the plan switcher) holds the actions on all plans: the plan list, **New plan**, **Import…** and **Back up all plans**.
- **This plan** (the Menu, **…**) holds the actions on the open plan: **Print…**, **Export this plan**, **Rename plan…**, **Duplicate plan** and **Delete plan…**. The app settings (Theme and Language) follow below a separator. Users look for settings in the **…** menu, not under a plan name.
- When the primary pointer is coarse, both menus open as bottom sheets. Otherwise they open as dropdown menus. Both presentations have the same items and order.
- With tabs, one handle on the bottom edge of the Timeline section collapses, expands and resizes it. A tap toggles. A drag resizes. A collapsed section is a 4 px stage edge with a today tick, above the same handle.
- With tabs, a scroll down by the user collapses the Timeline automatically, and a scroll up to the top expands it again. A **Keep timeline open** toggle turns this off. A collapse by the user stays.
- With tabs, the legends are one horizontally scrolling line of chips. There is no Legends button.

## Alternatives considered

- **One menu, reordered:** fewer changes, but the scopes stay mixed.
- **Settings at the end of Plans:** strict scopes, but users do not look for Theme under a plan name.
- **Bottom sheets by viewport width:** a tablet with a mouse would get a sheet. The pointer type is a better signal for touch.
- **shadcn-svelte Drawer (vaul-svelte) for the bottom sheets:** it gives drag to close and stop positions. But vaul-svelte is a prerelease (`1.0.0-next.7`) without updates since March 2025, and its own animations do not use `motionDuration`. The bottom sheets use the vendored Sheet component and a small drag-to-close of their own. They do not need stop positions.
- **Timeline toggle in the floating island:** easy to reach, but it separates the control from the section it changes.
- **Summary line in the collapsed strip:** more information, but taller and more text to localize.

## Consequences

- The viewer state adds `timelineKeepOpen` and drops `narrowLegendsCollapsed` (ADR 4). The plan file does not change.
- The menu paths in the README, the specification and the tests change.
- A Board view can reuse the Timeline section frame: the heading row, the handle, the Keep open toggle and the collapsed strip do not depend on the view.
