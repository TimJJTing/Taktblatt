# Dependencies

[Specification index](../spec.md)

## 3. Dependencies

### 3.1 Stored and effective dependencies

- A task or subtask stores its **own dependencies** in `dependsOn`. The app stores ids. The app shows the current titles.
- The **effective dependencies** of a subtask are its own dependencies and the own dependencies of its parent. A task, with or without subtasks, uses its own dependencies. The app excludes the task itself and unknown ids.
- A parent does not inherit dependencies from its subtasks. The app excludes dependencies that point at its own subtasks.
- The subtask dialog shows inherited dependencies as read-only chips. A subtask inherits the own dependencies of its parent. The source appears in a hint and in the accessible name, with "From parent {task}." It does not appear as visible text.
- In the editor, a subtask can add dependencies only on siblings with the same parent. A task can depend on other tasks and on subtasks of other tasks. Legacy subtask dependencies outside the parent stay valid. They count for that subtask and show a scope warning. Refer to [ADR 14](../adr/0014-subtasks-depend-only-on-siblings.md).

### 3.2 Validation

The app uses the effective graph for cycle checks and readiness. The date rule checks stored dependencies only, with effective task dates.

1. A task cannot depend on itself.
2. A task cannot depend on its parent or on its own subtask.
3. The app permits cycles in the effective graph, including on load and import. The dependency picker hides dependencies that are already stored or inherited.
4. **Date rule:** A dependency from B to A has a warning if `A.start > B.end`. If one of these dates is empty, the rule does not apply.

- The dependency picker hides candidates that break the structure or scope rules. It permits candidates that make a cycle or break the date rule. It marks these candidates with a warning icon and hint. Their accessible names include all warning reasons. Unwarned candidates come first. Each group keeps the plan order and subtask grouping. The eight-option limit fills with unwarned candidates first.
- A stored dependency has a cycle warning when any effective edge that it makes is part of a cycle. A parent stores its own edge and the edges that its subtasks inherit. The app computes strongly connected components without recursion. Refer to [ADR 13](../adr/0013-cycles-are-warnings.md).
- A forward commit that adds one or more new cycle-warning rows shows one warning toast: "This change makes a dependency cycle." The app shows it after the save succeeds. Undo, redo, plan activation, import and tab sync do not show this toast.
- A date change can break the date rule. The app does not remove the dependency. It shows a warning on the dependency.
- Each stored dependency row shows one warning icon if it has a cycle, date or subtask scope warning. Its hint and accessible name include all warning reasons. Inherited "From parent" chips show the warnings of the parent-stored dependency. Date and scope warnings do not make Gantt connectors red.
- When you delete a task, the app removes the task from all `dependsOn` lists. It also removes all mention tokens for the task.

### 3.3 Move conflicts

A **move** changes the stage or the parent of a task or subtask ([section 5.6](workspace.md#56-work-plan)).

- A stage move does not change the effective graph or any date. It never causes a conflict.
- A parent change can require fixes. When fixes are required, the app shows the **move-conflict dialog** before the move. The dialog lists:
  - **Remove dependency (scope):** each own dependency outside the new parent when the moved item becomes a subtask. Also remove dependencies on the moved item from its remaining old siblings.
  - **Remove dependency (parent and child):** a dependency of the new parent on the task or subtask that you move.
  - **Clear date:** the `start` or the `end` of the task or subtask that you move. The app lists it when expansion of the new parent's planned window would break the date rule.
- The dialog has two buttons: **Remove and move** and **Cancel**.
- A move does not change the old parent's planned window. It causes no date-rule warnings on the old parent.
- **Remove and move** applies all listed removals and the move as one undo step.
- **Cancel** does not change data.
- A moved subtask inherits the own dependencies of its new parent. A cycle through these new inherited edges is permitted. The dialog has no cycle fix. A subtask that becomes a task keeps its dependencies on its old siblings. Legacy incoming dependencies from other parents stay and show a scope warning. Refer to [ADR 13](../adr/0013-cycles-are-warnings.md) and [ADR 14](../adr/0014-subtasks-depend-only-on-siblings.md).

### 3.4 Ready light

- A **ready light** is a small green dot. It shows that a task is ready. Every ready task has the light on.
- A leaf is ready when its status is `todo` and all effective dependencies are finished (`done` or `canceled`). A leaf with no effective dependencies is ready. For a parent dependency, the app uses its derived status.
- A parent is ready when its derived status is `todo` and one or more subtasks are ready. The light counts ready subtasks. Canceled subtasks do not count for the derived status or readiness.
- A leaf is blocked when its status is `todo` and an effective dependency is not finished. A parent is blocked when its derived status is `todo` and no subtask is ready.
- A task whose effective status is not `todo` is inactive. It has no ready light. Readiness does not report cycles.
- The planned `start` date has no effect on the ready light.
- The ready light shows before the title in the table, before the Gantt label, on Kanban cards, in the task dialog and on the sheets. The Route map shows no ready light ([section 5.14](route-map.md#514-route-map)).
- In the table, the Gantt labels and the sheets, the ready light has a fixed slot before the title. When the light is off, the slot stays empty. Thus the first letters of the titles at the same level stay aligned, and a title does not move when the light comes on.
- In the task dialog, the app renders nothing when the ready light is off.
- It has an `aria-label`: "Ready" for a leaf with no effective dependencies, "Ready. Dependencies done: N" for other ready leaves, or "Ready. Subtasks ready: N" for a ready parent. The dependency count includes inherited dependencies. On the screen, it also shows this text as a hint on hover. Refer to [section 5.10](workspace.md#510-hints). The sheets show no hint.
- When it comes on, it fades in with one soft pulse.
