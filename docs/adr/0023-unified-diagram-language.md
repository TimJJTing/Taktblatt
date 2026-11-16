# 23. One visual language for diagram views

Status: Accepted (2026-11-16). Proposed 2026-11-14. The user selected the visual direction and made the decisions in "Reconciliation" below.

Amends [ADR 4](0004-viewer-state.md), [ADR 19](0019-scene-model.md), [ADR 20](0020-diagram-views.md), [ADR 21](0021-route-map.md) and [ADR 22](0022-kanban.md). The [specification](../spec.md) sections 5.13, 5.14, 5.15, 7 and 9.1 define the behavior.

## Context

Gantt, Route map and Kanban show one plan. Status meanings, family counts and task identity must stay consistent.
Each view can use a composition that serves its main question.

Route map answers “What follows what?” Its priority is workflow, then family structure, then status.
PR #55's route geometry and transfer capsules support that purpose.
The design uses the existing rounded status icons and gives Route map a distinct family-route treatment.

## Decision

### Shared status and composition

- Keep the original rounded status icons for tasks and subtasks: circle for Todo, half-filled circle for In progress, checked circle for Done and slashed circle for Canceled. Use this icon as the status sign in Route map, Kanban and Work plan, in Preview and on paper. Do not introduce square subtask or status signs in any view.
- The Gantt stays as it is. Its status sign is the status-filled station dot (`StationDot` through `TaskMark`), on screen and paper. A Gantt label has no status icon. The Gantt keeps its ready light. This is a deliberate departure from the Gantt study.
- Use the existing `TaskStatusIcon`: a 16 px viewport at 100% zoom, original Lucide geometry (`viewBox="0 0 24 24"`) and stroke width 2. Tasks and subtasks use the same size. Do not shrink icons in dense layouts or keys. Every printed status icon is 12 px, for tasks and subtasks, in Work plan, Route map, Kanban and keys.
- Keep status separate from Route map station geometry. Do not place status fills or another circle inside those stations. Do not add readiness dots or halos. Keep the dimming of done and canceled rail segments. This dimming is the one status cue in Route map rail paint.
- Use “In progress” consistently. Name Todo explicitly in status keys. Explain readiness separately: "Ready: all dependencies are finished. Blocked: a dependency is not finished." Route map and Kanban share one status key component.
- Keep the established stage palette, Source Sans 3 and quiet controls. Printed sheets remain light; dark screens use the matching dark surface.
- Keep the compact Gantt composition and the existing Work plan design. Keep Gantt's existing parent expansion chevron, aligned leaf spacer, row alignment, child indentation and shared expansion state. Gantt labels do not include family child-state counts below parent names. Tie date positions and displayed dates to the same ISO-date data.
- One shared expansion control component serves Work plan, Gantt, Route map and Kanban. It keeps the form of the Work plan chevron button.
- Work plan keeps its separate parent chevron button and expands children as indented table rows directly below the parent. Keep columns aligned. Preserve shared expansion state, keyboard navigation and focus behavior, readiness indicators, and table controls. Do not replace the rows with a `details`/`summary` treatment or add family summaries below parent names. The Route map rule against readiness dots does not change Work plan.
- Use stage swimlanes for Kanban. Each stage has a badge, a clear name and a top-level task count. Its badge and connected vertical stem form a “p” shape. Align their left edges exactly, put the name to the right of the stem, and reserve space for wrapping. Align status columns across stages.

### Route map geometry and labels

