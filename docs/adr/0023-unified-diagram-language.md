# 23. One visual language for diagram views

Status: Proposed (2026-11-14). The user selected the visual direction. The app behavior is not implemented.

Updated: 2026-11-16.

## Context

Gantt, Route map and Kanban show one plan. Status meanings, family counts and task identity must stay consistent.
Each view can use a composition that serves its main question.

Route map answers “What follows what?” Its priority is workflow, then family structure, then status.
PR #55's route geometry and transfer capsules support that purpose.
The design uses the existing rounded status icons and gives Route map a distinct family-route treatment.

## Proposed decision

### Shared status and composition

- Keep the original rounded status icons for tasks and subtasks: circle for Todo, half-filled circle for In progress, checked circle for Done and slashed circle for Canceled. Use the same rounded task and subtask notation in Gantt, Route map, Kanban, Work plan, Preview and paper. Do not introduce square subtask or status signs in any view.
- Use the existing `TaskStatusIcon`: a 16 px viewport at 100% zoom, original Lucide geometry (`viewBox="0 0 24 24"`) and stroke width 2. Tasks and subtasks use the same size. Do not shrink icons in dense layouts or keys. Preserve a comparable physical size on paper.
- Keep status separate from Route map station geometry. Do not place status fills or another circle inside those stations. Do not add readiness dots or halos.
- Use “In progress” consistently. Name Todo explicitly in status keys. Explain readiness separately: Todo work can be ready or blocked by dependencies.
- Keep the established stage palette, Source Sans 3 and quiet controls. Printed sheets remain light; dark screens use the matching dark surface.
- Keep the compact Gantt composition and the existing Work plan design, with the original rounded status icons. Keep Gantt's existing parent expansion chevron, aligned leaf spacer, row alignment, child indentation and shared expansion state. Gantt labels do not include family child-state counts below parent names. Tie date positions and displayed dates to the same ISO-date data.
- Work plan keeps its separate parent chevron button and expands children as indented table rows directly below the parent. Keep columns aligned. Preserve shared expansion state, keyboard navigation and focus behavior, readiness indicators, and table controls. Do not replace the rows with a `details`/`summary` treatment or add family summaries below parent names. The Route map rule against readiness dots does not change Work plan.
- Use stage swimlanes for Kanban. Each stage has a badge, a clear name and a top-level task count. Its badge and connected vertical stem form a “p” shape. Align their left edges exactly, put the name to the right of the stem, and reserve space for wrapping. Align status columns across stages.

### Route map geometry and labels

- Preserve PR #55's branching, horizontal segments, 45° and 90° turns, and small curves at bends. Bound curves by segment length, station clearance and neighboring paths.
- Main routes use continuous solid rails in the stage color. Retain tasks without explicit dependencies through suggested sequence links. Read stations from top to bottom and left to right. Do not use dashed suggested rails or chevrons on colored main or subtask routes.
- Same-stage required and suggested order intentionally share the same rail treatment. A colored rail alone does not prove a stored dependency. Keep their provenance distinct in the model.
- Expansion keeps the parent station on its main line and draws a connected child branch from it. Use two parallel lines in the same stage color. Do not use a detached family bracket or stem.
- The gap between child-route lines uses the actual diagram background. Match the dark surface in dark theme, the paper surface in print and the appropriate system surface in forced colors.
- Use the same round stations and transfer capsules for tasks and subtasks. Do not use subtask ticks, square stations or nested station circles. The double-line route identifies the family level.
- The parent-to-child attachment shows membership. It does not create a dependency. Real child sequencing determines the child route; suggested order does not alter dependency calculations.
- Center each name and its rounded status icon directly below the station. Keep the placement consistent. Put PR #55's colored stage badge below the name at the first station of each stage route only. Do not repeat it at other tasks or subtasks.
- Keep parent-child spacing and cross-stage corridors compact. Reserve complete label bounds, including badges, before routing. Move geometry to avoid collisions; do not move names arbitrarily above, below or far from their stations.

### Dependencies and cycles

