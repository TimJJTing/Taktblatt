# Derived values and planned windows

[Specification index](../spec.md)

## 2. Derived values and planned windows

The app calculates a **derived value** from other data. The user cannot edit a derived value directly. Each derived value has one calculation. All views use the same calculation. A parent's dates and owners are stored, editable values. The app expands them to include the subtasks.

| Value                   | Rule                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parent `start`          | The stored start of the planned window. It is no later than the earliest subtask start. Empty subtask dates do not count.                                                                                                              |
| Parent `end`            | The stored end of the planned window. It is no earlier than the latest subtask end. Empty subtask dates do not count.                                                                                                                  |
| Parent `owners`         | The stored owners include all subtask owners. The app trims names and compares them without case. It keeps parent owners first, then new subtask owners, with the first spelling.                                                      |
| Parent `status`         | Ignore `canceled` subtasks. Of the other subtasks: all `done` → `done`; all `todo` → `todo`; all other combinations → `in_progress`. All subtasks `canceled` → `canceled`. The app writes this status on each commit, load and import. |
| Last subtask removal    | The parent keeps its stored dates, owners and status when the last subtask is deleted or moved out. There is no removal snapshot.                                                                                                      |
| Task order              | Tasks sort by `start` in their stage. Subtasks sort by `start` in their parent. Ties sort by `createdAt`. Tasks or subtasks without `start` go last.                                                                                   |
| Sort time               | The app sorts after a commit (blur, Enter, picker close). It does not sort while you type. The app animates the new order (FLIP).                                                                                                      |
| Milestone labels        | The app numbers milestones M1 … Mn by date order.                                                                                                                                                                                      |
| Stage number            | "Stage N". N is the position of the stage in the stage order.                                                                                                                                                                          |
| Stage months            | The months from the earliest `start` to the latest `end` of the tasks in the stage. One month: "Nov". More months: "Nov – Dec". The app hides the months when no tasks have dates.                                                     |
| Stage deliverables      | The list of task deliverables of the stage, in task order. The app skips empty values.                                                                                                                                                 |
| Stage progress          | "x / y done · z in progress". Count level-1 tasks by effective status. The total y leaves out `canceled` tasks. Hide the in-progress part when z is 0.                                                                                 |
| Page numbers            | "n / N". The paginator calculates these values ([section 7](print.md#7-preview-and-print)).                                                                                                                                            |
| Tab title and file name | The tab title is the heading. The export file name is `taktblatt-<heading-slug>-<YYYY-MM-DD>.json`. The date is the export date.                                                                                                       |

A **planned window** is the stored date range of a parent. All views and date warnings use it, including the table, task dialog, Gantt, Preview and print. It can be wider than the subtask range. When the window has both dates, it contains every subtask date. An open window stays open.

After each edit, the app expands each parent with subtasks. It keeps the earliest of the parent and subtask starts, the latest of their ends, and the normalized union of their owners. Empty dates do not count. Canceled subtasks contribute dates and owners. The status follows the rule above. The edit and this expansion form one undo step. Undo and redo restore the whole step.

The window never shrinks automatically. A narrower subtask range or removal of a subtask owner does not remove parent values. Edit the parent to reduce its range or remove owners. An empty first subtask keeps the task's dates and owners, but changes its status to the derived status. Load and import apply the same expansion. Refer to [ADR 15](../adr/0015-parent-planned-window.md).