- Preserve PR #55's branching, horizontal segments, 45° and 90° turns, and small curves at bends. Bound curves by segment length, station clearance and neighboring paths.
- Main routes use continuous solid rails in the stage color. Retain tasks without explicit dependencies through suggested sequence links. Read stations from top to bottom and left to right. Do not use dashed suggested rails or chevrons on colored main or subtask routes.
- Same-stage required and suggested order intentionally share the same rail treatment. A colored rail alone does not prove a stored dependency. Keep their provenance distinct in the model.
- Expansion keeps the parent station on its main line and draws a connected child branch from it. Use two parallel lines in the same stage color. Do not use a detached family bracket or stem.
- The gap between child-route lines uses the actual diagram background. Match the dark surface in dark theme, the paper surface in print and the appropriate system surface in forced colors.
- Use the same round stations and transfer capsules for tasks and subtasks, in one size on screen and one size on paper. Do not use subtask ticks, square stations or nested station circles. Do not draw a terminus circle around a station or dots inside a capsule. The double-line route identifies the family level.
- The parent-to-child attachment shows membership. It does not create a dependency. Real child sequencing determines the child route; suggested order does not alter dependency calculations.
- Center each name and its rounded status icon directly below the station. Keep the placement consistent. Put PR #55's colored stage badge below the name at the first station of each stage route only. Do not repeat it at other tasks or subtasks.
- Keep parent-child spacing and cross-stage corridors compact. Reserve complete label bounds, including badges, before routing. Move geometry to avoid collisions; do not move names arbitrarily above, below or far from their stations.

### Dependencies and cycles

- Draw ordinary stored dependencies between different stages as thin neutral paths. A small open destination chevron points to the waiting task. Keep the cue clear of the station. This does not change Gantt routing.
- Do not draw ordinary thin overlays between tasks in the same stage, including sibling subtasks. This includes same-stage edges that come from projection and legacy external-child edges. The colored rails show them. When one task of such a dependency is a subtask of another parent, the rail runs from the parent station in both expand states. Route focus and the accessible description show the exact subtask. Keep those dependencies in readiness, cycle and route-focus calculations.
- Cycles are an explicit exception. Preserve red dotted warning paths (`1 4` dashes) for cyclic dependencies, including cycles within one stage. Do not suppress them under the ordinary same-stage overlay rule.
- Determine ordinary cross-stage eligibility from stored source and target stage ids before mapping hidden tasks to visible parents. Reserve space so colored rails cannot hide those paths.
- When a family is collapsed, project incoming and outgoing eligible hidden-child dependencies to the visible parent. Keep stored edge provenance, aggregate equal visible endpoint pairs and omit internal self-links. Expansion restores the exact endpoints of cross-stage and cycle paths.
- Synthetic sequence links and membership attachments do not create stored dependencies or change readiness, cycle warnings or dependency route focus. Do not draw every inherited or effective pair as a stored edge.

### Family information

- In Kanban, show each eligible top-level task or parent summary once. Use the existing `boardColumn()` and effective parent state. Expansion reveals family detail without moving the summary or increasing column counts. Use the same outlined chevron button as Work plan to expand or collapse a family. Do not show a browser-native disclosure triangle. Keep stage swimlanes and family summaries.
- Keep the same child-state breakdown in Route map and Kanban summaries. Its placement can differ by diagram. Ready and blocked counts are separate parts of Todo; do not count a child twice. Count canceled children as canceled. An expanded active family shows its canceled children. A canceled top-level task stays hidden in Kanban.
- Derive family counts from the shared task index. Do not store counts or add another parent-status calculation. Gantt and Work plan do not show family-summary lines below parent names.

### Detail, motion and output

