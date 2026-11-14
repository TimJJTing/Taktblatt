# 23. One visual language for diagram views

Status: Proposed (2026-11-14). The user selected the visual direction. The app behavior is not implemented.

## Context

Gantt, Route map and Kanban show one plan. Their signs must keep the same meaning.
The diagram branches introduced conflicting status signs, family visibility and detail rules.
The user selected a combined design after a review of the three views.

## Proposed decision

### Shared signs and geometry

- Use a circle for a task and a square for a subtask. Use these signs in all diagrams, the Work plan and paper output.
- Fill shows effective status: hollow for Todo, half filled for In progress, solid for Done, and a diagonal slash for Canceled. Stage color shows stage membership.
- Keep the compact station, label, Gantt and Work plan treatment from the selected study. Show task names and essential state first. Reveal other details on expansion.
- Keep the Route map's branched stage workflows. Retain tasks that have no dependencies. Use 45° and 90° segments with small bend curves. Bound each curve by segment length, station clearance and neighboring paths. Use the same convention on screen and paper.
- Use stage swimlanes for Kanban. Each stage badge and its connected vertical stem form a “p” shape. The stem descends from the badge's left side. Put the dark stage name to the right of the stem. Reserve space for wrapped names. The color must not cover the text.

### Relations and families

- Colored branches show workflow sequence. Thin neutral paths show stored dependencies or their documented visible projection. Use a separate bracket or stem for family membership.
- Synthetic sequence links do not change readiness, cycle warnings or dependency route focus. Do not draw every inherited or effective pair as a stored dependency.
- Show actual dependency paths separately from colored rails, including same-stage dependencies. Reserve adjacent space so the rail cannot hide the dependency path.
- When a family is collapsed, project both incoming and outgoing dependencies of hidden subtasks to the visible parent. Keep the stored edge provenance. Aggregate equal visible endpoint pairs and omit internal self-links. Expansion restores the exact visible subtask endpoints.
- In Kanban, show each eligible top-level task or parent summary once. Use the existing `boardColumn()` and effective parent state. Expansion reveals a family detail strip. Children show their own states. Expansion does not move the summary or increase column counts.
- A collapsed parent shows a child-state breakdown. Derive the counts from the shared task index. Do not store counts or add another parent-status calculation.

### Detail, motion and output

- Print detail is independent of screen expansion. Keep the printed Work plan complete. Give diagram expansion and Work plan content separate inputs; one predicate must not hide both.
- Use the task's visible station as the position cue during a view change. Use its label when no station is visible. Labels and view-specific shapes form around that cue.
- One shared coordinator captures the current frame before retargeting interrupted motion. It accounts for scroll origins and retains focus by task id where a destination target exists. Define one shared fallback for missing targets before implementation.
- Fade incompatible connector layouts without showing false intermediate dependencies. Flight copies are decorative and cannot take focus or input.
- Route all durations through `motionDuration(ms)`. Reduced motion changes views at once. Preview and paper have no view-change animation.
- Viewer preferences stay outside plan files, backups and undo history. This proposal does not require a plan schema change.

## Documentation authority

The implementation must update the shared specification before changing behavior.
View-specific composition rules must not contradict shared sign or relation meanings.

When this decision is implemented, amend the conflicting sign and motion rules in [ADR 19](0019-scene-model.md) and [ADR 20](0020-diagram-views.md).
Also amend the Route map ADR in [PR #55](https://github.com/TimJJTing/Taktblatt/pull/55) and the Kanban ADR in [PR #54](https://github.com/TimJJTing/Taktblatt/pull/54).
This proposed record does not yet supersede their active behavior.

## Consequences

- One glyph and family-summary contract serves screen and paper renderers.
- Workflow, dependency and family relations keep distinct identities and drawing layers.
- Fixed-height Kanban cards and leaves-only board projection must be replaced.
- Tests must prove the shared contract across the real views. A static study or adapter hook does not prove motion, printing or offline behavior.
- Keep delivery steps in the [design proposal](../design/unified-diagrams-proposal.md), not in lasting architecture decisions.