- Draw ordinary stored dependencies between different stages as thin neutral paths. A small open destination chevron points to the waiting task. Keep the cue clear of the station. This does not change Gantt routing.
- Do not draw ordinary thin overlays between tasks in the same stage, including sibling subtasks. Keep those dependencies in readiness, cycle and route-focus calculations.
- Cycles are an explicit exception. Preserve red dashed warning paths for cyclic dependencies, including cycles within one stage. Do not suppress them under the ordinary same-stage overlay rule.
- Determine ordinary cross-stage eligibility from stored source and target stage ids before mapping hidden tasks to visible parents. Reserve space so colored rails cannot hide those paths.
- When a family is collapsed, project incoming and outgoing eligible hidden-child dependencies to the visible parent. Keep stored edge provenance, aggregate equal visible endpoint pairs and omit internal self-links. Expansion restores exact endpoints.
- Synthetic sequence links and membership attachments do not create stored dependencies or change readiness, cycle warnings or dependency route focus. Do not draw every inherited or effective pair as a stored edge.

### Family information

- In Kanban, show each eligible top-level task or parent summary once. Use the existing `boardColumn()` and effective parent state. Expansion reveals family detail without moving the summary or increasing column counts. Use the same outlined chevron button as Work plan to expand or collapse a family. Do not show a browser-native disclosure triangle. Keep stage swimlanes and family summaries.
- Keep the same child-state breakdown in Route map and Kanban summaries. Its placement can differ by diagram. Ready and blocked counts are separate parts of Todo; do not count a child twice.
- Derive family counts from the shared task index. Do not store counts or add another parent-status calculation. Gantt and Work plan do not show family-summary lines below parent names.

### Detail, motion and output

- Print detail is independent of screen expansion. Keep the printed Work plan complete. Give diagram detail and Work plan content separate inputs; one predicate must not hide both.
- Reserve space for long labels and let geometry respond to their bounds. At narrow widths, retain readable names and stage grouping. Do not treat a desktop artboard as a responsive layout.
- Use the visible station as the position cue during a view change. Use the label when no station is visible. Labels and view-specific shapes form around that cue.
- One shared coordinator captures the current frame before retargeting interrupted motion. It accounts for scroll origins and retains focus by task id where a destination target exists. Define a shared fallback for missing targets before implementation.
- Fade incompatible connector layouts without showing false intermediate dependencies. Flight copies are decorative and cannot take focus or input.
- Route all durations through `motionDuration()`. Reduced motion changes views immediately. Preview and paper have no view-change animation.
- Viewer preferences stay outside plan files, backups and undo history. This proposal does not require a plan schema change.

## Documentation authority and evidence

This decision remains proposed. It does not silently replace active behavior or the shared specification.
Before implementation, amend shared status-fill and motion rules in [ADR 19](0019-scene-model.md), [ADR 20](0020-diagram-views.md) and the specification.
Reconcile the Route map ADR in [PR #55](https://github.com/TimJJTing/Taktblatt/pull/55) and the Kanban ADR in [PR #54](https://github.com/TimJJTing/Taktblatt/pull/54) in the same implementation change.
Route map's separate status icon is an explicit proposed exception to earlier shared station-fill rules.

The current Route map image is a map-only desktop notation study. It does not prove interaction, family-summary behavior, dark theme, dense or narrow route layout, long-label routing, actual cycle routing or production print output.
The red dashed cycle sign appears only in its key.
The refreshed Gantt, Kanban, dense and narrow screenshots use the same rounded task and subtask status icons as Work plan.
Status icons retain the size, geometry and stroke weight of the existing app icons.
Work plan studies preserve separate parent chevrons and aligned, indented child rows without added family summaries. They do not validate production keyboard or focus behavior.
The long-label screenshot shows Gantt. Its Route map tab embeds the approved regular-label fixture and does not validate long-label route layout.
The four-page A4 and Letter PDFs embed that fixture and use rounded status icons throughout. They show paper composition, not implemented Preview or production route layout.
These static studies do not validate app behavior, motion, PWA or offline operation.

## Consequences

- Shared status meanings serve all views. Route map and Kanban summaries use consistent family counts. Gantt and Work plan keep compact labels without family-summary lines. Route-specific geometry can differ without changing those meanings.
- Route map retains its transport-map identity. Attached double-line rails identify subtasks while station shapes stay consistent.
- Suggested and required same-stage order are not visually distinguished. Stored dependencies still govern readiness, cycles and route focus.
- Fixed-height Kanban cards and leaves-only board projection must be replaced.
- Tests must prove the shared contract across real views. A static study or adapter hook does not prove motion, printing or offline behavior.
- Keep delivery steps, acceptance scenes and open implementation details in the [design proposal](../design/unified-diagrams-proposal.md).