- Print detail is independent of screen expansion. One viewer preference, "Show subtasks in printed diagrams", applies to every selected diagram: Gantt, Route map and Kanban. Its default is off. Keep the printed Work plan complete: it shows all subtasks with any preference and any screen expansion. Give diagram detail and Work plan content separate inputs; one predicate must not hide both.
- Reserve space for long labels and let geometry respond to their bounds. At narrow widths, retain readable names and stage grouping. Do not treat a desktop artboard as a responsive layout.
- Use the visible station as the position cue during a view change. Use the label when no station is visible. Labels and view-specific shapes form around that cue.
- One shared coordinator captures the current frame before retargeting interrupted motion. It accounts for scroll origins and retains focus by task id where a destination target exists.
- When a task has no focus target after a view switch, a task-dialog close or a collapse, focus the visible parent of the task. If there is none, focus the active button of the view switch. Views do not keep a fallback of their own.
- Carry the cues in one flight layer for every view pair. Do not move real task boxes. A copy exists only when the outgoing or incoming cue intersects the stage box. Hide the real cue elements that have a copy during the flight.
- Fade all connectors without showing false intermediate dependencies. Connector retargeting is out of scope. Flight copies are decorative and cannot take focus or input.
- Route all durations through `motionDuration()`. Reduced motion changes views immediately. Preview and paper have no view-change animation.
- Viewer preferences stay outside plan files, backups and undo history. This decision does not change the plan schema. `schemaVersion` stays.

## Reconciliation (2026-11-16)

The requesting developer made these decisions. Rows 9–12 followed the plan verification, and the last three rows followed direction check 1 on 2026-11-16. Where a decision differs from the proposal of 2026-11-14 or from a study, the decision applies.

