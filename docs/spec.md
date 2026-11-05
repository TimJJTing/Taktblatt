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
	symbol: 'diamond' | 'flag' | 'star' | 'circle';
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
- When the ready light is off, the app renders nothing. It does not keep empty space.
- The ready light shows before the title in the table, before the Gantt label, in the task dialog and on the sheets.
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
- the expanded tasks, for each plan (shared by the Gantt and the table);
- the pinned state and the height of the Gantt.

The app keeps these settings as `expanded`, `ganttPinned` and `ganttHeight` under the key `taktblatt:ui`. The UI language is under `taktblatt:locale`. An unreadable value gives the default settings.

### 4.5 Undo

- The app keeps one undo history in memory for the active plan. The history keeps 50 steps.
- One commit is one step: a blur, Enter, a checkbox, a picker, a dialog action, a move.
- **Cmd/Ctrl+Z** undoes. **Shift+Cmd/Ctrl+Z** and **Ctrl+Y** redo.
- The app clears the history when you switch to a different plan, when another browser tab changes the active plan, after an import, and when you reload the page.

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
- The first row of the app header contains: plan switcher, Preview, Print, Import, Export, Undo, Redo and UI language.
- All edit controls fit at widths of 768 px or more. On a phone, you can read the plan, edit text and dates, and mark tasks done. The Gantt and the table scroll horizontally.
- Dark mode follows the system setting. Print is always light.

### 5.2 Edit fields

- Click a field to edit it. A blur saves. Enter commits a single-line field. Esc cancels.
- In the table: Tab and Shift+Tab move between cells. Enter commits and moves to the same cell in the next row.
- A control that shows on hover also shows on `:focus-within`. You can reach it on a touch screen.
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
- **Linked highlight:** hover or focus on a table row highlights its bar. Hover or focus on a bar highlights its row. When you pin the Gantt, the app scrolls it to show the bar.
- **Today line:** a dashed line with a "Today" label, behind the bars. It uses the local date of the viewer. The app hides it when the date is outside the range.
- **Dependency lines:** thin lines behind the bars. No lines go to or from a task without a drawn range or point. When you expand a parent, the lines connect to the subtask that owns the dependency. When you collapse a parent, the lines connect to the parent bar. The app merges duplicate lines. The lines move with an animation when you expand or collapse.
- **Bands:** any number. Each band has a title, a range and a tint. Bands have a transparent tint, so you can see each band where their ranges overlap. The legend shows "Title (start – end)". A "+" at the end of the legend opens a small dialog (title, range, tint). Click a band or its legend entry to edit it. The dialog has **Delete…**, with a confirmation.
- **Milestones:** a symbol on the milestone row. The legend shows "M1 Title (date)". A "+" after the legend opens a small dialog (title, description, date, symbol). Click a milestone or its legend entry to edit it. The dialog has **Delete…**, with a confirmation.
- **Milestone and band dialogs:** an outside click saves an edit. Esc and **Cancel** discard the changes. An outside click on a new entry does not add it.
- **Stage legend:** the stage colors and titles.
- **Pin:** a toggle pins the Gantt below the app header.
  - The default height is 35 % of the viewport. The maximum is 50 %. The minimum is 120 px.
  - The Gantt content scrolls vertically.
  - A handle on the bottom edge changes the height. The handle is a `separator`. The arrow keys also change the height.
  - When you click a Gantt label, the app scrolls the row to a position below the pinned Gantt.

### 5.5 Stage overview

- Three cards for each row from 768 px. One card for each row below 768 px. More cards go to the next row. Cards in a row have the same height.
- A card shows "STAGE N · months", the title, the description and the derived deliverables.
- The title: click to edit. Workspace limits: single line, required, max 30 characters. Empty → "Stage N".
- The description: click to edit. Free text. The sheets limit it to 3 lines.

### 5.6 Work plan

- **Stage header:** a color swatch (a picker), "Stage N · Title (months)" and "x / y done". Click the title to edit it.
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
- The first UI language comes from the browser language list. The app uses the first supported language in the list. A region variant matches its base language (`de-AT` gives `de`). `zh-Hant` and `zh-TW`, `zh-HK` and `zh-MO` give `zh-TW`. Simplified or unspecified Chinese and all other languages give English. The app saves the detected language on the first visit. A later change of the browser language has no effect.
- There is one language: the UI language. It controls the texts, the date formats and the printed labels (for example "Objective:", "Timeline", the column titles). A plan has no language setting.
- Plan files are language-neutral. Dates are stored as ISO `YYYY-MM-DD`. The app formats them with the UI language when it shows or prints them. The same file shows and prints in German for a German UI and in Japanese for a Japanese UI.
- An old file or stored plan can still have a `locale` key. The app ignores the key and does not write it again.
- A change of the UI language reloads the page, also in other open tabs. The reload clears the undo history (section 4.5).
- Supported languages: English (`en`), German (`de`), Traditional Chinese (`zh-TW`), Japanese (`ja`).
- English is the source. A missing key falls back to English.
- The `de`, `zh-TW` and `ja` texts are machine drafts. A native speaker must review them.
- Dates use `Intl`. Weeks start on Monday.

## 7. Preview and print

- **Preview** shows the plan as paper sheets. It is read-only. Preview and print use the same output.
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
- GitHub Actions run `pnpm lint`, `pnpm check`, the unit tests and the end-to-end tests on each pull request and on each push to `main`. If a run fails, the workflow keeps the Playwright results for 7 days.
- Dependabot updates `npm` and `github-actions` every week. Dependabot groups minor and patch updates. Major updates have separate pull requests.
- License: MIT.
