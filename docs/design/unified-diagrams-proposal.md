# Unified diagram design proposal

Status: Accepted design (2026-11-16). Proposed 2026-11-14. The requesting developer closed the open decisions on 2026-11-16.

This document records the selected design, its study evidence and the agreed delivery.
The screenshots are static studies. They do not show implemented app behavior.
The lasting contract is [ADR 23](../adr/0023-unified-diagram-language.md). The binding behavior is in the [specification](../spec.md), sections [5.13](../spec/diagram-views.md#513-diagram-views), [5.14](../spec/route-map.md#514-route-map), [5.15](../spec/kanban.md#515-kanban), [7](../spec/print.md#7-preview-and-print) and [9.1](../spec/visual-language.md#91-shared-diagram-signs).
Where this document or a study differs from the specification, the specification applies.

## Problem and evidence

[PR #54](https://github.com/TimJJTing/Taktblatt/pull/54) adds Kanban. [PR #55](https://github.com/TimJJTing/Taktblatt/pull/55) adds Route map.
The views need consistent status meanings, family information and motion. Their compositions can differ to answer different questions.

- Route map must make workflow clear before family structure and status. PR #55's branches and transfer capsules establish that language. Its ordinary same-stage dependencies already use colored rails; thin exceptional links do not mean that every dependency has a duplicate overlay.
- The earlier unified study made task status too prominent in Route map. Square subtask signs also misread the requested transport-map reference. The selected design retains rounded status icons and gives Route map its own family notation.
- The PR #54 Kanban baseline used fixed `11rem` cards and `16rem` minimum columns. Normal split panes hid much of the board. Paper used fixed 34 mm cards.
- The PR #54 Kanban baseline showed leaves and ignored shared expansion. A parent selection could dim every visible card. The selected design uses parent summaries.
- Shared motion captures station geometry but moves whole task boxes. Cross-container flights are deferred. Hooks do not prove station continuity.

## Selected design

| Surface   | Primary question                    | Selected treatment                               |
| --------- | ----------------------------------- | ------------------------------------------------ |
| Gantt     | When does work happen?              | Compact duration lines and existing status signs |
| Route map | What follows what?                  | Continuous routes and attached subtask branches  |
| Kanban    | What needs attention?               | Four status columns across stage swimlanes       |
| Work plan | What are the complete task details? | Existing table and inline subtask expansion      |

Keep the white ground, Source Sans 3, quiet controls and established stage palette.
Dark screens use the matching dark surface. Printed sheets remain light.
Keep the app's rounded status icons for both tasks and subtasks: circle, half-filled circle, checked circle and slashed circle.
Route map, Kanban and Work plan use this icon as their status sign.
The Gantt stays as it is (decision U5): status-filled station dots, a ready light and no status icon in its labels. The Gantt study differs here and does not apply.
Do not introduce square subtask or status signs in diagrams, Work plan, Preview or paper.
Use the existing `TaskStatusIcon`: a 16 px viewport at 100% zoom, with the original Lucide geometry and stroke weight (`viewBox="0 0 24 24"`, stroke width 2).
Tasks and subtasks use the same icon size. Do not shrink status icons in dense layouts or keys. Every printed status icon is 12 px (decision U7).

### Route map

The information order is workflow, parent–subtask structure, then task status.
Retain PR #55's branches, transfer capsules, horizontal segments, 45° and 90° turns, and small curves at bends.
Bound curves by segment length, station clearance and neighboring routes.

**Main routes.** Use continuous solid rails in the stage color. Retain tasks without explicit dependencies on the suggested stage journey.
Read stations from top to bottom and left to right. Do not draw chevrons on colored main or subtask routes.
Do not use dashed rails for suggested order. Required and suggested same-stage order deliberately share the same rail treatment.
A colored rail alone does not prove a stored dependency.

**Subtask routes.** Expansion keeps the parent station on its main line. Draw a connected branch from that station with two parallel lines in the same stage color.
The gap uses the actual diagram background: the matching surface in dark theme and the paper surface in print.
Use the same round stations and transfer capsules for tasks and subtasks. Do not use ticks, square stations or detached family brackets.
The branch attachment identifies membership. It does not create a dependency from the parent to the first child.
Real child sequencing determines the child route; suggested order does not change dependency calculations.

**Stations and names.** Keep stations status-neutral, without a second circle inside the station.
Center the name and its rounded status icon directly below the station. Use one consistent placement rule.
Use PR #55's colored stage badge below the name at the first station of each stage route only.
In the example, these stations are Site survey (S1), Sowing (S2) and First harvest (S3).
Do not repeat the badge at other tasks or subtasks. Do not add readiness dots or halos.
Keep the dimming of done and canceled rail segments (decision U6).

**Spacing.** Keep parent and child stations close. Compact the whole network, including connections between stages.
Reserve the full name, status icon and any badge before routing links.
Move stations or routing corridors when labels need space. Do not solve collisions by putting names arbitrarily above, below or far from their stations.

**Dependencies.** Draw ordinary cross-stage dependencies as thin neutral paths with small open destination chevrons. The cue points to the waiting task.
Do not add ordinary thin same-stage or sibling overlays. Preserve stored dependencies for readiness, cycle detection and route focus.
Cyclic dependencies are the exception: retain red dotted warning paths, including cycles within one stage.

Determine ordinary cross-stage eligibility from stored source and target stage ids before mapping hidden tasks to visible parents.
Collapsed parents summarize both incoming and outgoing eligible hidden-child dependencies. Expansion restores exact endpoints.
Keep edge provenance, aggregate equal visible endpoint pairs and omit internal self-links.
Synthetic sequence links never enter readiness, cycle or dependency-focus calculations. This Route map rule does not change Gantt dependency visibility.

### Kanban, family information and other views

Use stage swimlanes for Kanban. Each stage starts with a badge, a clear name and a top-level task count.
The badge and its connected vertical stem form a “p” shape. Align their left edges exactly.
Put the name to the right of the stem. Reserve space for wrapped names and align status columns across stages.

Show each eligible top-level task or parent summary once, using the existing `boardColumn()` and effective parent state.
Expansion reveals family detail without moving the summary or increasing top-level column counts.
Use the same outlined chevron button as Work plan for Kanban family expansion and collapse. Do not show a browser-native disclosure triangle.
Keep the compact Gantt composition without change (decision U5).
Keep the existing parent expansion chevron from `GanttRow.svelte`: a separate button with an outlined chevron that points right when collapsed and down when expanded.
Keep the leaf spacer and shared expansion state with Work plan and Kanban.
Keep the existing row alignment and child indentation. Align the single-line Gantt label and its controls with the task line.
Gantt labels do not show family child-state counts below parent names.

Keep the same child-state breakdown across Route map and Kanban summaries. Adapt its placement to the diagram.
Ready and blocked counts are separate parts of Todo. Do not count a child twice.
Derive counts from the shared task index. Do not store them or introduce another parent-status calculation.
The approved Route map image establishes notation and label placement; it does not demonstrate the complete family-summary interaction.

Keep Work plan's existing design, as defined by `TaskRow.svelte` and `StageSection.svelte`.
Keep the separate chevron button for each parent. Expand children as indented table rows directly below the parent, with all columns aligned.
Preserve shared expansion state, keyboard navigation and focus behavior, readiness indicators, and table controls.
Do not replace the rows with a `details`/`summary` treatment or add family summaries below parent names.
Shared counts do not add family-summary lines to Gantt or Work plan. The Route map rule against readiness dots applies to Route map only.

Name Todo explicitly in status keys. Explain readiness separately. Use “In progress” consistently.
Keep “Plan views” as the section heading. Tie Gantt positions and Work plan dates to the same ISO-date fixture.

### Detail, motion and output

Print detail is independent of screen expansion. Keep the printed Work plan complete.
Use separate inputs for diagram detail and printed Work plan content.
One viewer preference, "Show subtasks in printed diagrams", applies to all selected diagrams. Its default is off (decision U2).

Use the visible station as the identity anchor during view changes. Use the label when no station is visible.
One shared coordinator must handle interrupted transitions, scrolling and focus by task id.
When a task has no focus target, focus its visible parent, else the active button of the view switch (decision U3).
Fade incompatible connectors without creating false intermediate dependencies. Decorative flight copies cannot take focus or input.
Use `motionDuration()` for all durations. Reduced motion changes views immediately. Preview and paper have no view-change animation.

## Design evidence

### Current Route map study

The approved 800 × 760 capture is a map-only desktop study of the example plan with Soil preparation expanded.
It shows connected double-line child routes, round stations, transfer capsules, aligned names and badges at stage-route starts.
The example contains no dependency cycle. The red dashed warning appears in the key only.

![Approved Route map study with double-line subtask routes and names below stations](../screenshots/unified-diagrams-route-map-proposal.png)

This capture does not validate the workspace shell, expansion controls, family summaries, mobile layout, dark theme, print or production routing.
It is the current Route map reference. The written rules define behavior beyond this scene.

### Composition and output studies

The following studies use the example fixture dated 2026-11-14. They show composition, counts and date positions.
The refreshed screenshots and PDFs use the original rounded status icons for tasks and subtasks, including Gantt and Work plan. The Gantt part of these studies is not the agreed design: the Gantt keeps its station-dot fills.
Status icons retain the size, geometry and stroke weight of the existing app icons.
The Work plan studies retain separate parent chevrons and aligned, indented child rows without added family summaries.
They remain static studies, not production validation.

![Kanban composition with stage swimlanes and rounded status icons](../screenshots/unified-diagrams-kanban-proposal.png)

![Gantt and Work plan composition with rounded task and subtask status icons](../screenshots/unified-diagrams-gantt-proposal.png)

The synthetic dense plan has 15 top-level tasks and eight subtasks in four stages. Its counts are six Blocked, five Todo, three In progress and one Done.
Desktop studies retain the stage matrix and split workspace. Phone studies stack status groups within each stage. The agreed design does not stack them: it uses one horizontal strip (decision U10).
They test content reflow, not the production pinned mobile shell. Implementation must preserve the established diagram and workspace tab behavior.

![Dense desktop composition with rounded status icons](../screenshots/unified-diagrams-dense-desktop-proposal.png)

![Phone-width stage groups with rounded status icons](../screenshots/unified-diagrams-dense-mobile-proposal.png)

The long-label screenshot uses Gantt with the example's dates and relations. It shows bounded Gantt labels and complete titles in Work plan.
The study's Route map tab embeds the approved regular-label desktop fixture. It does not test long-label route layout.

![Long-label Gantt study with complete titles in Work plan](../screenshots/unified-diagrams-label-stress-proposal.png)

The [A4 study](unified-diagrams-a4-study.pdf) and [Letter study](unified-diagrams-letter-study.pdf) each have four pages.
They show diagram overviews followed by all 11 Work plan rows, including Book a table and Make signs.
They embed the approved Route map fixture and use rounded status icons throughout.
They support the separate-detail and complete-Work-plan composition. Embedding the fixture does not validate production route layout, app Preview or physical print output.

![A4 composition proof with the approved Route map fixture](../screenshots/unified-diagrams-paper-a4-proposal.png)

![Letter composition proof with the approved Route map fixture](../screenshots/unified-diagrams-paper-letter-proposal.png)

Seven companion screenshots and both PDFs were refreshed. The approved Route map fixture is unchanged.
All studies use the existing rounded status icons. Screen icons use a 16 px viewport. Paper icons in the studies have a comparable physical size; the agreed paper size is 12 px.
The static study's Kanban and Work plan controls share expansion state. The example shows zero child rows when collapsed and two when expanded.
Both PDFs have four pages. All 11 fixture task names appear in the Work plan on page 4, which fits the A4 and Letter sheets.
The approved Route map fixture is embedded on page 2.
The approved route fixture does not establish dark-theme rendering, dense or narrow route layout, long-label routing, actual cycle routing, app Preview, production pagination, PWA or offline behavior.

## Agreed delivery

One integration change delivers the design (decision U1): [PR #62](https://github.com/TimJJTing/Taktblatt/pull/62) on the branch `feat/unified-diagrams`.
It supersedes [PR #54](https://github.com/TimJJTing/Taktblatt/pull/54) (Kanban) and [PR #55](https://github.com/TimJJTing/Taktblatt/pull/55) (Route map). Their histories are merged into the branch.
The motion and focus work of [PR #57](https://github.com/TimJJTing/Taktblatt/pull/57) lands in PR #62. PR #57 contained a placeholder, not a motion implementation.
The parallel delivery rules of PR #54 and PR #55 no longer apply. ADR 23 is Accepted. ADR 20 and ADR 22 became Accepted on 2026-11-17 after validation.

1. Update the specification and ADRs 19 to 23 before behavior changes. A separate agent verifies the implementation plan.
2. Write failing behavior tests for each slice before production code changes.
3. Implement the shared foundation once: family summary, print detail, shared expansion control and shared status key.
4. Adapt Route map and Kanban in separate reviewable commits. Retain PR #55's branching and bend machinery.
5. Complete station-based motion and the shared focus rules. Test real view pairs, including scroll and interrupted transitions.
6. Validate the workspace, the Preview dialog, printed sheets and the installed PWA, including offline use. Report any mode that was not validated.

The plan schema does not change (decision U8).

## Acceptance scenes for implementation

- The example has seven eligible top-level summaries. Expanding a parent does not change Kanban column counts. Ready and blocked children remain separate in the family summary.
- A fork and join retain PR #55's geometry. Main routes stay solid, including suggested sequence links. No ordinary colored rail has a chevron. Stations read from top to bottom and left to right.
- Expanding Soil preparation keeps its station and adds a connected double-line branch through Soil test and Add compost. It uses the same stage color, round stations or transfer capsules, and no ticks or squares.
- Child-route gaps use the actual background in light theme, dark theme, forced colors and print. No white seam appears on a dark surface.
- Every name and rounded status icon sits directly below its station. Only Site survey, Sowing and First harvest carry stage badges in this example. Check long names without moving labels to arbitrary sides.
- Compact family spacing and cross-stage routing. Reserved label bounds remain clear of paths, stations and neighboring labels.
- There is no ordinary thin overlay for Site survey → Order seeds or Soil test → Add compost. Directed neutral paths remain from Add compost and Order seeds to Sowing, and from Sowing to First harvest.
- A cycle within one stage and a cycle across stages retain red dotted warning paths. Do not hide cycles under the ordinary same-stage overlay rule. The approved screenshot does not cover this test.
- Same-stage required and suggested edges share a visual treatment but keep distinct provenance. Synthetic links do not change readiness, cycles or dependency focus. The map adds no readiness dots or halos.
- Collapsed families project eligible hidden-child dependencies in both directions. Expansion restores exact endpoints. Aggregated paths keep provenance and do not create internal self-links.
- Tasks and subtasks use the same original rounded notation and status meanings in Route map, Kanban, Work plan, Preview and paper. The Gantt keeps its station-dot fills. No view introduces square subtask or status signs.
- At 100% zoom, task and subtask status icons use the existing `TaskStatusIcon`: 16 px viewport, original Lucide geometry and stroke weight. Dense layouts and keys do not shrink them. Paper icons are 12 px. The status icons do not change Route map routing. The stations have one size, without terminus circles or capsule dots.
- Work plan retains the current parent chevron button and inline indented child rows, with aligned columns. Preserve shared expansion, keyboard navigation, focus, readiness indicators and table controls. Do not add a `details`/`summary` treatment or under-parent family summaries.
- Kanban names clear the connected stem. The badge and stem share a left edge. Family expansion uses Work plan's outlined chevron button, without a native disclosure triangle. Keep stage swimlanes, parent summaries and counts. Empty stages, long names and narrow panes remain readable.
- Gantt and Work plan use the same ISO dates. Site survey ends on Nov 7, after the November boundary. Show the exact plan range.
- Gantt parent labels keep the existing expansion chevron beside the ready-light slot and task name, without a status icon or family-summary lines. Expanding or collapsing a parent updates its child rows and the shared state in Work plan and Kanban.
- Every view pair supports interrupted and scrolled switching. Verify station continuity, focus, label-only tasks, hidden children, cleanup and immediate reduced-motion changes.
- Independent diagram detail works on A4 and Letter for Gantt, Route map and Kanban. It does not change screen expansion, hide printed Work plan children or mutate exported plans.
- Offline reload preserves viewer choices. Check offline edits and Preview. Validate an installed PWA when available and report any unavailable mode.

## Closed decisions and limits

The requesting developer made these decisions on 2026-11-16. U9 to U12 followed the plan verification, and U13 to U15 followed direction check 1 on the same day. They are final.

| Id  | Decision                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | One integration PR (#62, `feat/unified-diagrams`) supersedes #54 and #55. The motion and focus work of #57 lands in #62. ADR 23 becomes Accepted in #62.                                                                                                                |
| U2  | One viewer preference, "Show subtasks in printed diagrams", for all selected diagrams. Default: off. It is viewer state, outside plan files, backups and undo. The printed Work plan is always complete.                                                                |
| U3  | Missing focus target after a view switch, a task-dialog close or a collapse: focus the visible parent of the task. If there is none, focus the active button of the view switch.                                                                                        |
| U4  | An expanded active family shows and counts canceled subtasks in Route map and Kanban. Canceled top-level tasks stay hidden in Kanban.                                                                                                                                   |
| U5  | Leave the Gantt as it is: no status icon in the label, status-filled station dots on screen and paper, and the ready light. This departs from the Gantt study.                                                                                                          |
| U6  | Keep the dimming of done and canceled Route map rail segments.                                                                                                                                                                                                          |
| U7  | Every printed status icon is 12 px. Tasks and subtasks use the same size. The screen size stays 16 px.                                                                                                                                                                  |
| U8  | No plan schema change. `schemaVersion` stays.                                                                                                                                                                                                                           |
| U9  | Route map: a same-stage dependency between a top-level task and a subtask of another parent keeps the colored rail from the parent station in both expand states. Route focus and the accessible description show the exact subtask. No thin path.                      |
| U10 | Kanban widths: `6rem` stage heading column and `7.5rem` minimum status columns, so four columns fit a 640 px pane. Below that, one horizontal strip. No stacked status groups.                                                                                          |
| U11 | One flight rule for every view pair. No FLIP of real task boxes. A copy exists only when the outgoing or incoming cue intersects the stage box. Real cue elements with a copy are hidden during the flight. All connectors fade; connector retargeting is out of scope. |
| U12 | ADR 20 and ADR 22 became Accepted on 2026-11-17 after validation.                                                                                                                                                                                                       |
| U13 | Kanban family rows sit below the cards of the swimlane across all columns; the expansion control is in that row, not on the parent summary card.                                                                                                                        |
| U14 | Kanban card titles clamp to two lines on screen and paper. The full title stays in the accessible name, the task dialog and the printed Work plan. Card borders stay and stage badges are omitted from cards.                                                           |
| U15 | Status key readiness text is "Ready: all dependencies are finished. Blocked: a dependency is not finished." without an introductory sentence.                                                                                                                           |

The specification marks further supervisor defaults as "Proposed default". ADR 23 lists them.

The design does not add Kanban drag or zoom. Zoom remains optional future work.

The static studies do not validate dark-theme contrast, forced colors, actual cycles, long-label routing, motion, paper pagination or physical output.
The implementation needs production validation in the workspace, Preview, printed sheets and installed PWA, including offline use.
