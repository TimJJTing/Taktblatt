# Taktblatt — Specification v1

This specification is the reference for the implementation. It replaces the design spec v0.1 of the artifact. It records a decision for each open or proposed question in v0.1.

The text follows ASD-STE100 (Simplified Technical English). [GLOSSARY.md](../GLOSSARY.md) defines the terms in **bold**.

## 0. Product

- Taktblatt shows a plan as a timeline, stages, milestones and a work table.
- Taktblatt is a static web app. It has no server and no authentication.
- The app keeps all data in the browser `localStorage`. It sends no data on the network.
- The app does not collect analytics or telemetry.
- The app works offline. You can install it as a PWA. A service worker caches the app files and answers from the cache first. A new build waits until you close all tabs of the old build. The new service worker does not call `skipWaiting`. When it takes control, it deletes the old cache. A page navigation without network gets the cached app shell. The app does not request any other file at run time.
- You can import a **plan** from a JSON file. You can export a plan to a JSON file.
- The printed output (print or "Save as PDF") follows the artifact design. The workspace has controls to edit the plan.
- The design artifact contains real example data. The app must not use these values.

## 1. Data model

All dates are date-only strings `YYYY-MM-DD`. Do not use timestamps for dates. This prevents time-zone shifts.

```ts
type ISODate = string; // "YYYY-MM-DD"
type Locale = 'en' | 'de' | 'zh-TW' | 'ja';

interface PlanFile {
	schemaVersion: 1;
	kind: 'plan';
	plan: Plan;
}

interface BackupFile {
	schemaVersion: 1;
	kind: 'backup';
	plans: Plan[];
}

interface Plan {
	id: string;
	heading: string; // workspace: required
	subheading: string; // empty text is valid
	range: { start: ISODate; end: ISODate }; // the Gantt window
	objective: string; // workspace: max 250 characters
	paper: 'a4' | 'letter';
	footer: { note: string; version: string; date: ISODate | null; right: string };
	stages: Stage[]; // manual order (array order)
	tasks: Task[];
	milestones: Milestone[];
	bands: Band[];
	remarks: RemarkSection[]; // manual order (array order)
	createdAt: string; // ISO timestamp
	updatedAt: string; // ISO timestamp
}

interface Stage {
	id: string;
	title: string; // workspace: required, max 30 characters
	description: string;
	color: StageColor; // a key of the curated palette
}

interface Task {
	id: string;
	stageId: string;
	parentId: string | null; // null = task; else subtask. Max depth is 2.
	title: string; // workspace: required
	deliverable: string;
	start: ISODate | null;
	end: ISODate | null;
	owners: string[];
	status: 'todo' | 'in_progress' | 'done' | 'canceled';
	note: string; // plain text with mention tokens
	dependsOn: string[]; // task ids
	createdAt: string; // ISO timestamp, sort tie-breaker
}

interface Milestone {
	id: string;
	title: string;
	description: string;
	date: ISODate;
	symbol:
		| 'diamond'
		| 'flag'
		| 'star'
		| 'circle'
		| 'triangle'
		| 'square'
		| 'hexagon'
		| 'pentagon'
		| 'pin'
		| 'bookmark'
		| 'heart';
}

interface Band {
	id: string;
	title: string;
	start: ISODate;
	end: ISODate;
	color: BandTint; // a key of the curated tint palette
}

interface RemarkSection {
	id: string;
	title: string;
	bullets: string[];
}
```

The `required` title rules and text length limits above are limits of the workspace. They are not import rules. The schema requires string fields. It permits empty titles and text longer than the workspace limits.

### 1.1 Rules for the data

- Every file and every stored plan has a `schemaVersion`. The app migrates old versions when it loads them.
- The app validates all data with one Valibot schema. The TypeScript types come from this schema.
- Owners are plain strings. The app trims them. The app compares them without case. A task has no duplicate owners.
- A note can contain mention tokens: `@[task:<id>]`. The app shows each token as a chip with the current title of the task.

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
| Page numbers            | "n / N". The paginator calculates these values (section 7).                                                                                                                                                                            |
| Tab title and file name | The tab title is the heading. The export file name is `taktblatt-<heading-slug>-<YYYY-MM-DD>.json`. The date is the export date.                                                                                                       |

A **planned window** is the stored date range of a parent. All views and date warnings use it, including the table, task dialog, Gantt, Preview and print. It can be wider than the subtask range. When the window has both dates, it contains every subtask date. An open window stays open.

After each edit, the app expands each parent with subtasks. It keeps the earliest of the parent and subtask starts, the latest of their ends, and the normalized union of their owners. Empty dates do not count. Canceled subtasks contribute dates and owners. The status follows the rule above. The edit and this expansion form one undo step. Undo and redo restore the whole step.

The window never shrinks automatically. A narrower subtask range or removal of a subtask owner does not remove parent values. Edit the parent to reduce its range or remove owners. An empty first subtask keeps the task's dates and owners, but changes its status to the derived status. Load and import apply the same expansion. Refer to [ADR 15](adr/0015-parent-planned-window.md).

## 3. Dependencies

### 3.1 Stored and effective dependencies

- A task or subtask stores its **own dependencies** in `dependsOn`. The app stores ids. The app shows the current titles.
- The **effective dependencies** of a subtask are its own dependencies and the own dependencies of its parent. A task, with or without subtasks, uses its own dependencies. The app excludes the task itself and unknown ids.
- A parent does not inherit dependencies from its subtasks. The app excludes dependencies that point at its own subtasks.
- The subtask dialog shows inherited dependencies as read-only chips. A subtask inherits the own dependencies of its parent. The source appears in a hint and in the accessible name, with "From parent {task}." It does not appear as visible text.
- In the editor, a subtask can add dependencies only on siblings with the same parent. A task can depend on other tasks and on subtasks of other tasks. Legacy subtask dependencies outside the parent stay valid. They count for that subtask and show a scope warning. Refer to [ADR 14](adr/0014-subtasks-depend-only-on-siblings.md).

### 3.2 Validation

The app uses the effective graph for cycle checks and readiness. The date rule checks stored dependencies only, with effective task dates.

1. A task cannot depend on itself.
2. A task cannot depend on its parent or on its own subtask.
3. The app permits cycles in the effective graph, including on load and import. The dependency picker hides dependencies that are already stored or inherited.
4. **Date rule:** A dependency from B to A has a warning if `A.start > B.end`. If one of these dates is empty, the rule does not apply.

- The dependency picker hides candidates that break the structure or scope rules. It permits candidates that make a cycle or break the date rule. It marks these candidates with a warning icon and hint. Their accessible names include all warning reasons. Unwarned candidates come first. Each group keeps the plan order and subtask grouping. The eight-option limit fills with unwarned candidates first.
- A stored dependency has a cycle warning when any effective edge that it makes is part of a cycle. A parent stores its own edge and the edges that its subtasks inherit. The app computes strongly connected components without recursion. Refer to [ADR 13](adr/0013-cycles-are-warnings.md).
- A forward commit that adds one or more new cycle-warning rows shows one warning toast: "This change makes a dependency cycle." The app shows it after the save succeeds. Undo, redo, plan activation, import and tab sync do not show this toast.
- A date change can break the date rule. The app does not remove the dependency. It shows a warning on the dependency.
- Each stored dependency row shows one warning icon if it has a cycle, date or subtask scope warning. Its hint and accessible name include all warning reasons. Inherited "From parent" chips show the warnings of the parent-stored dependency. Date and scope warnings do not make Gantt lines red.
- When you delete a task, the app removes the task from all `dependsOn` lists. It also removes all mention tokens for the task.

