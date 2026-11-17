# Storage and state

[Specification index](../spec.md)

## 4. Storage and state

### 4.1 Plans

- The app keeps more than one plan. One plan is active.
- The header has a plan switcher. With the switcher, you can open and create plans, import files and back up all plans. The Menu renames, duplicates and deletes the open plan ([section 5.1](workspace.md#51-layout)).
- **Rename plan…** opens a small dialog. It changes the plan heading in one undo step. An empty name keeps the previous name.
- The app asks you to confirm before it deletes a plan. After the deletion, a toast shows an **Undo** button for 10 seconds. When you delete the last plan, the app creates a new empty plan.
- On the first start, the app creates an empty plan:
  - heading "Untitled plan" (as a placeholder), one empty stage;
  - the range is the current month plus the next two months;
  - no tasks.
- The empty plan shows a **Load example** button. The example is new, neutral content. It does not use the artifact data.

### 4.2 localStorage keys

| Key                                  | Content                                                           |
| ------------------------------------ | ----------------------------------------------------------------- |
| `taktblatt:index`                    | The list of plan ids and the active plan id.                      |
| `taktblatt:plan:<id>`                | One plan, with `schemaVersion`.                                   |
| `taktblatt:ui`                       | The **viewer state** ([section 4.4](storage.md#44-viewer-state)). |
| `taktblatt:locale`                   | The UI language (part of the viewer state).                       |
| `taktblatt:theme`                    | The screen theme (part of the viewer state).                      |
| `taktblatt:damaged:<timestamp>:<id>` | The raw text of damaged data.                                     |

### 4.3 Save

- The app saves automatically after each commit. It expands parent windows and writes derived parent status before it saves.
- When it loads a plan, the app expands parent windows to include the subtasks. Wider stored windows stay unchanged.
- **Cmd/Ctrl+S** does not do a save. It shows a "Saved" toast. It prevents the browser save dialog.
- When a plan changes in a different browser tab, the app loads the new data (the `storage` event). The last write wins.
- When the stored data does not parse or validate, the app:
  1. keeps the raw text under a `taktblatt:damaged:<timestamp>:<id>` key;
  2. starts with an empty plan;
  3. shows a notice with a **Download backup** button. The button saves the damaged text as the file `taktblatt-damaged-data.txt`.

### 4.4 Viewer state

The viewer state is for one browser only. It is not in the plan file. The export does not include it.

- the UI language;
- the screen theme (`light`, `dark` or `system`);
- the selected diagram view, shared by all plans;
- the diagrams selected for print, shared by all plans;
- whether printed diagrams show subtasks, shared by all plans;
- the expanded tasks, for each plan (shared by the Work plan, Gantt, Route map and Kanban);
- the pinned state and the height of the Timeline section;
- whether the Timeline legends are collapsed in split view;
- the width ratio of the split view;
- the selected tab on narrow screens;
- whether the user collapsed the Timeline section on narrow screens;
- whether the Timeline section stays open on scroll on narrow screens.

The app keeps the expanded tasks, the Timeline settings and the layout settings as `expanded`, `ganttPinned`, `ganttHeight`, `timelineLegendsCollapsed`, `splitRatio`, `narrowTab`, `timelineCollapsed` and `timelineKeepOpen` under the key `taktblatt:ui`. `splitRatio` is the width of the left pane as a fraction of the split width, from 0 to 1. The default is 0.5. `narrowTab` is `plan` (the Overview tab) or `work-plan`. The default is `plan`. `timelineCollapsed` is a boolean. It records only a collapse by the user, not an automatic collapse ([section 5.4](timeline.md#54-timeline-gantt)). The default is `false`. `timelineKeepOpen` is a boolean. The default is `false`. An invalid or absent value of these four fields gives its default and does not reset the other fields. The app ignores the older field `narrowLegendsCollapsed` and does not write it again. The UI language is under `taktblatt:locale`. The screen theme is under `taktblatt:theme`.

`timelineLegendsCollapsed` is the legend state in split view. An explicit stored boolean for it takes priority over the pin state. If this field is absent from valid older viewer data, the legends start collapsed when `ganttPinned` is `true`. They start expanded when `ganttPinned` is `false` or absent. With no stored data, the split view legends start expanded and the Timeline section starts unpinned in split view. Unreadable or invalid viewer data gives these defaults.

`diagramView` is the global diagram choice under `taktblatt:ui`. Its default is `gantt`. The view ids are `gantt`, `route-map` and `kanban`. Only registered views are available. An absent, invalid, unknown or unregistered value resolves to `gantt`. This fallback does not reset other viewer fields. A plan change, import or duplication does not change the choice. Refer to [section 5.13](diagram-views.md#513-diagram-views).

`printDiagrams` is the global print selection under `taktblatt:ui`. Its default is `[gantt]`. It is independent of `diagramView`. An absent or non-array value, including `null`, a scalar or an object, gives the default. In an array, retain only known registered string ids. Remove duplicate, unknown and unregistered ids. Use Gantt if no valid selection remains. This includes a stored Route map or Kanban selection when only Gantt is registered. These fallbacks preserve all other valid viewer preferences. Store the effective selection in print order. Refer to [section 7](print.md#7-preview-and-print).

`printSubtasks` is the global print detail preference under `taktblatt:ui`. Its visible name is "Show subtasks in printed diagrams". It is a boolean. Its default is `false`. An absent or invalid value gives the default and does not reset other viewer fields. It applies to every selected diagram. It is independent of `expanded`, `diagramView` and `printDiagrams`. Refer to [section 7](print.md#7-preview-and-print).

None of these three fields changes plan data, backup data, export data or undo history. None requires a plan schema change. All three choices work after a reload, also offline.

### 4.5 Undo

- The app keeps one undo history in memory for the active plan. The history keeps 50 steps.
- One commit is one step: a blur, Enter, a status selection, a picker, a dialog action, a move.
- **Cmd/Ctrl+Z** undoes. **Shift+Cmd/Ctrl+Z** and **Ctrl+Y** redo.
- The app clears the history when you switch to a different plan, when another browser tab changes the active plan, after an import, when you change the UI language (the page reloads, see [section 6](language.md#6-language)), and when you reload the page.

### 4.6 Import and export

- **Export this plan** writes a `PlanFile`.
- **Back up all plans** writes a `BackupFile`. The file name is `taktblatt-backup-<YYYY-MM-DD>.json`. The date is the export date.
- Import accepts both kinds. The app validates the file. If the file is not valid, the app shows the errors and does not change data.
- Import rejects duplicate ids in the stages, tasks, milestones, bands or remark sections of a plan. It also rejects a dependency between a parent and its own subtask. Load and import accept cycles in the effective dependency graph. Refer to [data-model.md](../data-model.md) for all import rules.
- Import expands parent windows and owners to include the subtasks, and writes derived parent status. This applies to each plan in a backup. Wider imported windows stay unchanged.
- Import permits date-rule conflicts and shows warnings for them.
- Import adds each plan as a new plan. The last imported plan becomes active. A toast confirms the import. If stored dependencies have cycle, date or subtask scope warnings, a second toast shows the number of dependency rows with warnings. A row with one or more warning kinds counts once. Import is not an undo step.
- If the browser cannot save the data, import undoes its own writes and shows an error.
- If a plan with the same `id` exists, one dialog lists all such plans. Each plan has the choices **Replace** and **Keep both**. The default is **Keep both**. **Replace** overwrites the existing plan with the same `id`. **Cancel** imports nothing. **Keep both** gives the copy a new id and adds the copy suffix to its heading. The suffix follows the UI language (English: " (copy)").
- If the file is not valid, a dialog lists the errors (the first eight, and the number of other errors).
- All import errors use the UI language. This includes invalid JSON, non-object JSON values (such as a JSON array or primitive), schema versions, field types, dates and plan rules. Field paths and schema numbers stay unchanged. A missing field says that the field is required. A value outside a fixed set lists the allowed values. A range error says that the start must be on or before the end. A range with the same start and end remains valid.
