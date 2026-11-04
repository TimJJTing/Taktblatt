# 4. Viewer state is not in the plan

Status: Accepted (2026-11-04)

## Context

Some settings are personal: the expanded tasks, the pinned Gantt, its height, the UI language. If these are in the plan, an import from a different person changes your view.

## Decision

- These settings are **viewer state**. The app keeps the UI language under `taktblatt:locale`. It keeps the other viewer settings (`expanded`, `ganttPinned` and `ganttHeight`) under `taktblatt:ui`.
- The export does not include viewer state.
- The Gantt and the table share one expand state for each plan.
- Print uses the current expand state.

## Consequences

- Two persons can have different views of the same plan file.
- A printed plan depends on the expand state of the person who prints it.