### 3.3 Move conflicts

A **move** changes the stage or the parent of a task or subtask (section 5.6).

- A stage move does not change the effective graph or any date. It never causes a conflict.
- A parent change can require fixes. When fixes are required, the app shows the **move-conflict dialog** before the move. The dialog lists:
  - **Remove dependency (scope):** each own dependency outside the new parent when the moved item becomes a subtask. Also remove dependencies on the moved item from its remaining old siblings.
  - **Remove dependency (parent and child):** a dependency of the new parent on the task or subtask that you move.
  - **Clear date:** the `start` or the `end` of the task or subtask that you move. The app lists it when expansion of the new parent's planned window would break the date rule.
- The dialog has two buttons: **Remove and move** and **Cancel**.
- A move does not change the old parent's planned window. It causes no date-rule warnings on the old parent.
- **Remove and move** applies all listed removals and the move as one undo step.
- **Cancel** does not change data.
- A moved subtask inherits the own dependencies of its new parent. A cycle through these new inherited edges is permitted. The dialog has no cycle fix. A subtask that becomes a task keeps its dependencies on its old siblings. Legacy incoming dependencies from other parents stay and show a scope warning. Refer to [ADR 13](adr/0013-cycles-are-warnings.md) and [ADR 14](adr/0014-subtasks-depend-only-on-siblings.md).

### 3.4 Ready light

- A **ready light** is a small green dot. It shows that a task is ready. Every ready task has the light on.
- A leaf is ready when its status is `todo` and all effective dependencies are finished (`done` or `canceled`). A leaf with no effective dependencies is ready. For a parent dependency, the app uses its derived status.
- A parent is ready when its derived status is `todo` and one or more subtasks are ready. The light counts ready subtasks. Canceled subtasks do not count for the derived status or readiness.
- A leaf is blocked when its status is `todo` and an effective dependency is not finished. A parent is blocked when its derived status is `todo` and no subtask is ready.
- A task whose effective status is not `todo` is inactive. It has no ready light. Readiness does not report cycles.
- The planned `start` date has no effect on the ready light.
- The ready light shows before the title in the table, before the Gantt label, in the task dialog and on the sheets.
- In the table, the Gantt labels and the sheets, the ready light has a fixed slot before the title. When the light is off, the slot stays empty. Thus the first letters of the titles at the same level stay aligned, and a title does not move when the light comes on.
- In the task dialog, the app renders nothing when the ready light is off.
- It has an `aria-label`: "Ready" for a leaf with no effective dependencies, "Ready. Dependencies done: N" for other ready leaves, or "Ready. Subtasks ready: N" for a ready parent. The dependency count includes inherited dependencies. On the screen, it also shows this text as a hint on hover. Refer to section 5.10. The sheets show no hint.
- When it comes on, it fades in with one soft pulse.

## 4. Storage and state

### 4.1 Plans

- The app keeps more than one plan. One plan is active.
- The header has a plan switcher. With the switcher, you can open and create plans, import files and back up all plans. The Menu renames, duplicates and deletes the open plan (section 5.1).
- **Rename plan…** opens a small dialog. It changes the plan heading in one undo step. An empty name keeps the previous name.
- The app asks you to confirm before it deletes a plan. After the deletion, a toast shows an **Undo** button for 10 seconds. When you delete the last plan, the app creates a new empty plan.
- On the first start, the app creates an empty plan:
  - heading "Untitled plan" (as a placeholder), one empty stage;
  - the range is the current month plus the next two months;
  - no tasks.
- The empty plan shows a **Load example** button. The example is new, neutral content. It does not use the artifact data.

### 4.2 localStorage keys

| Key                                  | Content                                      |
| ------------------------------------ | -------------------------------------------- |
| `taktblatt:index`                    | The list of plan ids and the active plan id. |
| `taktblatt:plan:<id>`                | One plan, with `schemaVersion`.              |
| `taktblatt:ui`                       | The **viewer state** (section 4.4).          |
| `taktblatt:locale`                   | The UI language (part of the viewer state).  |
| `taktblatt:theme`                    | The screen theme (part of the viewer state). |
| `taktblatt:damaged:<timestamp>:<id>` | The raw text of damaged data.                |

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
- the expanded tasks, for each plan (shared by the Gantt and the table);
- the pinned state and the height of the Timeline section;
- whether the Timeline legends are collapsed in split view;
- the width ratio of the split view;
- the selected tab on narrow screens;
- whether the user collapsed the Timeline section on narrow screens;
- whether the Timeline section stays open on scroll on narrow screens.

The app keeps the expanded tasks, the Timeline settings and the layout settings as `expanded`, `ganttPinned`, `ganttHeight`, `timelineLegendsCollapsed`, `splitRatio`, `narrowTab`, `timelineCollapsed` and `timelineKeepOpen` under the key `taktblatt:ui`. `splitRatio` is the width of the left pane as a fraction of the split width, from 0 to 1. The default is 0.5. `narrowTab` is `plan` (the Overview tab) or `work-plan`. The default is `plan`. `timelineCollapsed` is a boolean. It records only a collapse by the user, not an automatic collapse (section 5.4). The default is `false`. `timelineKeepOpen` is a boolean. The default is `false`. An invalid or absent value of these four fields gives its default and does not reset the other fields. The app ignores the older field `narrowLegendsCollapsed` and does not write it again. The UI language is under `taktblatt:locale`. The screen theme is under `taktblatt:theme`.

`timelineLegendsCollapsed` is the legend state in split view. An explicit stored boolean for it takes priority over the pin state. If this field is absent from valid older viewer data, the legends start collapsed when `ganttPinned` is `true`. They start expanded when `ganttPinned` is `false` or absent. With no stored data, the split view legends start expanded and the Timeline section starts unpinned in split view. Unreadable or invalid viewer data gives these defaults.

### 4.5 Undo

- The app keeps one undo history in memory for the active plan. The history keeps 50 steps.
- One commit is one step: a blur, Enter, a status selection, a picker, a dialog action, a move.
- **Cmd/Ctrl+Z** undoes. **Shift+Cmd/Ctrl+Z** and **Ctrl+Y** redo.
- The app clears the history when you switch to a different plan, when another browser tab changes the active plan, after an import, when you change the UI language (the page reloads, see section 6), and when you reload the page.

### 4.6 Import and export

- **Export this plan** writes a `PlanFile`.
- **Back up all plans** writes a `BackupFile`. The file name is `taktblatt-backup-<YYYY-MM-DD>.json`. The date is the export date.
- Import accepts both kinds. The app validates the file. If the file is not valid, the app shows the errors and does not change data.
- Import rejects duplicate ids in the stages, tasks, milestones, bands or remark sections of a plan. It also rejects a dependency between a parent and its own subtask. Load and import accept cycles in the effective dependency graph. Refer to [data-model.md](data-model.md) for all import rules.
- Import expands parent windows and owners to include the subtasks, and writes derived parent status. This applies to each plan in a backup. Wider imported windows stay unchanged.
- Import permits date-rule conflicts and shows warnings for them.
- Import adds each plan as a new plan. The last imported plan becomes active. A toast confirms the import. If stored dependencies have cycle, date or subtask scope warnings, a second toast shows the number of dependency rows with warnings. A row with one or more warning kinds counts once. Import is not an undo step.
- If the browser cannot save the data, import undoes its own writes and shows an error.
- If a plan with the same `id` exists, one dialog lists all such plans. Each plan has the choices **Replace** and **Keep both**. The default is **Keep both**. **Replace** overwrites the existing plan with the same `id`. **Cancel** imports nothing. **Keep both** gives the copy a new id and adds the copy suffix to its heading. The suffix follows the UI language (English: " (copy)").
- If the file is not valid, a dialog lists the errors (the first eight, and the number of other errors).
- All import errors use the UI language. This includes invalid JSON, non-object JSON values (such as a JSON array or primitive), schema versions, field types, dates and plan rules. Field paths and schema numbers stay unchanged. A missing field says that the field is required. A value outside a fixed set lists the allowed values. A range error says that the start must be on or before the end. A range with the same start and end remains valid.

