# 15. A parent's planned window grows with its subtasks

Status: Accepted (2026-11-08). Amends the parent date analysis in ADR 6.

## Context

Derived parent dates hide the dates that a user set before adding subtasks. A removal snapshot combines these hidden values only when the last subtask goes. This can change dates and owners at an unexpected time. The parent also needs a planned range that can include time outside its subtasks.

This decision replaces the earlier approach: derived parent dates and owners, with a snapshot on removal of the last subtask.

## Decision

- The stored parent `start` and `end` form its **planned window**. All views and date warnings use it. The window can be wider than the subtask range. When the window has both dates, it contains every subtask date. An open window stays open.
- After each plan edit, `expandParents(plan)` updates each parent that has subtasks. It uses the earliest parent or subtask start, the latest end, and the normalized owner union with parent owners first. Empty dates do not count. Canceled subtasks contribute dates and owners.
- The same function runs on load and import, including each plan in a backup. Childless tasks stay unchanged.
- Parent dates and owners are editable. The start must be no later than each subtask start. The end must be no earlier than each subtask end. When both parent dates are set, the range must contain every subtask date, including a start-only or end-only date. An open range can stay open if it meets the start and end limits. Owners used by subtasks have no remove button.
- Parent status stays derived. The function writes the squashed subtask status into the parent. Canceled subtasks do not affect status unless all are canceled.
- Removal of the last subtask leaves stored parent values unchanged. There is no removal snapshot.
- Expansion is part of the edit's undo step. The file shape and `schemaVersion` stay unchanged at version 1.

## Alternatives considered

- **Full synchronization:** always replace parent dates and owners with the subtask values. This removes a wider plan and prevents independent parent edits.
- **Snapshot merge:** show derived values while subtasks exist, then merge former subtasks into the parent when the last subtask goes. This hides stored values and makes removal change the visible range.

## Consequences

- A planned window never shrinks automatically. Removing or narrowing subtasks does not remove parent dates or owners. Users can reduce them by editing the parent within the remaining subtask limits. There is no fit-to-subtasks action.
- JSON stores values that also depend on subtasks. Commit, load and import must enforce the same expansion rule. Wider stored windows stay unchanged.
- Parent status remains derived and disabled in the editor. After the last subtask goes, the task keeps that status and the user can edit it.
- All views use one effective-value calculation. For a parent, it merges stored values with the subtasks. After expansion, this calculation equals the stored values.
