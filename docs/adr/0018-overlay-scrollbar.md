# 18. Overlay scrollbar

Status: Accepted (2026-11-11).

## Context

The workspace has many scroll areas: the panes, the tab group, the Timeline body, the Gantt chart, the legend rail, the narrow stage tables, the Preview and the dialogs. Native scrollbars look and work differently on each operating system and in each browser:

- macOS and iOS show thin overlay scrollbars that hide at rest. A system setting can make them always visible.
- Windows and most Linux desktops show classic scrollbars. They take layout space and stay visible.
- Auto-hide is a system setting. A page cannot turn it on.

CSS cannot give one result in all browsers. `scrollbar-width` and `scrollbar-color` change the thickness and the color, but not the visibility at rest, the fade or the hover thickness. `::-webkit-scrollbar` works only in Chromium and WebKit, and it cannot fade a thumb after a scroll stops. Both keep the layout space of a classic scrollbar. So the gutter, the colors and the visibility change between platforms.

The workspace shell also detected a native scrollbar drag by the pointer position (`event.clientX >= bounds.left + content.clientWidth`). The floating island and the automatic collapse of the Timeline section use this signal (ADR 16, ADR 17). This check depends on a native scrollbar that takes layout space.

## Decision

- The app hides the native scrollbar in each listed scroll area (`scrollbar-width: none` and `::-webkit-scrollbar { display: none }`). The native scroll behavior stays: wheel, touch, keyboard, focus and scroll by the app.
- A Svelte action of our own, `overlayScrollbar`, draws thumbs as overlay elements. A pure module calculates the geometry: thumb size and position, and the scroll position from a drag. Unit tests cover this module. The action only connects the DOM.
- **Layer placement:** the action adds one layer for each scroll area. The layer is an absolutely positioned sibling in the stacking context of the area, in a positioned host element. It does not change the layout. The layer uses z-index 35. It shows above the sticky headers and the pinned Timeline section. It shows below the app header, the floating island (z-index 40), menus and dialogs. The island is at the bottom center. The thumbs are at the right and bottom edges. In dialogs and bottom sheets, the host is inside the dialog content, so a thumb press is not an outside press. The layer is hidden from assistive technology and from print.
- **Events to the shell:** the action dispatches bubbling `overlayscrollstart` and `overlayscrollend` events on the scroll area when a thumb drag starts and ends. The workspace shell uses these events as its user-scroll signal for the island and the automatic collapse. The pointer-position check goes away.
- The edge strip was removed because it blocked controls at the right edge. Only a visible thumb can take presses, in the area of the thumb. A control below a visible thumb cannot take a press at that point. This is the same as a native overlay scrollbar.
- The bottom sheet does not start a drag to close from a press on the layer.
- Specification section 5.12 gives the behavior: visibility, sizes, colors, drag, motion and print.

## Alternatives considered

- **Native scrollbar styling (`scrollbar-width`, `scrollbar-color`, `::-webkit-scrollbar`):** no JavaScript, but the result changes with the browser and the system setting. It cannot hide the thumb at rest in the same way everywhere, and classic scrollbars keep their layout space.
- **OverlayScrollbars library (about 20 kB):** complete and tested in many browsers. But it adds a dependency of about 20 kB for a small part of its features. It wraps the scroll element in its own elements, which changes the DOM of the panes, the sticky offsets and the vendored components. Its transitions do not go through `motionDuration(ms)`. The app needs only thumbs, drag and one event to the shell.
- **Keep native scrollbars:** no work, but the workspace looks different on each platform. Classic scrollbars take space in the narrow panes and the Gantt.

## Consequences

- The app owns the thumb code, its tests and its accessibility. The thumbs are hidden from assistive technology. The scroll areas keep their native keyboard access.
- Headless Playwright hides native scrollbars, and CI runs Chromium only. Automated tests check the computed `scrollbar-width: none` and the overlay thumbs, not a measured scrollbar width. Parity in Firefox and Safari, and on macOS, Windows, Linux, iOS and Android, is a manual check.
- Some scroll areas are vendored components, for example the dropdown menu content. Each edit to a vendored file must state its reason. The select list keeps its own scroll buttons.
- Nested scroll areas, such as the Timeline body and the Gantt chart, need a rule that selects which thumbs show.
- A new scroll area must use the action, or the native scrollbar shows there again.