## 5. Screen: the workspace

### 5.1 Layout

- The workspace has two groups. **Plan** has, in this order: Header (with the sheet footer fields), Timeline (Gantt), Stage overview and Remarks. **Work plan** has the work plan.
- The workspace layout is for the screen only. It does not change the Preview, the sheets, pagination or print. The sheets keep the order of section 7.
- The page does not scroll. The app header stays at the top. Each group scrolls in its own region below the app header.
- The app header row contains: plan switcher, Undo, Redo and Menu. The header has no Preview, Print, Import or Export button. These actions are in the two menus below.
- **Split view (viewport width 1024 px or more):** Plan is the left pane and Work plan is the right pane. The panes fill the width of the window. Each pane scrolls vertically on its own.
  - When the viewport becomes wider and hides the focused tab, focus moves to the group of that tab.
  - A vertical divider between the panes changes their widths. Its resize target is at least 12 px wide. It shows a grip on hover and focus.
  - The divider is a `separator` with `aria-orientation="vertical"` and the accessible name "Resize panes". Its value is the left pane width in percent. Pointer drag changes the widths at once. Left and Right arrows change the ratio by 2 %. Page Up and Page Down change it by 10 %. Home and End go to the limits. A double-click resets the ratio to 50 %.
  - Each pane is at least 360 px wide. When the window is too narrow for the stored ratio, the app clamps the widths and keeps the stored ratio.
  - Keyboard steps and the reset animate the widths through `motionDuration(ms)`. Drag is immediate. Reduced motion makes all changes immediate.
  - The app keeps the ratio after a reload (section 4.4).
- **Tabs (viewport width below 1024 px):** a tab bar at the bottom of the window has two tabs, **Overview** and **Work plan**. Overview shows the Plan group without the Timeline section: Header, Stage overview and Remarks. The Timeline section does not change with the tab. It always shows at the top, below the app header (section 5.4). Only the selected group shows below it. The tabs use the WAI-ARIA tabs pattern with automatic activation: Left and Right arrows, Home and End move focus and select the tab.
  - The tab bar is a floating island: a rounded pill of frosted glass, centered above the bottom edge. It does not scroll. It keeps 12 px clear of the bottom edge and of the device safe area, such as a home indicator. Content behind it shows through blurred. A thin light edge and a soft shadow separate it from the content. The selected tab is a brighter glass pill inside the island. The pill slides to the selected tab with a transition through `motionDuration(ms)`. Each tab shows only a decorative icon: a dashboard icon for **Overview** and a checklist icon for **Work plan**. The tab name is its accessible name, and a hint shows the name on hover and keyboard focus (section 5.10). At full size, each tab target is at least 44 px wide and 40 px high. The island uses the screen theme.
  - When the user prefers reduced transparency, or in forced colors mode, the island is opaque and has a solid border.
  - The island floats over the selected group. The group has bottom space equal to the full island height, its bottom gap, the safe area and 16 px more. At the end of the scroll, the island covers no content. Focus and jumps keep the focused element above the island.
  - The island size follows the scroll of the selected group. A scroll down makes it smaller, and a scroll up makes it larger again, in proportion to the scroll distance. 48 px of scroll changes it from full size to compact size, or back. When the scroll stops, the island keeps its last size. The compact tab target is 28 px high with a smaller icon, and stays at least 24 px high. The safe-area space does not change.
  - The island returns to full size when a tab gets keyboard focus, when the group cannot scroll, and at the top of the group. A tab change and a scroll by the app (a restored scroll position, a label jump, the reveal of a focused element) do not change the size. Overscroll at the top and bottom edges does not change it.
  - When the user prefers reduced motion, the island stays at full size.
  - Only the selected group is a tab panel. Its tab gives its accessible name. The Timeline section keeps its own region.
  - When the viewport becomes narrower and hides the focused divider, focus moves to the selected tab.
  - Each group keeps its scroll position when the other tab shows. When the content is shorter than before, the app uses the nearest possible position.
  - When the viewport becomes narrower than 1024 px and keyboard focus is in a group, the app selects the tab of that group. Focus stays on its element. Changing the tab does not reset fields or the expand state.
  - The selected group fades in through `motionDuration(ms)`. Its position does not change. Reduced motion makes it immediate.
  - The app keeps the selected tab after a reload (section 4.4).
- When the layout changes between split view and tabs, the app keeps the plan, the expand state, the pin state and the open dialogs. It does not create the Timeline section again.
- All edit controls fit at widths of 768 px or more. On a phone, you can read the plan, edit text and dates, and set the task status. The Gantt and the table scroll horizontally.
- **Menus by scope.** The app header has two menus. The **plan switcher** holds the actions on all plans. The **Menu** holds the actions on the open plan and the app settings. Refer to [ADR 17](adr/0017-menus-by-scope.md).
- The **plan switcher** shows the name of the open plan and a decorative up-down chevron. Its accessible name is "Plans". It opens **Plans**. In the dropdown menu, the visible label "Plans" comes first. Then comes the list of all plans, then a separator, then **New plan**, **Import…** and **Back up all plans**. The list marks the open plan with a check mark. A choice in the list opens that plan. **Import…** opens the file chooser (section 4.6). **Back up all plans** writes a `BackupFile` (section 4.6).
- The **Menu** is the last button in the app header. Its icon is an ellipsis (**…**). It opens **This plan**. In the dropdown menu, the visible label "This plan" comes first. Then come **Print…**, **Export this plan**, **Rename plan…**, **Duplicate plan** and **Delete plan…**, in this order. **Print…** opens the preview (section 7). It does not open the print dialog. **Export this plan** writes a `PlanFile`. **Delete plan…** uses the destructive style and opens the delete confirmation (section 5.11). A separator comes before the settings: **Theme** and **Language**.
  - **Theme** has three choices: **Light**, **Dark** and **System**. The **theme switch** shows them. It is one radio group. It looks like a track with one thumb. The thumb marks the selected choice and slides to it. Each choice shows a decorative icon (sun, moon, monitor). The choice name is its accessible name.
  - In the dropdown menu, the theme switch shows icons only and is inset from the menu edges. Up and Down arrows move through the choices like the other menu items. In the bottom sheet, the theme switch also shows the choice names. Left and Right arrows move the selection.
  - **Language** shows the name of the UI language at the end of its row. It opens the choices **English**, **Deutsch**, **繁體中文** and **日本語**.
- Each command in both menus has a decorative icon. The plans in the Plans list have no icon. Only the open plan has a check mark. Both menus support pointer, touch and keyboard input. Their labels use the UI language. The header has one Menu button and one plan switcher.
- **Actions and closing.** In both presentations, an action closes the menu first. The action runs when the menu has closed. If the user opens the menu again before then, the pending action runs first, one time. **Import…** is different: it opens the file chooser at once, because the browser needs the user action.
  - In the dropdown menu, a Theme choice applies at once and closes the menu.
