# 16. Split workspace with pane scrolling

Status: Accepted (2026-11-09). Amends the workspace layout in ADR 1.

## Context

The workspace copied the printed sheet: one long page, with the footer fields at the end. On a wide screen, the user could not see the Timeline and the Work plan at the same time. The pinned Timeline covered the top of the Work plan. Sticky stage headers, label jumps and the focus offset had to add the pinned height.

## Decision

- The workspace has two groups: **Plan** (header with sheet footer fields, Timeline, Stage overview, Remarks) and **Work plan**.
- From a viewport width of 1024 px, the groups show side by side. A vertical separator changes the widths. Below 1024 px, a tab bar at the bottom shows one group at a time. The tabs are **Overview** (the Plan group without the Timeline) and **Work plan**.
- The page does not scroll. Each group scrolls in its own region below the app header. The app header has no section links.
- A pinned Timeline is sticky in the Plan pane in split view. With tabs, the Timeline is always pinned at the top, above both groups, and a chevron on its divider collapses it. It never covers the Work plan, so Work plan offsets use the top of their own scroll region.
- The split ratio, the selected tab and the collapsed Timeline are viewer state (ADR 4). The plan file does not change.
- The Preview, the sheets, pagination and print do not change.

## Alternatives considered

- **Two columns in one page scroll:** simpler, but a long Work plan moves the Plan column out of view.
- **Stacked page below 1024 px:** keeps the old page, but the Work plan is far down on a phone, and the pin would cover it again.
- **Optional pin with tabs:** an unpinned Timeline in the Plan tab hides the dates while the user edits the Work plan on a phone. A collapsible, always-pinned Timeline keeps the dates one tap away.
- **Tabs in the header:** the bottom edge is easier to reach with a thumb, and the header stays one row.
- **Section links in the header:** the split and the tabs show both groups directly. Links added a header row for little value.

## Consequences

- Code that used the window scroll (anchor offsets, label jumps, sticky offsets, focus offset) uses the scroll region of its group.
- Stage overview and Remarks use container widths for their columns.
- The pinned Timeline must not be created again when the layout or the pin changes, so the chart keeps its scroll position.
- A pure function calculates the island size from user scroll distance. It clamps both offsets to the scroll range, so overscroll and rebound do not count as scroll distance. The workspace shell tracks user input and applies reduced motion.
- The workspace checks the scroll range after a group resizes and after its finite animations finish. A FLIP can keep overflow until the animation ends, after the group's layout size has decreased.
