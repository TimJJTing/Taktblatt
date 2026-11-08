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

- PR 2 accepts cycles on load and import. The dependency picker still blocks new cycles. The move-conflict dialog still offers the existing cycle fixes. Import counts date warnings only.
- PR 4 removes the move cycle fix. Parents no longer inherit dependencies from subtasks. Subtasks can add dependencies only on siblings. The move dialog removes dependencies that break this scope rule. Import counts date and scope warnings. Refer to [ADR 14](0014-subtasks-depend-only-on-siblings.md).
- PR 3 removes the picker cycle rejection. It adds the cycle warnings, marked candidates, sorting, commit toast, and import cycle count described above.
- From PR 4, moving subtask S under parent P adds inherited edges S → P.own. It does not add edges P → S.own. A cycle through S → P.own is permitted.
- Inherited edges can make a cycle in an existing plan. For example, P depends on X, X depends on S, and S is a subtask of P. Load and import must accept this plan from PR 2.

## Consequences

- Each graph algorithm must stop on a cycle.
- Readiness does not report cycles. A task in a cycle is blocked while a dependency on the cycle is not finished. The user can set a status to break the cycle.