- **Presentation.** When the primary pointer is coarse (`pointer: coarse`, as on phones and most tablets), each menu opens as a **bottom sheet**. Otherwise it opens as a dropdown menu. Both presentations have the same items, groups and order.
  - A bottom sheet is a modal dialog at the bottom edge of the window. It uses the vendored Sheet component (`side="bottom"`). It has rounded top corners, a grip and a visible title: "Plans" or "This plan". The grip is decorative for assistive technology.
  - The This plan bottom sheet shows the name of the open plan below its title.
  - A scrim covers the app. A tap on the scrim or Esc closes the bottom sheet.
  - **Drag to close:** a drag down closes the bottom sheet.
    - A drag can start on the grip, the title area or the content. On the content, a drag starts only when the content is scrolled to the top and the finger moves down. Otherwise the content scrolls.
    - A drag starts after 4 px of movement. A movement that is more horizontal than vertical does not start a drag. A drag does not start in a text field or on a select. A drag cancels the tap on the control below the finger.
    - During a drag, the bottom sheet follows the finger down. A drag up moves the bottom sheet only a little, with resistance: at most 12 px above its open position. On release, it moves back to the open position. The scrim fades in proportion to the distance.
    - On release, the bottom sheet closes when the distance is 25 % of its height or more. It also closes after a flick: a fast move down at 0.4 px/ms or more. Otherwise it moves back to the open position.
    - The bottom sheet has no intermediate stop positions.
    - A close by drag is the same as a tap on the scrim: focus goes back to the button that opened the bottom sheet.
    - The close and the return animate from the current position through `motionDuration(ms)`. Reduced motion makes them immediate. The drag itself follows the finger with no delay.
    - A mouse or pen drag works the same way. Esc and the scrim stay available, so a drag is never the only way to close.
  - An action closes the bottom sheet before it runs. The actions are: a plan in the list, **New plan**, **Import…**, **Back up all plans**, **Print…**, **Export this plan**, **Rename plan…**, **Duplicate plan** and **Delete plan…**.
  - A Theme choice applies at once and keeps the bottom sheet open. A Language choice closes the bottom sheet before the reload or the confirmation dialog (section 6).
  - When the bottom sheet opens, focus moves to the bottom sheet. Focus stays inside it. When it closes, focus goes back to the button that opened it.
  - When an action opens a dialog, the dialog gets the focus. When the dialog closes, focus goes back to the button that opened the bottom sheet.
  - The bottom sheet keeps clear of the device safe area. Its height is at most 85 % of the viewport height. Taller content scrolls inside the bottom sheet. The title stays visible.
  - The bottom sheet slides up and down through `motionDuration(ms)`. Reduced motion makes it immediate.
  - In the Plans bottom sheet, the plans are one list of rows. The open plan has a check mark and `aria-current`. Up Arrow and Down Arrow move focus in the list. Up Arrow on the first row moves focus to the last row. Down Arrow on the last row moves focus to the first row. They do not open a plan. Enter, Space or a tap opens the focused plan.
  - In the Plans bottom sheet, **New plan**, **Import…** and **Back up all plans** are one row of three equal buttons below the list. The visible label of the last button is **Back up**. Its accessible name is "Back up all plans".
  - In the This plan bottom sheet, **Print…** and **Export this plan** are two large tiles in one row. Each tile has a short description: "Preview the sheets" and "This plan as a file". **Rename plan…**, **Duplicate plan** and **Delete plan…** are full-width rows below. **Theme** uses the theme switch. **Language** uses the vendored Select component, like the other selects in the app.
  - Every target in a bottom sheet is at least 44 px high.
- The default theme is **System**. It follows changes to the system theme while the app is open. **Light** and **Dark** override the system theme.
- A theme change applies at once. It does not reload the page, change plan data or clear the undo history. The app saves the choice in this browser. It restores the choice after a reload, also offline. An import does not change it.
- Preview sheets and printed sheets are always light. The Preview dialog controls use the screen theme.
- The browser and PWA theme-color metadata follows the resolved screen theme, including an explicit light or dark choice.
- A startup script in the page shell applies the saved theme and the theme-color metadata before the first paint. The app does not show the wrong theme while it starts. If the browser blocks storage, the script uses **System**.
- The Menu button shows its name in a tooltip, as the other header buttons do.

### 5.2 Edit fields

- Click a field to edit it. A blur saves. Enter commits a single-line field. Esc cancels.
- In the table: Tab and Shift+Tab move between cells. Enter commits and moves to the same cell in the next row.
- A control that shows on hover also shows on `:focus-within`. You can reach it on a touch screen.
- **Expand and collapse:** a pointer click on a parent chevron in the table or Gantt saves the active field by blur. It changes the shared expand state, clears the linked row highlight, and removes focus from the chevron and table. Enter and Space change the expand state and keep focus on the chevron.
- Print and preview do not show add, remove and edit controls.
- **"+" line:** a thin horizontal line with a round "+" button. It shows when you hover over its scope or when its scope has focus. A click adds an empty entry and puts the focus on it.

### 5.3 Header fields

- **Subheading:** single line, optional. The app stores it as typed. CSS makes it uppercase. The sheets hide it when it is empty.
- **Heading:** required, max 2 lines (about 80 characters). Empty on blur → the previous value comes back.
- **Plan range:** a date range picker. It sets the Gantt window. A **Fit to tasks** button sets the range to the dates of all tasks.
- **Objective:** text, max 250 characters. The label text is "Objective:". The sheets hide it when it is empty.
- **Sheet footer:** a row after the objective with the label "Sheet footer". It has the footer fields of section 5.9. A hint on the label says "Prints at the bottom of each sheet." The note, version and date are on the left. The right note is on the right. The row wraps when it does not fit. The row is a group with the accessible name "Sheet footer".

### 5.4 Timeline (Gantt)

