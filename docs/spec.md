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
	done: boolean;
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

## 2. Derived values

The app calculates a **derived value** from other data. The user cannot edit a derived value directly. Each derived value has one calculation. All views use the same calculation.

| Value                   | Rule                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parent `start`          | The earliest `start` of its subtasks. The app skips empty values. All empty → empty.                                                                                                                  |
| Parent `end`            | The latest `end` of its subtasks. The app skips empty values. All empty → empty.                                                                                                                      |
| Parent `owners`         | The union of the owners of its subtasks.                                                                                                                                                              |
| Parent `done`           | All subtasks done → done. Some subtasks done → indeterminate. No subtasks done → not done.                                                                                                            |
| Parent fallback         | The parent keeps its own `start`, `end`, `owners` and `done` in storage. The app hides these values while the parent has subtasks. The app shows them again when you delete or move the last subtask. |
| Task order              | Tasks sort by `start` in their stage. Subtasks sort by `start` in their parent. Ties sort by `createdAt`. Tasks or subtasks without `start` go last.                                                  |
| Sort time               | The app sorts after a commit (blur, Enter, picker close). It does not sort while you type. The app animates the new order (FLIP).                                                                     |
| Milestone labels        | The app numbers milestones M1 … Mn by date order.                                                                                                                                                     |
| Stage number            | "Stage N". N is the position of the stage in the stage order.                                                                                                                                         |
| Stage months            | The months from the earliest `start` to the latest `end` of the tasks in the stage. One month: "Nov". More months: "Nov – Dec". The app hides the months when no tasks have dates.                    |
| Stage deliverables      | The list of task deliverables of the stage, in task order. The app skips empty values.                                                                                                                |
| Stage progress          | "x / y done". y is the number of tasks in the stage (not subtasks). x is the number of done tasks.                                                                                                    |
| Page numbers            | "n / N". The paginator calculates these values (section 7).                                                                                                                                           |
| Tab title and file name | The tab title is the heading. The export file name is `taktblatt-<heading-slug>-<YYYY-MM-DD>.json`. The date is the export date.                                                                      |

## 3. Dependencies

### 3.1 Stored and effective dependencies

- A task or subtask stores its **own dependencies** in `dependsOn`. The app stores ids. The app shows the current titles.
- The **effective dependencies** of a subtask are its own dependencies.
- The effective dependencies of a parent are the union of its own dependencies and the dependencies of all its subtasks. The app excludes dependencies that point at its own subtasks.
- The task dialog shows the inherited dependencies of a parent as read-only chips. Each chip shows the subtask that it comes from.

### 3.2 Validation

The app uses the effective graph for all checks.

1. A task cannot depend on itself.
2. A task cannot depend on its parent or on its own subtask.
3. The graph must not have a cycle.
4. **Date rule:** A cannot be a dependency of B if `A.start > B.end`. If one of these dates is empty, the rule does not apply.

- The dependency picker hides the candidates that break a rule.
- A date change can break the date rule. The app does not remove the dependency. It shows a warning on the dependency.
- When you delete a task, the app removes the task from all `dependsOn` lists. It also removes all mention tokens for the task.

### 3.3 Move conflicts

A **move** changes the stage or the parent of a task or subtask (section 5.6).

- A stage move does not change the effective graph or any date. It never causes a conflict.
- A parent change can cause conflicts. Before the move, the app shows the **move-conflict dialog**. The dialog lists:
  - **Remove dependency (cycle):** each own dependency that causes a cycle for the task or subtask that you move.
  - **Remove dependency (parent and child):** a dependency of the new parent on the task or subtask that you move.
  - **Clear date:** the `start` or the `end` of the task or subtask that you move. The app lists it when the new derived dates of the new parent break the date rule.
  - **Warning only:** date-rule breaks on the old parent. The app does not change data for these. It shows the usual warning after the move.