| Decision                     | Result                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delivery                     | One integration change (PR #62, `feat/unified-diagrams`) supersedes PR #54 (Kanban) and PR #55 (Route map). The motion and focus work of PR #57 lands in the same change. The parallel delivery rules of ADR 20 and ADR 22 no longer apply.                                                                       |
| Print detail                 | One viewer preference for all selected diagrams, default off. The printed Work plan is always complete.                                                                                                                                                                                                           |
| Missing focus target         | The visible parent of the task, then the active button of the view switch.                                                                                                                                                                                                                                        |
| Canceled subtasks            | An expanded active family shows and counts them in Route map and Kanban. Canceled top-level tasks stay hidden in Kanban.                                                                                                                                                                                          |
| Gantt                        | No change. No status icon in the Gantt label. Status-filled station dots and the ready light stay. The Gantt study and the earlier text of this record showed status icons in Gantt labels; that part does not apply.                                                                                             |
| Route map rail dimming       | Keep the dimming of done and canceled rail segments from PR #55.                                                                                                                                                                                                                                                  |
| Paper status icon size       | 12 px for every printed status icon. The screen size stays 16 px.                                                                                                                                                                                                                                                 |
| Plan schema                  | No change.                                                                                                                                                                                                                                                                                                        |
| Same-stage rail to a subtask | Route map: a same-stage dependency between a top-level task and a subtask of another parent keeps the colored rail from the parent station in both expand states. The top-level route does not change shape on expansion. Route focus and the accessible description show the exact subtask. No thin path.        |
| Kanban widths                | A `6rem` stage heading column and `7.5rem` minimum status columns, so four columns fit a 640 px pane. Below that, one horizontal strip. No stacked status groups.                                                                                                                                                 |
| View-switch motion           | One flight rule for every view pair. Remove the FLIP of real task boxes. A copy exists only when the outgoing or incoming cue intersects the stage box. Real cue elements with a copy are hidden during the flight and restored on finish and cancel. All connectors fade; connector retargeting is out of scope. |
| ADR 20 and ADR 22            | They become Accepted in the last slice of PR #62, after validation. They stay Proposed (amended) until then.                                                                                                                                                                                                      |
| Kanban family row            | Family rows sit below the cards of their swimlane across all columns. The expansion control sits in the family row, not on the parent summary card.                                                                                                                                                               |
| Kanban card titles and frame | Clamp card titles to two lines on screen and paper. Keep the full title in the accessible name, the task dialog and the printed Work plan. Keep the card border and omit stage badges from cards.                                                                                                                 |
| Status key readiness text    | Use "Ready: all dependencies are finished. Blocked: a dependency is not finished." without an introductory sentence.                                                                                                                                                                                              |

The project supervisor set these defaults, which follow this record and the studies. The specification marks them as "Proposed default" where it records them. The requesting developer can change them without a new record.

- Route map has no terminus circle and no capsule dock dots.
- Route map stations use one size on screen and one size on paper.
- Same-stage projected edges and legacy external-child edges have no thin overlay.
- One shared expansion control component, with the `task_expand` and `task_collapse` names.
- One pure family-summary function in `src/lib/domain/derive.ts`. Route map and Kanban receive the shared task index.
- Kanban cards use `TaskStatusIcon`, keep owners and dates, and have no fixed height. The icon holder is the motion cue and route-touch target. A collapsed parent summary uses the union of its child routes.
- One shared status key component in Route map and Kanban, on screen and paper. The Gantt keeps its existing legends.
- The station is the motion cue and the label is the fallback. The Gantt cue is the first station dot of the task mark.
- After the task dialog closes, focus returns to the same Kanban card when it moved. When the card is gone, the missing-target rule applies.
- A focused card or station that disappears after an edit, an undo or a tab sync uses the same missing-target rule. Kanban has no next-card or previous-card fallback.
- Kanban cards keep the ready light.
- The family summary text uses `joinList()`.
- The print detail checkbox shows also when only Gantt is registered.
- Empty stages show in Route map as a placeholder station and on paper Kanban as an empty swimlane.

This record amends earlier records as follows:

- [ADR 4](0004-viewer-state.md): the Work plan, Gantt, Route map and Kanban share the expand state. Print does not use the screen expand state; the `printSubtasks` preference sets diagram detail.
- [ADR 19](0019-scene-model.md): the status-fill rule of `StationDot` applies to the Gantt only. The flight layer serves every animated view switch.
- [ADR 20](0020-diagram-views.md): the stage implements the flight layer and the shared focus rules. The missing-target rule replaces "focus the selected switch choice". The slice ownership rules are history.
- [ADR 21](0021-route-map.md): the notation above replaces termini, ready lights, per-endpoint stage badges, single-stroke family branches and thin same-stage exceptions.
- [ADR 22](0022-kanban.md): stage swimlanes with parent summaries replace the leaf board, the flat layout and the fixed card height.

## Evidence

The current Route map image is a map-only desktop notation study. It does not prove interaction, family-summary behavior, dark theme, dense or narrow route layout, long-label routing, actual cycle routing or production print output.
The cycle sign appears only in its key (the static key study drew it dashed; the specification uses a dotted warning stroke).
The refreshed Gantt, Kanban, dense and narrow screenshots use the same rounded task and subtask status icons as Work plan. The status icons in the Gantt study do not apply; the Gantt stays as it is.
Status icons retain the size, geometry and stroke weight of the existing app icons.
Work plan studies preserve separate parent chevrons and aligned, indented child rows without added family summaries. They do not validate production keyboard or focus behavior.
The long-label screenshot shows Gantt. Its Route map tab embeds the approved regular-label fixture and does not validate long-label route layout.
The four-page A4 and Letter PDFs embed that fixture and use rounded status icons throughout. They show paper composition, not implemented Preview or production route layout.
These static studies do not validate app behavior, motion, PWA or offline operation.

## Consequences

- Shared status meanings serve all views. The Gantt shows them with station-dot fills; the other views show them with the status icon. Route map and Kanban summaries use consistent family counts. Gantt and Work plan keep compact labels without family-summary lines. Route-specific geometry can differ without changing those meanings.
- Route map retains its transport-map identity. Attached double-line rails identify subtasks while station shapes stay consistent.
- Suggested and required same-stage order are not visually distinguished. Stored dependencies still govern readiness, cycles and route focus.
- Fixed-height Kanban cards and leaves-only board projection must be replaced.
- Tests must prove the shared contract across real views. A static study or adapter hook does not prove motion, printing or offline behavior.
- The print model, the Preview toolbar and the viewer state gain the print detail preference.
- Keep acceptance scenes and study evidence in the [design proposal](../design/unified-diagrams-proposal.md). The specification is the binding contract.