- One row for each task. The rows use the same data as the table.
- A parent row has a chevron. Expanded rows show the subtasks as thinner, lighter bars.
- A task needs a **valid range** (start and end set, start ≤ end) to show a bar.
- A task with only one date shows a point marker at that date.
- A task with no dates shows the title and a muted "No dates" cue.
- A task with a start after its end shows a muted "Start is after end" cue. It has no bar.
- The app clips a bar outside the window at the edge. The clipped edge has a mark.
- A task fully outside the window has no bar. A chevron at the near edge shows the side.
- Only tasks with effective status `done` or `canceled` have a muted bar and a struck-through label. Bars and points use 40% opacity. Tasks with status `todo` or `in_progress` keep their normal appearance. This rule also applies in Preview and print.
- The accessible name of a bar or point adds "done", "in progress" or "canceled" for that status. It adds no status text for `todo`.
- Bars are read-only. You edit dates in the table or in the task dialog.
- **Labels:** click a label to scroll the Work plan to its table row. The row flashes one time. With tabs, a click first selects the Work plan tab when the Overview tab shows. You cannot edit a label in the Gantt.
- **Linked highlight:** hover or focus on a table row highlights its bar. Hover or focus on a bar highlights its row. While the Timeline section is pinned (always with tabs), the app scrolls the chart to show the bar.
- **Today line:** a dashed line with a "Today" label, behind the bars. It uses the local date of the viewer. The app hides it when the date is outside the range.
- **Dependency lines:** thin lines behind the bars. No lines go to or from a task without a drawn range or point. Each visible row draws its own stored dependencies. A collapsed parent draws only its own dependencies. Hidden legacy subtask dependencies do not draw lines. A dependency on a hidden subtask connects to its parent bar. The app merges duplicate lines. The lines move with an animation when you expand or collapse. Lines from a done or canceled row use 40% opacity, the same as done and canceled bars. This also applies in Preview and print. For a parent row, the app uses its derived status. A line is red at full opacity when any effective edge of its stored dependencies is part of a cycle. This rule includes inherited edges and merged duplicate lines. The arrowhead has the same color. Red overrides the muted source style in the workspace, Preview and print. Lines are decorative. The dependency dialog gives the text alternative.
- **Bands:** any number. Each band has a title, a range and a tint. Bands have a transparent tint, so you can see each band where their ranges overlap. The legend shows "Title (start – end)". A "+" at the end of the legend opens a small dialog (title, range, tint). Click a band or its legend entry to edit it. The dialog has **Delete…**, with a confirmation.
- **Milestones:** a symbol on the milestone row. The legend shows "M1 Title (date)". A "+" after the legend opens a small dialog (title, description, date, symbol). Click a milestone or its legend entry to edit it. The dialog has **Delete…**, with a confirmation.
- **Milestone and band dialogs:** an outside click saves an edit. Esc and **Cancel** discard the changes. An outside click on a new entry does not add it.
- **Tint and symbol selects:** each option and the selected value show a preview before the name. The tint preview is a swatch with a border. It has the same fill as a band on the screen. The symbol preview is the filled symbol, as on the Gantt. The preview is decorative. Screen readers read only the name.
- **Milestone symbols:** diamond, flag, star, circle, triangle, square, hexagon, pentagon, map pin, bookmark and heart, in this order.
- **Stage legend:** the stage colors and titles.
- **Legend group (split view):** one Legends button beside the Timeline heading shows or hides Stages, Milestones and Bands together. It works with the keyboard and announces its expanded state.
  - The app keeps the collapsed state in this browser after a reload. An explicit stored value takes priority. Older viewer data without this setting starts with the legends collapsed only when the Timeline section is pinned. Refer to section 4.4. After this initial default, pin and unpin do not change the legend setting. It does not change plan data or undo history.
  - The three rows have the same 32 px minimum height and 12 px vertical gap. Long entries can wrap and increase the row height.
  - The Milestones and Bands add buttons use a 24 px target and a decorative 12 px plus icon. Their accessible names and actions stay the same.
  - Collapse and expansion animate the content and its spacing. Reduced motion uses immediate updates. Collapsed entries cannot receive focus. The chart gets the space that the legends used in the pinned section.
- **Legend rail (tabs):** with tabs, there is no Legends button. While the section is expanded, the legends show as one line of chips below the chart, in the section body. When the section is too short, the body scrolls to show them. The order is: stages, milestones with their "+" button, bands with their "+" button. The line does not wrap. It scrolls horizontally, and its end fades out when more chips follow. The chips keep the legend content, actions and accessible names. The Stages, Milestones and Bands lists keep their names. A milestone or band chip opens its dialog. The "+" buttons keep their names. The group names are not visible. Each chip is a target at least 24 px high. Keyboard focus on a chip scrolls the rail to show it.
- **Legends on sheets:** Preview and printed sheets always show the legends. The Legends button does not appear on sheets. The workspace layout and the legend setting do not change sheet content or pagination.
- **Pin:** in split view, a toggle beside the Timeline heading pins the whole Timeline section. The heading, chart and expanded legends stay together.
  - In split view, the pinned section stays at the top of the Plan pane. The Plan content below it scrolls under it. It never covers the Work plan pane.
  - The heights use the viewport height in split view and with tabs.
  - With tabs, the Timeline section is always pinned. It is the first part of the content, directly below the app header, and spans the full app width. It shows with both tabs and does not move when the selected group scrolls. The pin toggle and the Shorter and Taller buttons do not show. The stored pin state applies only in split view, and the tabs do not change it.
  - **Handle (tabs):** with tabs, one handle on the bottom edge of the section collapses, expands and resizes it. It is a full-width row 20 px high with a centered grip 36 × 4 px. The grip is decorative. The handle looks the same when the section is expanded and when it is collapsed.
    - The handle is a `button` with the id `timeline-collapse`. Its accessible name is "Collapse timeline" when expanded and "Expand timeline" when collapsed. It has `aria-expanded` and controls the section content. Its hint shows the same name. Its accessible description says that a drag or the arrow keys change the height.
    - The hit region spans the full width. When collapsed, it is the full 24 px strip (the stage edge and the handle row). When expanded, it is the 20 px handle row and 12 px of reserved space above it, below the legend rail. No legend chip is in this reserved space. The hit region never covers the content of the selected group.
    - A tap or a click collapses or expands the section. Enter and Space do the same, one time for each key press.
    - A pointer press becomes a drag when it moves 4 px or more from its start. Before that, the height does not change. After a drag, the release does not toggle the section, also when the pointer returns to its start. A canceled pointer or a lost pointer capture ends the drag and keeps the height of that moment.
    - A drag changes the height at once. A drag down from the collapsed state expands the section, at the minimum height or more. A drag up to less than half the minimum height collapses the section. Collapse does not change the stored height.
    - Up Arrow and Page Up make the expanded section shorter by 2 % and 10 % of the viewport height. Down Arrow and Page Down make it taller by the same steps. Home and End go to the limits. When collapsed, Down Arrow, Page Down and End expand the section to its stored height. Up Arrow, Page Up and Home do nothing.
  - **Collapsed strip (tabs):** when collapsed, the section is a strip below the app header: a 4 px stage edge above the handle. The heading, chart and legends are hidden and cannot receive focus. The strip has a soft shadow at its bottom edge.
    - The stage edge shows each stage as a segment in its stage color. The segment spans the stage dates (the earliest and latest dates of its tasks) inside the plan range. A later stage draws over an earlier stage where they overlap. Parts of the range without a stage show the border color. A stage without dates has no segment.
    - A today tick (2 px wide, 10 px high, foreground color) marks today on the edge. It is at the center of the day, like the today line in the chart. It does not show when today is outside the plan range.
    - The stage edge is decorative. The handle gives the text alternative.
  - Collapse and expansion animate the section height through `motionDuration(ms)`. The stage edge fades in and out with the same duration. Reduced motion makes them immediate. The selected group gets the space.
  - **Automatic collapse (tabs):** a scroll down of the selected group by the user collapses an expanded section. The scroll must be 48 px or more since the section last expanded or since the last scroll up. A scroll up by the user to the top of the group expands a section that collapsed automatically. Scrolls by the app (a restored scroll position, a label jump, the reveal of a focused element), a tab change and overscroll do not collapse or expand the section. This uses the same user-input rules as the floating island (section 5.1).
    - The count of 48 px starts again from zero after these events: a scroll by the app, a tab change, and a collapse or expansion by the user. A user scroll while **Keep open** is on, or while keyboard focus is in the section content, also sets the count to zero.
    - An automatic collapse does not happen when the group cannot scroll down 48 px more after the collapse. This prevents a loop of collapse and expansion.
    - An automatic collapse does not change `timelineCollapsed`. After a reload, the section starts expanded unless the user collapsed it.
    - A collapse by the user (the handle, a drag or the keyboard) stays until the user expands the section. A scroll to the top does not expand it.
    - When keyboard focus is in the section content, an automatic collapse does not happen. The app uses `:focus-visible` to identify keyboard focus. Focus that stays on a control after a pointer click, such as the Keep open toggle, does not prevent an automatic collapse.
    - A height change of the section can change the scroll position of the group. The app does not count this change as a user scroll, for the automatic collapse and for the size of the floating island.
    - After an automatic expansion, a focused element in the group stays visible below the section at its final height.
    - When the user prefers reduced motion, automatic collapse still happens, but the height changes at once.
  - **Keep open (tabs):** a toggle at the end of the heading row keeps the section open on scroll. It is a toggle button with a pin icon and the accessible name "Keep timeline open". It has `aria-pressed`. The pin icon is filled when the toggle is on. When it is on, the scroll does not collapse the section. The handle still collapses and expands it. The app keeps the setting after a reload (section 4.4). The split view pin does not change it, and it does not change the split view pin.
  - With tabs, the expanded section has 16 px of space above the heading row. This is the same as the pane padding at the sides. The app adds this space to the section height from `ganttHeight`, so the chart and the legends keep their space. The heading row is 24 px high and has no space below it. The collapsed section does not have this space. The Keep open toggle is a 24 × 24 px target.
  - The app keeps the collapsed state after a reload (section 4.4). Split view does not use it. When focus is in the section content and the section collapses, focus moves to the handle. When a layout change hides a focused Timeline control, focus moves to the handle with tabs and to the pin toggle in split view. These controls are the pin toggle, the Keep open toggle, the Shorter and Taller buttons, the Legends button, a legend entry, the handle (tabs) and the resize separator (split view). Focus in the Timeline does not change the selected tab when the layout changes to tabs.
  - Pin and unpin do not create the chart again. The chart keeps its scroll position when the content still overflows. Otherwise it uses the nearest possible position.
  - `ganttHeight` gives the section height. The default is 35 % of the viewport. The maximum is 50 %, or 40 % with tabs. The minimum is 120 px, or the maximum when the maximum is less than 120 px. With tabs, the expanded section also has the 16 px space above the heading row.
  - Pin and unpin animate the section height in Chromium, Safari and Firefox. The chart, legends and the content below follow the height without a jump at the start or end. All motion durations use `motionDuration(ms)`. Reduced motion makes the change immediate. Drag resize stays immediate.
  - The chart content scrolls vertically. If the chart and legends do not fit in the section, the section body also scrolls. The heading stays visible. In split view, the pin toggle also stays visible.
  - In split view, a resize separator on the bottom edge changes the height of the whole section. It spans the width of the Plan pane. The heading, chart and legends keep their content width. The resize separator appears only when pinned. With tabs, the handle applies (see above). The resize separator and the handle do not appear in Preview or print.
  - The resize separator is a `separator`. Its keys and steps are the same as for the expanded handle (see above): Up Arrow, Down Arrow, Page Up, Page Down, Home and End. The height stays within the limits.
  - While pinned in split view, two icon buttons beside the pin provide the same 10 % step. Their accessible names are "Make timeline shorter" and "Make timeline taller". The Shorter button is disabled at the minimum height. The Taller button is disabled at the maximum height. Each press stops at the applicable limit. Both buttons support keyboard activation and have a target of at least 24 × 24 px. Their icons are decorative. The names use the UI language.
  - The buttons appear and disappear with a transition through `motionDuration(ms)`. The Legends button stays in position. Button resize uses the same height transition as keyboard resize. Reduced motion makes these changes immediate. The buttons are hidden while unpinned and do not appear in Preview or print.
  - The app keeps the pin state and section height after a reload.
  - Scroll-into-view and keyboard focus in the Plan pane stop below the pinned section. This focus offset does not apply to elements inside the pinned section.
  - The pinned section does not cover the Work plan content. In split view, sticky stage headers, table headers and label jumps in the Work plan use the top of the Work plan pane as their offset. With tabs, they use the bottom of the Timeline section.
  - The pin state does not change the sheets, pagination, Preview or print.