- The dialog has two buttons: **Remove and move** and **Cancel**. When the move has only warnings, the first button is **Move**.
- **Remove and move** applies all listed removals and the move as one undo step.
- **Cancel** does not change data.

### 3.4 Ready light

- A **ready light** is a small green dot. It shows that the task can start.
- The ready light is on when all these conditions are true:
  - The task has one or more effective dependencies.
  - All effective dependencies are done. For a parent dependency, the app uses its derived `done`.
  - The task is not done.
- The planned `start` date has no effect on the ready light.
- The ready light shows before the title in the table, before the Gantt label, in the task dialog and on the sheets.
- In the table, the Gantt labels and the sheets, the ready light has a fixed slot before the title. When the light is off, the slot stays empty. Thus the first letters of the titles at the same level stay aligned, and a title does not move when the light comes on.
- In the task dialog, the app renders nothing when the ready light is off.
- It has a tooltip and an `aria-label`, for example "Ready: all 3 dependencies done".
- When it comes on, it fades in with one soft pulse.

## 4. Storage and state

### 4.1 Plans

- The app keeps more than one plan. One plan is active.
- The header has a plan switcher. With the switcher, you can create, rename, duplicate and delete plans.
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

- The app saves automatically after each commit.
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
- whether the Timeline legends are collapsed.

The app keeps the expanded tasks and the Timeline settings as `expanded`, `ganttPinned`, `ganttHeight` and `timelineLegendsCollapsed` under the key `taktblatt:ui`. The UI language is under `taktblatt:locale`. The screen theme is under `taktblatt:theme`.

An explicit stored boolean for `timelineLegendsCollapsed` takes priority over the pin state. If this field is absent from valid older viewer data, the legends start collapsed when `ganttPinned` is `true`. They start expanded when `ganttPinned` is `false` or absent. With no stored data, the legends start expanded and the Timeline section starts unpinned. Unreadable or invalid viewer data gives these defaults.

### 4.5 Undo

- The app keeps one undo history in memory for the active plan. The history keeps 50 steps.
- One commit is one step: a blur, Enter, a checkbox, a picker, a dialog action, a move.
- **Cmd/Ctrl+Z** undoes. **Shift+Cmd/Ctrl+Z** and **Ctrl+Y** redo.
- The app clears the history when you switch to a different plan, when another browser tab changes the active plan, after an import, when you change the UI language (the page reloads, see section 6), and when you reload the page.

### 4.6 Import and export

- **Export this plan** writes a `PlanFile`.
- **Export all plans** writes a `BackupFile`. The file name is `taktblatt-backup-<YYYY-MM-DD>.json`. The date is the export date.
- Import accepts both kinds. The app validates the file. If the file is not valid, the app shows the errors and does not change data.
- Import rejects duplicate ids in the stages, tasks, milestones, bands or remark sections of a plan. It also rejects a dependency between a parent and its own subtask. It also rejects a cycle in the effective dependency graph. Refer to [data-model.md](data-model.md) for all import rules.
- Import permits date-rule conflicts and shows warnings for them.
- Import adds each plan as a new plan. The last imported plan becomes active. A toast confirms the import. If dependencies break the date rule, a second toast shows the number of warnings. Import is not an undo step.
- If the browser cannot save the data, import undoes its own writes and shows an error.
- If a plan with the same `id` exists, one dialog lists all such plans. Each plan has the choices **Replace** and **Keep both**. The default is **Keep both**. **Replace** overwrites the existing plan with the same `id`. **Cancel** imports nothing. **Keep both** gives the copy a new id and adds the copy suffix to its heading. The suffix follows the UI language (English: " (copy)").
- If the file is not valid, a dialog lists the errors (the first eight, and the number of other errors).

## 5. Screen: the workspace

### 5.1 Layout

