# 14. Subtasks depend only on siblings

Status: Accepted (2026-11-08). Amends ADR 6.

## Context

Dependencies on external work belong on the task. Subtasks need dependencies on siblings to order work under the same parent. Inheriting subtask dependencies on the parent makes these two scopes difficult to distinguish.

## Decision

- In the editor, a subtask can depend only on siblings with the same parent. A task can depend on other tasks and on subtasks of other tasks.
- A subtask inherits the own dependencies of its parent. The effective dependencies of a task, with or without subtasks, are its own dependencies.
- Legacy subtask dependencies outside the parent stay valid. They count for that subtask and show a scope warning. The file shape and `schemaVersion` stay unchanged.
- A move removes dependencies that break the sibling rule. It removes own dependencies outside the new parent and incoming dependencies from remaining old siblings. A subtask that becomes a task keeps dependencies on old siblings. Legacy incoming dependencies from other parents stay.

## Consequences

- Parents no longer show dependencies from subtasks.
- Import counts dependency rows with date or scope warnings once per row.
- The move dialog applies scope, parent and date fixes as one undo step. The `remove-cycle-dependency` fix is removed. Cycles through inherited edges stay permitted under ADR 13.
- A collapsed parent draws only its own dependency lines.