### 5.5 Stage overview

- The number of cards in a row depends on the width of the Stage overview section, not the viewport: three cards from 720 px, two cards from 480 px, one card below 480 px. More cards go to the next row. Cards in a row have the same height. The sheets keep three cards for each row.
- A card shows "STAGE N · months", the title, the description and the derived deliverables.
- The title: click to edit. Workspace limits: single line, required, max 30 characters. Empty → "Stage N".
- The description: click to edit. Free text. The sheets limit it to 3 lines.

### 5.6 Work plan

- **Stage header:** a color swatch (a picker), "Stage N · Title (months)" and "x / y done · z in progress". Hide the in-progress part when z is 0. Animate both counts. Use the same text on printed sheets. Keep the word order and punctuation in translation messages. Click the title to edit it. When the header is too wide for the screen, the progress and the stage menu move to a second line.
- **Sticky stage headers:** while a stage scrolls, its header stays at the top of the Work plan region: the top of the Work plan pane in split view, or below a pinned Timeline section with tabs. The header stays within its stage. It scrolls out when the stage ends.
  - The app header and a pinned Timeline section stay above every stage header throughout scrolling. This includes the outgoing header when the next stage takes its place. Stage headers do not cover their content or controls.
  - From a stage width of 640 px, the table column headers and their color band stay below the stage header. Their offset uses the current stage header height.
  - Below a stage width of 640 px, the separate color band stays below the stage header. The table still scrolls sideways. Its column headers stay in the table.
  - The stage title, color picker, progress and menu stay available while the header is sticky. The header has an opaque background.
  - A jump from a pinned Timeline label shows the task below its stage header and any sticky table column headers.
  - Keyboard focus on a task control clears the stage header and any sticky table column headers.
  - Preview and printed sheets keep their existing headers, content and pagination. Sticky workspace headers do not appear on sheets.
- **Color picker:** a curated palette of 8 colors. The picker shows a warning when two stages have similar colors. A new stage gets the next unused color.
- **Stage order:** a drag handle (it also works with the keyboard), and **Move up** and **Move down** in the stage menu.
- **Add stage:** a "+" line between two stages and after the last stage. It adds an empty stage. An empty stage stays after blur.
- **Delete stage…:** in the stage menu. The confirmation shows the effect, for example "Tasks deleted with the stage: 5. Other tasks that depend on them: 2." The app deletes the tasks of the stage. You can undo it.
- **Columns:** Status | Task | Deliverable | Target | Owner | "…".
- **Status:** a compact select with an icon. An empty circle means Todo. A half-filled circle means In progress. A check-circle means Done. A circle with a slash means Canceled. The options are Todo, In progress, Done and Canceled, in this order. They show the icon and label. The trigger has a status hint and an accessible name with the task and status. Only done and canceled rows are dimmed, and their titles are struck through. A parent shows its derived status in a disabled select. Its hint wrapper gets keyboard focus.
- Each status change uses `updateTask` and adds one undo step. Opening or closing the select, or selecting the current value, adds no step. Undo and redo restore the status. The select uses standard keyboard controls: Enter or Space opens it, arrows move between options, Enter selects, and Escape closes it. Focus returns to the trigger.
- **Target:** shows the `end` date, or "start –" when only the start is set. This rule is the same for all rows and on the sheets. Hover shows the full range. Click opens the date picker. It can be empty. A parent shows its stored planned window. Its dates are editable within the subtask limits below.
- **Owner:** chips with suggestions from all owners of the plan. "+N" shows when the chips do not fit. A parent shows its stored owners. Its editor has no remove button for an owner that a subtask uses. It compares these names without case, after trimming. Other owners can be removed, and new owners can be added. The chip menu has **Rename everywhere…**. This renames the owner in all tasks of the plan.
- **Parent date limits:** the start must be no later than the earliest subtask start. The end must be no earlier than the latest subtask end. Empty subtask dates do not count. A parent date cannot be cleared when a subtask has that date. When both parent dates are set, the range must contain every subtask date, including a start-only or end-only date. An open range can stay open if it meets the start and end limits. The calendar marks the subtask range (earliest to latest subtask date) with a bar under the days. A legend below the calendar shows this range and describes the calendar. All dates stay available. A typed or calendar range that breaks a limit shows an alert with the required range and disables **Done**. A start-only calendar pick waits for the end: it shows the alert only when the start is after the earliest subtask date. **Done** stays disabled until the range meets the limits. If subtask dates change while the editor is open, the app checks the draft against the new limits. It keeps any typed-date error. An ordinary close discards this invalid draft. Esc cancels any draft. Focus returns to the trigger after dismissal.
- **Tasks and subtasks:** a parent has a chevron. Other tasks have a spacer, so the titles align. Subtask rows indent the title cell only.
- **Add task:** a "+" line at the end of the stage. It starts at the task indent.
- **Add subtask:** a "+" line after the last subtask of a parent. It starts at the subtask indent. It shows when the task or one of its subtasks has hover or focus. On a task without subtasks, it adds the first subtask and expands the task.
- The two "+" buttons are on the same vertical axis (the center of the visible width, also on a phone where the table scrolls). The two lines are on different rows, with a vertical gap between them.
- **Empty rows:** the app removes a new row that is empty on blur.
- **"…" button:** opens the task dialog.