- The workspace is one page that scrolls. The parts are: Header, Timeline (Gantt), Stage overview, Work plan, Remarks.
- The sticky app header has a second row, **Plan sections**. It is a navigation with a link to each part.
- The first row of the app header contains: plan switcher, Preview, Print, Import, Export, Undo, Redo and Settings.
- All edit controls fit at widths of 768 px or more. On a phone, you can read the plan, edit text and dates, and mark tasks done. The Gantt and the table scroll horizontally.
- The **Settings** menu has two labeled radio groups. **Theme** has three choices: **Light**, **Dark** and **System**. A separator comes before **Language**, which has **English**, **Deutsch**, **繁體中文** and **日本語**. Each group heading has a decorative icon: a sun and moon for **Theme** and a language icon for **Language**. Each group shows its selected choice with a check mark. The menu supports pointer and keyboard input. Its labels use the UI language. The header has one Settings button with a gear icon.
- The default theme is **System**. It follows changes to the system theme while the app is open. **Light** and **Dark** override the system theme.
- A theme change applies at once. It does not reload the page, change plan data or clear the undo history. The app saves the choice in this browser. It restores the choice after a reload, also offline. An import does not change it.
- Preview sheets and printed sheets are always light. The Preview dialog controls use the screen theme.
- The browser and PWA theme-color metadata follows the resolved screen theme, including an explicit light or dark choice.
- A startup script in the page shell applies the saved theme and the theme-color metadata before the first paint. The app does not show the wrong theme while it starts. If the browser blocks storage, the script uses **System**.
- The Settings button shows its name in a tooltip, as the other header buttons do.

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

### 5.4 Timeline (Gantt)

- One row for each task. The rows use the same data as the table.
- A parent row has a chevron. Expanded rows show the subtasks as thinner, lighter bars.
- A task needs a **valid range** (start and end set, start ≤ end) to show a bar.
- A task with only one date shows a point marker at that date.
- A task with no dates shows the title and a muted "No dates" cue.
- A task with a start after its end shows a muted "Start is after end" cue. It has no bar.
- The app clips a bar outside the window at the edge. The clipped edge has a mark.
- A task fully outside the window has no bar. A chevron at the near edge shows the side.
- Done tasks have a muted bar and label.
- Bars are read-only. You edit dates in the table or in the task dialog.
- **Labels:** click a label to scroll to its table row. The row flashes one time. You cannot edit a label in the Gantt.
- **Linked highlight:** hover or focus on a table row highlights its bar. Hover or focus on a bar highlights its row. When you pin the Timeline section, the app scrolls the chart to show the bar.
- **Today line:** a dashed line with a "Today" label, behind the bars. It uses the local date of the viewer. The app hides it when the date is outside the range.
- **Dependency lines:** thin lines behind the bars. No lines go to or from a task without a drawn range or point. When you expand a parent, the lines connect to the subtask that owns the dependency. When you collapse a parent, the lines connect to the parent bar. The app merges duplicate lines. The lines move with an animation when you expand or collapse. Lines from a done row use 40% opacity, the same as done bars. This also applies in Preview and print. For a parent row, the app uses its derived done state.
- **Bands:** any number. Each band has a title, a range and a tint. Bands have a transparent tint, so you can see each band where their ranges overlap. The legend shows "Title (start – end)". A "+" at the end of the legend opens a small dialog (title, range, tint). Click a band or its legend entry to edit it. The dialog has **Delete…**, with a confirmation.
- **Milestones:** a symbol on the milestone row. The legend shows "M1 Title (date)". A "+" after the legend opens a small dialog (title, description, date, symbol). Click a milestone or its legend entry to edit it. The dialog has **Delete…**, with a confirmation.
- **Milestone and band dialogs:** an outside click saves an edit. Esc and **Cancel** discard the changes. An outside click on a new entry does not add it.
- **Tint and symbol selects:** each option and the selected value show a preview before the name. The tint preview is a swatch with a border. It has the same fill as a band on the screen. The symbol preview is the filled symbol, as on the Gantt. The preview is decorative. Screen readers read only the name.
- **Milestone symbols:** diamond, flag, star, circle, triangle, square, hexagon, pentagon, map pin, bookmark and heart, in this order.
- **Stage legend:** the stage colors and titles.
- **Legend group:** one Legends button beside the Timeline heading shows or hides Stages, Milestones and Bands together. It works with the keyboard and announces its expanded state.
  - The app keeps the collapsed state in this browser after a reload. An explicit stored value takes priority. Older viewer data without this setting starts with the legends collapsed only when the Timeline section is pinned. Refer to section 4.4. After this initial default, pin and unpin do not change the legend setting. It does not change plan data or undo history.
  - The three rows have the same 32 px minimum height and 12 px vertical gap. Long entries can wrap and increase the row height.
  - The Milestones and Bands add buttons use a 24 px target and a decorative 12 px plus icon. Their accessible names and actions stay the same.
  - Collapse and expansion animate the content and its spacing. Reduced motion uses immediate updates. Collapsed entries cannot receive focus. The chart gets the space that the legends used in the pinned section.
  - Preview and printed sheets always show the legends. The Legends button does not appear on sheets. The workspace setting does not change sheet content or pagination.
