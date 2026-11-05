# Glossary

Use these terms in the UI, the code, the JSON schema and the docs. Do not use other names for them.

| Term                       | Meaning                                                                                                                                 | Do not use               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **Plan**                   | One plan for a project. It contains stages, tasks, milestones, bands, remarks and the header and footer fields.                         | project, document, board |
| **Stage**                  | A group of tasks in a plan. A stage has a title, a description and a color.                                                             | phase, section           |
| **Task**                   | A work entry with no parent (level 1).                                                                                                  | activity, item           |
| **Subtask**                | A task with a parent (level 2). A subtask cannot have subtasks.                                                                         | child item, sub-item     |
| **Parent**                 | A task that has one or more subtasks.                                                                                                   | group                    |
| **Derived value**          | A value that the app calculates from other data. The user cannot edit it directly.                                                      | computed field           |
| **Fallback value**         | The own value of a parent. The app hides it while the parent has subtasks.                                                              |                          |
| **Own dependencies**       | The ids in the `dependsOn` field of a task or subtask.                                                                                  |                          |
| **Effective dependencies** | For a subtask: its own dependencies. For a parent: the union of its own dependencies and those of its subtasks, minus its own subtasks. |                          |
| **Date rule**              | A cannot be a dependency of B if `A.start > B.end`.                                                                                     |                          |
| **Ready light**            | A small green dot. It shows that all effective dependencies of a task are done and the task is not done.                                | status, traffic light    |
| **Task dialog**            | The dialog with all fields of a task or subtask. Its UI title is "Task details" ("Subtask details").                                    | task modal, modal        |
| **Move**                   | A change of the stage or the parent of a task or subtask.                                                                               |                          |
| **Move-conflict dialog**   | The dialog that lists the changes that a move needs before it can occur.                                                                |                          |
| **Milestone**              | A dated event in the plan. Labels M1 … Mn follow date order.                                                                            |                          |
| **Band**                   | A titled time range that shows as a tint behind the Gantt bars.                                                                         | annotated range, period  |
| **Remark section**         | A titled list of bullets at the end of the plan. The short form "section" is approved in UI strings that are about a remark section.    | note section             |
| **Mention**                | A token `@[task:<id>]` in a note. The app shows it with the current task title.                                                         |                          |
| **Workspace**              | The screen layout with controls to edit a plan.                                                                                         | editor                   |
| **Preview**                | The read-only screen layout that shows the paginated sheets.                                                                            | print view               |
| **Sheet**                  | One printed page (A4 or US Letter).                                                                                                     |                          |
| **Paginator**              | The code that puts blocks on sheets.                                                                                                    |                          |
| **Viewer state**           | Settings for one browser only. They are not in the plan file.                                                                           | user settings            |
| **UI language**            | The language of the app controls, the date formats and the printed labels. Part of the viewer state. A plan has no language.            |                          |
| **Commit**                 | The end of one edit: blur, Enter, a checkbox, a picker, a dialog action. One commit is one undo step.                                   |                          |

## Rules for UI text

- A menu item that opens a dialog ends with “…”. Toolbar and icon buttons do not.
