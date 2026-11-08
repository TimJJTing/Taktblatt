# 16. Split workspace with pane scrolling

Status: Accepted (2026-11-09). Amends the workspace layout in ADR 1.

## Context

The workspace copied the printed sheet: one long page, with the footer fields at the end. On a wide screen, the user could not see the Timeline and the Work plan at the same time. The pinned Timeline covered the top of the Work plan. Sticky stage headers, label jumps and the focus offset had to add the pinned height.

## Decision

- The workspace has two groups: **Plan** (header with sheet footer fields, Timeline, Stage overview, Remarks) and **Work plan**.
- From a viewport width of 1024 px, the groups show side by side. A vertical separator changes the widths. Below 1024 px, two tabs show one group at a time.
- The page does not scroll. Each group scrolls in its own region below the app header. The app header has no section links.
- A pinned Timeline is sticky in the Plan pane in split view. With tabs, it is in a region above both groups. It never covers the Work plan, so Work plan offsets use the top of their own scroll region.
- The split ratio and the selected tab are viewer state (ADR 4). The plan file does not change.
- The Preview, the sheets, pagination and print do not change.

## Alternatives considered

- **Two columns in one page scroll:** simpler, but a long Work plan moves the Plan column out of view.
- **Stacked page below 1024 px:** keeps the old page, but the Work plan is far down on a phone, and the pin would cover it again.
- **Section links in the header:** the split and the tabs show both groups directly. Links added a header row for little value.

## Consequences

- Code that used the window scroll (anchor offsets, label jumps, sticky offsets, focus offset) uses the scroll region of its group.
- Stage overview and Remarks use container widths for their columns.
- The pinned Timeline must not be created again when the layout or the pin changes, so the chart keeps its scroll position.