- **Pin:** a toggle beside the Timeline heading pins the whole Timeline section below the app header. The heading, chart and expanded legends stay together.
  - The default height of the whole section is 35 % of the viewport. The maximum is 50 %. The minimum is 120 px, or 50 % when the viewport is shorter than 240 px.
  - Pin and unpin animate the section height in Chromium, Safari and Firefox. The chart, legends and page layout follow the height without a jump at the start or end. All motion durations use `motionDuration(ms)`. Reduced motion makes the change immediate. Drag resize stays immediate.
  - The chart content scrolls vertically. If the chart and legends do not fit in the section, the section body also scrolls. The heading and pin toggle stay visible.
  - A handle on the bottom edge changes the height of the whole section. Its divider and resize target span the full app width, up to the scrollbar. The heading, chart and legends keep their content width. The divider appears only when pinned. It does not appear in Preview or print.
  - The handle is a `separator`. The arrow keys, Page Up, Page Down, Home and End also change the height. Page Up makes the section shorter by 10 % of the viewport height. Page Down makes it taller by the same step. The height stays within the limits.
  - While pinned, two icon buttons beside the pin provide the same 10 % step. Their accessible names are "Make timeline shorter" and "Make timeline taller". The Shorter button is disabled at the minimum height. The Taller button is disabled at the maximum height. Each press stops at the applicable limit. Both buttons support keyboard activation and have a target of at least 24 × 24 px. Their icons are decorative. The names use the UI language.
  - The buttons appear and disappear with a transition through `motionDuration(ms)`. The Legends button stays in position. Button resize uses the same height transition as keyboard resize. Reduced motion makes these changes immediate. The buttons are hidden while unpinned and do not appear in Preview or print.
  - The app keeps the pin state and section height after a reload.
  - Section links, sticky table headers and Gantt label jumps use the height of the whole pinned section as their offset.
  - When keyboard focus moves to an element below the pinned section, the app keeps that element fully below the app header and the pinned section. This focus offset does not apply to elements inside the pinned section.
  - The pin state does not change the sheets, pagination, Preview or print.

### 5.5 Stage overview

- Three cards for each row from 768 px. One card for each row below 768 px. More cards go to the next row. Cards in a row have the same height.
- A card shows "STAGE N · months", the title, the description and the derived deliverables.
- The title: click to edit. Workspace limits: single line, required, max 30 characters. Empty → "Stage N".
- The description: click to edit. Free text. The sheets limit it to 3 lines.

### 5.6 Work plan