### 5.7 Task dialog

The title of the dialog in the UI is "Task details" ("Subtask details" for a subtask).

- The dialog shows all fields of the task: title, deliverable, range, owners, status, note, dependencies.
- The status uses the same select as the table. The dialog trigger shows the icon and label, so it has no status hint. A parent shows its derived status in a disabled select. The hint wrapper adds no tab stop.
- Parent dates and owners use the same editors and subtask limits as the table.
- It also shows **Stage** and **Parent**.
  - **Stage** moves a task and its subtasks to a different stage.
  - **Parent** is "None (task)" or another top-level task in the same stage, with or without subtasks. "None (task)" changes a subtask to a task. A task without subtasks can become a subtask. A task with subtasks cannot become a subtask.
  - A parent change can open the move-conflict dialog (section 3.3).
- **Note:** plain text. Type "@" to mention a task.
- **Dependencies:** a mention picker. Type words to filter. Enter selects. The app hides candidates that break a structure or scope rule, or are already effective dependencies. Cycle and date candidates stay selectable. Unwarned options come first, then warned options. Each part keeps the grouping and order below. Warning icons, hints and accessible names give all reasons: "Makes a dependency cycle." and "Starts after this task ends." A subtask lists only siblings. A plain help line above the input says: "To depend on another task, make this subtask a task, or move it under the same parent." The input uses this help as its accessible description. A task lists tasks in plan order, with candidate subtasks indented after each task. Each subtask shows its parent title as secondary text. Candidate subtasks stay visible when their parent is not a candidate. Search matches the subtask title or parent title. The limit is eight options in total. When the list opens, the dialog scrolls so that the full list is visible. Subtasks show inherited dependencies as read-only chips. The source appears in a hint and in the accessible name. Inherited chips also show the warnings on the parent-stored dependency.
- Each field saves on blur.
- **OK** closes the dialog. **Delete…** opens a confirmation that shows the effect, for example "Subtasks deleted with the task: 2. Other tasks that depend on it: 3. The app removes their links."
- Esc closes the dialog. The focus stays in the dialog while it is open. On close, the focus goes back to the "…" button of the task row.

### 5.8 Remarks

- A remark section has an editable title and bullets.
- On the sheets, remark sections come after all stages. In the workspace, they are at the end of the Plan group.
- Two remark sections for each row when the Remarks section is 640 px wide or more. One for each row below 640 px. The width is the section width, not the viewport width.
- A "+" line in a remark section adds an empty bullet. Enter at the end of a bullet adds the next bullet. Backspace on an empty bullet removes it.
- The app trims spaces and removes empty bullets on blur.
- A "+" line after the last remark section adds a remark section. Its title is in edit mode. The app removes a new remark section on blur when its title and bullets are empty.
- Remark sections have a drag handle (it also works with the keyboard), and **Move up** and **Move down** in their menu.

### 5.9 Footer

- On the screen, the footer fields are in the Header (section 5.3, **Sheet footer**). The workspace has no footer at the end of the page. On the sheets, the footer stays at the bottom of each page.
- **Left:** note · version · date. Three fields. The sheets hide empty parts.
- **Right:** a note and the page number. The app calculates the page number.
- The plan stores these fields one time. All pages show the same values.
- The date picker has a **Today** button. It puts the current date in the field. **Done** saves it. The app does not set the date automatically.
- The page number shows only on the sheets (section 7). The workspace does not show a page number.

### 5.10 Hints

- Controls and status marks show their hints in a tooltip. Examples: the header buttons, the "+" buttons, the pin and height buttons of the timeline, the Timeline handle and the Keep open toggle, the Gantt labels, bars, points, milestones and bands, the stage color swatches, the ready light and the derived status of a parent.
- The app does not use the native `title` attribute. A unit test checks this.
- A tooltip opens on hover. On an element that can get keyboard focus, it also opens on keyboard focus. The controls, the Gantt bars and points, and the derived status select of a parent in the work plan get keyboard focus. Other status marks do not get a tab stop: the ready light, the Gantt outside markers, the dependency warnings and inherited dependencies, and the derived status select in the task dialog.
- The text alternative stays in the `aria-label`. When the hint gives more information than the name, the app gives this information to assistive technology too. For example, a Gantt label has the hint "Title: Show in the work plan" as its accessible description. A stage color swatch that another stage uses has "Another stage uses this color." in its accessible name.
- An owner field with more owners than chips shows the full owner list as its hint.
- Preview and printed sheets show no hints.
- Components show hints with `Hint.svelte` in `src/lib/components/app/`. It wraps the tooltip primitive.

### 5.11 Delete confirmations

- Plan, stage, task, remark section, band and milestone deletion use one shared confirmation component. Each caller supplies the title, body and delete action.
- The dialog has **Cancel** and a destructive **Delete** button. Cancel and Esc close the confirmation without deletion. Focus stays in the dialog while it is open. Closing it keeps the existing focus return behavior of its caller.
- Each body states the same deletion effects as before. Stage and remark section bodies include the name in the translated message. The English text starts with "The app deletes “{name}”." Counts, dependency cleanup and undo behavior stay unchanged.

## 6. Language

