# 13. Cycles are warnings, not errors

Status: Accepted (2026-11-08). Supersedes the cycle parts of ADR 6.

## Context

A subtask now depends on the own dependencies of its parent. Thus the effective graph has more edges, and more edits can make a cycle. Strict cycle checks block the user during replanning and need a large conflict flow. Readiness reads only the status of direct dependencies, and the user sets the status of each leaf. Thus a cycle cannot make a calculation loop, and the user can always break it.

## Decision

- The app permits cycles in the effective graph. It shows a cycle warning on each dependency in a cycle, like a date-rule warning.
- Hard rules stay for structure only: no self-dependency, no dependency between a parent and its own subtask, no duplicate ids, no unknown ids.
- The dependency picker shows candidates that make a cycle or break the date rule. It marks them with a hint and puts them at the end of the list.
- A commit that makes a new cycle shows one toast. Import accepts cycles and counts them in the warning toast.
- The move-conflict dialog no longer removes dependencies for cycles.
- `SCHEMA_VERSION` stays 1. The file shape does not change. An older app version rejects a file with a cycle.

## Rollout

All parts are complete.

- Load and import accept cycles. Import counts stored rows with cycle, date or scope warnings. Each row counts once.
- Parents use their own dependencies. Subtasks inherit the own dependencies of their parent. Subtasks can add dependencies only on siblings. The move dialog removes dependencies that break this scope rule. It has no cycle fix. Refer to [ADR 14](0014-subtasks-depend-only-on-siblings.md).
- The picker permits cycle and date candidates. It marks them with icons and hints and puts warned candidates last.
- Stored dependencies and inherited "From parent" chips show cycle warnings. Gantt lines and arrowheads are red at full opacity when any effective edge that they represent is part of a cycle. This applies in the workspace, Preview and print.
- A forward commit shows one warning toast after a successful save when it adds a new cycle-warning row. Undo, redo, activation, import and tab sync do not show this toast.
- Moving subtask S under parent P adds inherited edges S → P.own. It does not add edges P → S.own. A cycle through S → P.own is permitted.
- Inherited edges can make a cycle in an existing plan. For example, P depends on X, X depends on S, and S is a subtask of P. Load and import accept this plan.

## Consequences

- Each graph algorithm must stop on a cycle.
- Readiness does not report cycles. A task in a cycle is blocked while a dependency on the cycle is not finished. The user can set a status to break the cycle.