- **Stage header:** a color swatch (a picker), "Stage N · Title (months)" and "x / y done". Click the title to edit it.
- **Sticky stage headers:** while a stage scrolls, its header stays below the app header and the pinned Timeline section. The header stays within its stage. It scrolls out when the stage ends.
  - From a stage width of 640 px, the table column headers and their color band stay below the stage header. Their offset uses the current stage header height, including wrapped text.
  - Below a stage width of 640 px, the separate color band stays below the stage header. The table still scrolls sideways. Its column headers stay in the table.
  - The stage title, color picker, progress and menu stay available while the header is sticky. The header has an opaque background.
  - A jump from a pinned Timeline label shows the task below its stage header and any sticky table column headers.
  - Keyboard focus on a task control clears the stage header and any sticky table column headers.
  - Preview and printed sheets keep their existing headers, content and pagination. Sticky workspace headers do not appear on sheets.
- **Color picker:** a curated palette of 8 colors. The picker shows a warning when two stages have similar colors. A new stage gets the next unused color.
- **Stage order:** a drag handle (it also works with the keyboard), and **Move up** and **Move down** in the stage menu.
- **Add stage:** a "+" line between two stages and after the last stage. It adds an empty stage. An empty stage stays after blur.
- **Delete stage…:** in the stage menu. The confirmation shows the effect, for example "Tasks deleted with the stage: 5. Other tasks that depend on them: 2." The app deletes the tasks of the stage. You can undo it.
- **Columns:** Done | Task | Deliverable | Target | Owner | "…".
- **Done:** a checkbox. The app dims done rows. For a parent, the app calculates the checkbox state from its subtasks. The state can be indeterminate.
- **Target:** shows the `end` date. Hover shows the full range. Click opens the date picker. It can be empty. For a parent, the app calculates it from the subtask dates.
- **Owner:** chips with suggestions from all owners of the plan. "+N" shows when the chips do not fit. For a parent, the app calculates the owners from its subtasks. The chip menu has **Rename everywhere…**. This renames the owner in all tasks of the plan.
- **Tasks and subtasks:** a parent has a chevron. Other tasks have a spacer, so the titles align. Subtask rows indent the title cell only.
- **Add task:** a "+" line at the end of the stage. It starts at the task indent.
- **Add subtask:** a "+" line after the last subtask of a parent. It starts at the subtask indent. It shows when the task or one of its subtasks has hover or focus. On a task without subtasks, it adds the first subtask and expands the task.
- The two "+" buttons are on the same vertical axis (the center of the visible width, also on a phone where the table scrolls). The two lines are on different rows, with a vertical gap between them.
- **Empty rows:** the app removes a new row that is empty on blur.
- **"…" button:** opens the task dialog.

### 5.7 Task dialog

The title of the dialog in the UI is "Task details" ("Subtask details" for a subtask).

- The dialog shows all fields of the task: title, deliverable, range, owners, done, note, dependencies.
- It also shows **Stage** and **Parent**.
  - **Stage** moves a task and its subtasks to a different stage.
  - **Parent** is "None (task)" or another top-level task in the same stage, with or without subtasks. "None (task)" changes a subtask to a task. A task without subtasks can become a subtask. A task with subtasks cannot become a subtask.
  - A parent change can open the move-conflict dialog (section 3.3).
- **Note:** plain text. Type "@" to mention a task.
- **Dependencies:** a mention picker. Type words to filter. Enter selects. The app hides candidates that break a rule. A parent also shows its inherited dependencies as read-only chips.
- Each field saves on blur.
- **OK** closes the dialog. **Delete…** opens a confirmation that shows the effect, for example "Subtasks deleted with the task: 2. Other tasks that depend on it: 3. The app removes their links."
- Esc closes the dialog. The focus stays in the dialog while it is open. On close, the focus goes back to the "…" button.

### 5.8 Remarks

- A remark section has an editable title and bullets.
- Remark sections are at the end of the plan, after all stages.
- Two remark sections for each row from 640 px. One for each row below 640 px.
- A "+" line in a remark section adds an empty bullet. Enter at the end of a bullet adds the next bullet. Backspace on an empty bullet removes it.
- The app trims spaces and removes empty bullets on blur.
- A "+" line after the last remark section adds a remark section. Its title is in edit mode. The app removes a new remark section on blur when its title and bullets are empty.
- Remark sections have a drag handle (it also works with the keyboard), and **Move up** and **Move down** in their menu.