- The **UI language** is a viewer setting. The app saves it under `taktblatt:locale`. An import never changes it.
- Choose the UI language under **Menu → Language**. The selected language is the language this tab shows. Choosing a language closes the menu before a reload or a confirmation dialog. Canceling the dialog returns focus to the Menu button.
- The first UI language comes from the browser language list. The app uses the first supported language in the list. A region variant matches its base language (`de-AT` gives `de`). `zh-Hant` and `zh-TW`, `zh-HK` and `zh-MO` give `zh-TW`. Simplified or unspecified Chinese and all other languages give English. The app saves the detected language on the first visit. A later change of the browser language has no effect.
- There is one language: the UI language. It controls the texts, the date formats and the printed labels (for example "Objective:", "Timeline", the column titles). A plan has no language setting.
- Plan files are language-neutral. Dates are stored as ISO `YYYY-MM-DD`. The app formats them with the UI language when it shows or prints them. The same file shows and prints in German for a German UI and in Japanese for a Japanese UI.
- An old file or stored plan can still have a `locale` key. The app ignores the key and does not write it again.
- A change of the UI language reloads the page, also in other open tabs. The reload clears the undo history (section 4.5) and drops the draft of an open dialog.
- When a reload would drop something (undo or redo history, or an open dialog with a draft), the app asks first in a dialog. **Cancel** keeps the language. In another tab, the dialog says that the language changed there. **Not now** (or **Esc**) keeps that tab in its current language until it reloads. A text field with the focus commits first. The print preview is not a draft. If the other tab changes back to the language of this tab, the question closes without a reload. When nothing would be dropped, the language changes at once.
- Supported languages: English (`en`), German (`de`), Traditional Chinese (`zh-TW`), Japanese (`ja`).
- English is the source. A missing key falls back to English.
- The `de`, `zh-TW` and `ja` texts are machine drafts. A native speaker must review them.
- Dates use `Intl`. Weeks start on Monday.
- Messages control punctuation, spaces and word order when a label combines text with a name, value, qualifier or status clause. This applies to visible labels, hints, accessible names and printed labels. Traditional Chinese uses `·` (U+00B7) between a name and a qualifier. Japanese uses `・` (U+30FB). Accessible names for Gantt bars and points join status and clipping clauses with localized clause punctuation (English and German: `, `; Traditional Chinese: `，`; Japanese: `、`), not conjunctions.
- Complete warning sentences use `joinSentences()`. English and German sentences have one space between them. Japanese and Traditional Chinese sentences have no space between them. Each message contains its final punctuation.
- User-facing item lists use `joinList()`, which formats the list with `Intl.ListFormat` for the UI language. This includes owner lists on screen and on sheets. Stored owner arrays stay unchanged.

## 7. Preview and print

Printed work tables use the Status header and the same four status icons in paper ink. Each icon has screen-reader text for its status. Only done and canceled rows are muted. Stage progress uses the same text as the workspace.

- **Preview** shows the plan as paper sheets. It is read-only. Preview and print use the same output.
- Print keeps the fills of task bars, task points, bands and legend swatches when background graphics are off in the print dialog. Dependency lines connect to the same visible task marks as in Preview.
- The sheets use their own print blocks in `src/lib/components/print/`. The print blocks read the same store and the same domain helpers as the workspace. Refer to [ADR 8](adr/0008-print-blocks.md).
- **Menu → Print…** opens the preview as a full-screen dialog. **Esc** closes it. The focus goes back to the Menu button. The workspace behind it is inert. No control in the app header or in the menus opens the print dialog directly. The print dialog opens from the **Print** button of the preview or from **Cmd/Ctrl+P**.
- The preview has a **paper size** control (A4 or US Letter) and a **Print** button. The paper size is a plan setting (`paper`). The default is A4. A change is one undo step.
- The **paginator** measures blocks and puts them on fixed sheets. It works the same in all browsers.
  - Page 1 is the overview: header, objective, timeline, legends, stage overview.
  - When the Gantt has too many rows, it continues on the next pages. Each page repeats the month header. The milestone row shows on the first page only.
  - The work plan starts on a new page.
  - A stage header always stays with its first two rows (or with its only row). When a table continues on the next page, the table header repeats.
  - Remarks come after all stages.
  - Each page has the footer with "n / N".
  - The paginator splits only between Gantt rows, table rows, rows of stage cards and rows of remark sections. A block that is taller than a sheet gets its own sheet. The sheet clips the part that does not fit.
- The labels and dates on the sheets use the UI language.
- A dependency line shows on a sheet only when both of its rows are on that sheet.
- Print (**Cmd/Ctrl+P** or the **Print** button of the preview) always prints the paginated sheets with `@page { size: <paper>; margin: 0 }`. If the preview is not open, Cmd/Ctrl+P renders the sheets first and then opens the print dialog. `beforeprint` is the fallback for other ways to print (for example the browser menu). The app removes the sheets on `afterprint` or when the print media ends, and at the next input of the user if neither comes. A render error gives an empty print, not an error page. The app never prints the workspace layout.
- **Print expand state:** print uses the current expand state.
- **Print today line:** the line uses the footer date. When the footer date is empty, it uses today.
- Print has no animations and no controls.

## 8. Motion

- Elements that come in or go out use Svelte transitions.
- The app uses `animate:flip` when the task order changes.
- Numbers and geometry use `Tween` or `Spring`: progress counts, bar positions, the range rescale. When the range changes, the Gantt bars, points, milestones, bands, month ticks and today line move with the same tween as the rows.
- Durations are 150 – 300 ms, ease-out. There are two exceptions: the row flash after a jump from the Gantt is 1200 ms, and the pulse of the ready light is 900 ms.
- All durations go through `motionDuration(ms)`. This includes CSS transitions and animations. A CSS transition that uses the default duration of 150 ms also sets its duration through `motionDuration(150)`.
- When the viewer selects `prefers-reduced-motion`, the app disables motion.
- Preview and print have no motion.

## 9. Visual language (screen and print)

- Screen themes use a white ground and `#1A1D23` ink in light mode. Dark mode uses `#13161A` ground and `#E7E9EC` ink. Focus rings use the ink color. The shared theme colors are in `src/lib/theme-colors.ts`. `src/lib/theme.ts` exports the same values for browser use.
- Font: Source Sans 3, self-hosted. Dates, counts, and targets use tabular figures.
- Ink `#1A1D23`. Secondary text `#505663` and `#5A6070`. Rules `#C9CDD4` and `#DDE0E5`. Neutral fill `#EEF0F3`.
- The ready light uses the paper color token `--color-paper-ready`, with value `#2E9D5B`. Preview and print use this token in every screen theme.
- Cycle lines and arrowheads use `--color-paper-warning`, with value `#C8352D`. Its contrast against white paper is 5.25:1. It passes WCAG AA for normal text and graphics. The screen uses the `destructive` token.
- Stage palette: 8 colors. Each light value has a contrast of at least 4.5:1 against white. Each dark value has a contrast of at least 6:1 against the dark ground (`#13161A`). Stage badge text is white in light mode and `#13161A` in dark mode. Band palette: 4 light tints. Dark band tints use the dark stage values at 14% opacity. Gray uses white at 7% opacity.

## Future: Kanban

Kanban cards are leaves only. Canceled items are not on the board. The column comes from the one board-column calculation (`boardColumn`): Blocked, Todo, In progress, or Done. Todo contains ready items. Blocked contains blocked items. An item with status `in_progress` stays in In progress. A Kanban view is not part of this change.

## 10. Quality

- TypeScript strict mode. ESLint. Prettier.
- Vitest unit tests in two projects. The `server` project runs the `*.spec.ts` files in Node. It covers the domain logic: derived values, sort, dependency validation, move conflicts, ready light, schema, migration, import, pagination. The `client` project runs the `*.svelte.spec.ts` files in Chromium. It covers the store, commands and undo history.
- Playwright end-to-end tests in `e2e/` for the main flows, the offline app (PWA) and the pagination of the sheets.
- GitHub Actions run `pnpm lint`, `pnpm check`, the unit tests and the end-to-end tests in separate jobs. They run on each pull request, on each merge queue entry and on each push to `main`. The `CI passed` job fails when one of these jobs does not succeed. If the end-to-end tests fail, the workflow keeps the Playwright results for 7 days.
- The branch protection rule for `main` requires the `CI passed` check before a merge. Refer to ADR 11.
- Dependabot updates `npm` and `github-actions` every week. Dependabot groups minor and patch updates. Major updates have separate pull requests.
- License: MIT.
