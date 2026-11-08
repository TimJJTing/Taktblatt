# 6. Effective dependencies and move conflicts

Status: Accepted (amended by ADR 13, ADR 14 and ADR 15) (2026-11-04)

ADR 13 and ADR 14 replace the dependency and cycle rules below. [ADR 15](0015-parent-planned-window.md) replaces the date derivation used in the analysis. Parent dates now form a stored planned window. Moving a subtask out does not shrink that window. Clearing dates on a moved subtask prevents expansion from those dates; it does not shrink a stored parent window.

## Context

A parent depends on what its subtasks depend on. A move can change the dependency graph and the derived dates. This can cause cycles and date-rule breaks.

## Decision

- The **effective dependencies** of a parent are the union of its own dependencies and those of its subtasks. The app excludes dependencies that point at its own subtasks.
- All validation and the ready light use the effective graph.
- A stage move never causes a conflict, because it does not change the graph or a date.
- Before a parent change, the app calculates the conflicts. The move-conflict dialog shows them:
  - a dependency that causes a cycle for the task or subtask that you move: remove it;
  - a dependency of the new parent on the task or subtask that you move: remove it;
  - a date-rule break on the new parent: clear the `start` or the `end` of the task or subtask that you move.
- **Remove and move** applies all changes as one undo step.

## Analysis

- When S moves under P, the only new edges are P → D for each D in the own dependencies of S. A new cycle must use one of these edges. If you remove D from S, you remove the cycle.
- The app skips empty values when it calculates the derived dates of P. If you clear the `start` or the `end` of S, the app gives P its earlier dates again, or empty dates. Then the date rule does not apply.
- When S moves out of P, the move only removes edges. It cannot cause a cycle. The planned window of P stays unchanged. The move causes no date-rule warnings on P.

## Consequences

- A move never leaves a cycle in the data.
- A move does not change the old parent's planned window. It causes no date-rule warnings on the old parent.