### 5.9 Footer

- **Left:** note · version · date. Three fields. The sheets hide empty parts.
- **Right:** a note and the page number. The app calculates the page number.
- The plan stores these fields one time. All pages show the same values.
- The date picker has a **Today** button. It puts the current date in the field. **Done** saves it. The app does not set the date automatically.
- The page number shows only on the sheets (section 7). The workspace footer keeps an empty slot for it.

## 6. Language

- The **UI language** is a viewer setting. The app saves it under `taktblatt:locale`. An import never changes it.
- Choose the UI language under **Settings → Language**. The checked language is the language this tab shows. Choosing a language closes Settings before a reload or a confirmation dialog. Canceling the dialog returns focus to Settings.
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

## 7. Preview and print

- **Preview** shows the plan as paper sheets. It is read-only. Preview and print use the same output.
- Print keeps the fills of task bars, task points, bands and legend swatches when background graphics are off in the print dialog. Dependency lines connect to the same visible task marks as in Preview.
- The sheets use their own print blocks in `src/lib/components/print/`. The print blocks read the same store and the same domain helpers as the workspace. Refer to [ADR 8](adr/0008-print-blocks.md).
- The **Preview** button in the app header opens the preview as a full-screen dialog. **Esc** closes it. The focus goes back to the button. The workspace behind it is inert.
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
- Print (**Cmd/Ctrl+P** or the **Print** button) always prints the paginated sheets with `@page { size: <paper>; margin: 0 }`. If the preview is not open, the Print button and Cmd/Ctrl+P render the sheets first and then open the print dialog. `beforeprint` is the fallback for other ways to print (for example the browser menu). The app removes the sheets on `afterprint` or when the print media ends, and at the next input of the user if neither comes. A render error gives an empty print, not an error page. The app never prints the workspace layout.
- **Print expand state:** print uses the current expand state.
- **Print today line:** the line uses the footer date. When the footer date is empty, it uses today.
- Print has no animations and no controls.

## 8. Motion

- Elements that come in or go out use Svelte transitions.
- The app uses `animate:flip` when the task order changes.
- Numbers and geometry use `Tween` or `Spring`: progress counts, bar positions, the range rescale.
- Durations are 150 – 300 ms, ease-out.
- When the viewer selects `prefers-reduced-motion`, the app disables motion.
- Preview and print have no motion.

## 9. Visual language (print)

- Font: IBM Plex Sans, self-hosted.
- Ink `#1A1D23`. Secondary text `#3A3F4A` and `#5A6070`. Rules `#C9CDD4` and `#E1E4E8`. Neutral fill `#EEF0F3`.
- Stage palette: 8 colors. Band palette: 4 light tints. All pass WCAG AA against their background. Each has a dark-mode variant for the screen.

## 10. Quality

- TypeScript strict mode. ESLint. Prettier.
- Vitest unit tests in two projects. The `server` project runs the `*.spec.ts` files in Node. It covers the domain logic: derived values, sort, dependency validation, move conflicts, ready light, schema, migration, import, pagination. The `client` project runs the `*.svelte.spec.ts` files in Chromium. It covers the store, commands and undo history.
- Playwright end-to-end tests in `e2e/` for the main flows, the offline app (PWA) and the pagination of the sheets.
- GitHub Actions run `pnpm lint`, `pnpm check`, the unit tests and the end-to-end tests in separate jobs. They run on each pull request, on each merge queue entry and on each push to `main`. The `CI passed` job fails when one of these jobs does not succeed. If the end-to-end tests fail, the workflow keeps the Playwright results for 7 days.
- The branch protection rule for `main` requires the `CI passed` check before a merge. Refer to ADR 11.
- Dependabot updates `npm` and `github-actions` every week. Dependabot groups minor and patch updates. Major updates have separate pull requests.
- License: MIT.
