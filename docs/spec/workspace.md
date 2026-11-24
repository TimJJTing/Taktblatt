# Workspace

[Specification index](../spec.md)

## 5. Screen: the workspace

### 5.1 Layout

- The workspace has two groups. **Plan** has, in this order: Header (with the sheet footer fields), Timeline (Gantt), Stage overview and Remarks. **Work plan** has the work plan.
- The workspace layout is for the screen only. It does not change the Preview, the sheets, pagination or print. The sheets keep the order of [section 7](print.md#7-preview-and-print).
- The page does not scroll. The app header stays at the top. Each group scrolls in its own region below the app header. Each scroll region uses the overlay scrollbar ([section 5.12](workspace.md#512-scrollbars)).
- The app header row contains: plan switcher, Undo, Redo and Menu. The header has no Preview, Print, Import or Export button. These actions are in the two menus below.
- **Split view (viewport width 1024 px or more):** Plan is the left pane and Work plan is the right pane. The panes fill the width of the window. Each pane scrolls vertically on its own.
  - When the viewport becomes wider and hides the focused tab, focus moves to the group of that tab.
  - A vertical divider between the panes changes their widths. Its resize target is at least 12 px wide. It shows a grip on hover and focus.
  - The divider is a `separator` with `aria-orientation="vertical"` and the accessible name "Resize panes". Its value is the left pane width in percent. Pointer drag changes the widths at once. Left and Right arrows change the ratio by 2 %. Page Up and Page Down change it by 10 %. Home and End go to the limits. A double-click resets the ratio to 50 %.
  - Each pane is at least 360 px wide. When the window is too narrow for the stored ratio, the app clamps the widths and keeps the stored ratio.
  - Keyboard steps and the reset animate the widths through `motionDuration(ms)`. Drag is immediate. Reduced motion makes all changes immediate.
  - The app keeps the ratio after a reload ([section 4.4](storage.md#44-viewer-state)).
- **Tabs (viewport width below 1024 px):** a tab bar at the bottom of the window has two tabs, **Overview** and **Work plan**. Overview shows the Plan group without the Timeline section: Header, Stage overview and Remarks. The Timeline section does not change with the tab. It always shows at the top, below the app header ([section 5.4](timeline.md#54-timeline-gantt)). Only the selected group shows below it. The tabs use the WAI-ARIA tabs pattern with automatic activation: Left and Right arrows, Home and End move focus and select the tab.
  - The tab bar is a floating island: a rounded pill of frosted glass, centered above the bottom edge. It does not scroll. It keeps 12 px clear of the bottom edge and of the device safe area, such as a home indicator. Content behind it shows through blurred. A thin light edge and a soft shadow separate it from the content. The selected tab is a brighter glass pill inside the island. The pill slides to the selected tab with a transition through `motionDuration(ms)`. Each tab shows only a decorative icon: a dashboard icon for **Overview** and a checklist icon for **Work plan**. The tab name is its accessible name, and a hint shows the name on hover and keyboard focus ([section 5.10](workspace.md#510-hints)). At full size, each tab target is at least 44 px wide and 40 px high. The island uses the screen theme.
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
  - The app keeps the selected tab after a reload ([section 4.4](storage.md#44-viewer-state)).
- When the layout changes between split view and tabs, the app keeps the plan, the expand state, the pin state and the open dialogs. It does not create the Timeline section again.
- All edit controls fit at widths of 768 px or more. On a phone, you can read the plan, edit text and dates, and set the task status. The Gantt and the table scroll horizontally.
- **Menus by scope.** The app header has two menus. The **plan switcher** holds the actions on all plans. The **Menu** holds the actions on the open plan and the app settings. Refer to [ADR 17](../adr/0017-menus-by-scope.md).
- The **plan switcher** shows the name of the open plan and a decorative up-down chevron. Its accessible name is "Plans". It opens **Plans**. In the dropdown menu, the visible label "Plans" comes first. Then comes the list of all plans, then a separator, then **New plan**, **Import…** and **Back up all plans**. The list marks the open plan with a check mark. A choice in the list opens that plan. **Import…** opens the file chooser ([section 4.6](storage.md#46-import-and-export)). **Back up all plans** writes a `BackupFile` ([section 4.6](storage.md#46-import-and-export)).
- The **Menu** is the last button in the app header. Its icon is an ellipsis (**…**). It opens **This plan**. In the dropdown menu, the visible label "This plan" comes first. Then come **Print…**, **Export this plan**, **Rename plan…**, **Duplicate plan** and **Delete plan…**, in this order. **Print…** opens the preview ([section 7](print.md#7-preview-and-print)). It does not open the print dialog. **Export this plan** writes a `PlanFile`. **Delete plan…** uses the destructive style and opens the delete confirmation ([section 5.11](workspace.md#511-delete-confirmations)). A separator comes before the settings: **Theme** and **Language**.
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
  - A Theme choice applies at once and keeps the bottom sheet open. A Language choice closes the bottom sheet before the reload or the confirmation dialog ([section 6](language.md#6-language)).
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
- Preview sheets and printed sheets are always light. They use the same line, station dot, milestone and stage badge forms as the workspace. Refer to sections [5.4](timeline.md#54-timeline-gantt) and [9](visual-language.md#9-visual-language-screen-and-print). The Preview dialog controls use the screen theme.
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
- **Sheet footer:** a row after the objective with the label "Sheet footer". It has the footer fields of [section 5.9](workspace.md#59-footer). A hint on the label says "Prints at the bottom of each sheet." The note, version and date are on the left. The right note is on the right. The row wraps when it does not fit. The row is a group with the accessible name "Sheet footer".

### 5.5 Stage overview

- The number of cards in a row depends on the width of the Stage overview section, not the viewport: three cards from 720 px, two cards from 480 px, one card below 480 px. More cards go to the next row. Cards in a row have the same height. The sheets keep three cards for each row.
- A card shows "STAGE N · months", the title, the description and the derived deliverables.
- The title: click to edit. Workspace limits: single line, required, max 30 characters. Empty → "Stage N".
- The description: click to edit. Free text. The sheets limit it to 3 lines.

### 5.6 Work plan

- **Stage header:** a stage badge S1, S2, …, the color picker, "Stage N · Title (months)" and "x / y done · z in progress". The badge uses the same form as the stage legend. A 2 px stage-color rule sits below the heading. The printed work plan uses the same badge and rule forms. Hide the in-progress part when z is 0. Animate both counts. Use the same text on printed sheets. Keep the word order and punctuation in translation messages. Click the title to edit it. When the header is too wide for the screen, the progress and the stage menu move to a second line.
- **Sticky stage headers:** while a stage scrolls, its header stays at the top of the Work plan region: the top of the Work plan pane in split view, or below a pinned Timeline section with tabs. The header stays within its stage. It scrolls out when the stage ends.
  - The app header and a pinned Timeline section stay above every stage header throughout scrolling. This includes the outgoing header when the next stage takes its place. Stage headers do not cover their content or controls.
  - From a stage width of 640 px, the table column headers and rule stay below the stage header. Their offset uses the current stage header height.
  - Below a stage width of 640 px, the separate 2 px rule stays below the stage header. The table still scrolls sideways. Its column headers stay in the table.
  - The stage title, color picker, progress and menu stay available while the header is sticky. The header has an opaque background.
  - A jump from a pinned Timeline label shows the task below its stage header and any sticky table column headers.
  - Keyboard focus on a task control shows the complete task row below the stage header and any sticky table column headers. The row clears the bottom of the scroll region by at least 1 px.
  - Sticky offsets, focus offsets and label jumps include the full 2 px stage rule. The rule does not cover task controls.
  - Preview and printed sheets keep their existing headers, content and pagination. Sticky workspace headers do not appear on sheets.
- **Color picker:** a curated palette of 8 colors. The picker shows a warning when two stages have similar colors. A new stage gets the next unused color.
- **Stage order:** a drag handle (it also works with the keyboard), and **Move up** and **Move down** in the stage menu.
- **Add stage:** a "+" line between two stages and after the last stage. It adds an empty stage. An empty stage stays after blur.
- **Delete stage…:** in the stage menu. The confirmation shows the effect, for example "Tasks deleted with the stage: 5. Other tasks that depend on them: 2." The app deletes the tasks of the stage. You can undo it.
- **Columns:** Status | Task | Deliverable | Target | Owner | "…".
- **Status:** a compact select with an icon. An empty circle means Todo. A half-filled circle means In progress. A check-circle means Done. A circle with a slash means Canceled. The options are Todo, In progress, Done and Canceled, in this order. They show the icon and label. The icon is the 16 px status icon of [section 9.1](visual-language.md#91-shared-diagram-signs), with the same size for tasks and subtasks. The trigger has a status hint and an accessible name with the task and status. Only done and canceled rows are dimmed, and their titles are struck through. A parent shows its derived status in a disabled select. Its hint wrapper gets keyboard focus.
- Each status change uses `updateTask` and adds one undo step. Opening or closing the select, or selecting the current value, adds no step. Undo and redo restore the status. The select uses standard keyboard controls: Enter or Space opens it, arrows move between options, Enter selects, and Escape closes it. Focus returns to the trigger.
- **Target:** shows the `end` date, or "start –" when only the start is set. This rule is the same for all rows and on the sheets. Hover shows the full range. Click opens the date picker. It can be empty. A parent shows its stored planned window. Its dates are editable within the subtask limits below.
- **Owner:** chips with suggestions from all owners of the plan. "+N" shows when the chips do not fit. A parent shows its stored owners. Its editor has no remove button for an owner that a subtask uses. It compares these names without case, after trimming. Other owners can be removed, and new owners can be added. The chip menu has **Rename everywhere…**. This renames the owner in all tasks of the plan.
- **Parent date limits:** the start must be no later than the earliest subtask start. The end must be no earlier than the latest subtask end. Empty subtask dates do not count. A parent date cannot be cleared when a subtask has that date. When both parent dates are set, the range must contain every subtask date, including a start-only or end-only date. An open range can stay open if it meets the start and end limits. The calendar marks the subtask range (earliest to latest subtask date) with a bar under the days. A legend below the calendar shows this range and describes the calendar. All dates stay available. A typed or calendar range that breaks a limit shows an alert with the required range and disables **Done**. A start-only calendar pick waits for the end: it shows the alert only when the start is after the earliest subtask date. **Done** stays disabled until the range meets the limits. If subtask dates change while the editor is open, the app checks the draft against the new limits. It keeps any typed-date error. An ordinary close discards this invalid draft. Esc cancels any draft. Focus returns to the trigger after dismissal.
- **Tasks and subtasks:** a parent has the shared expansion control ([section 9.1](visual-language.md#91-shared-diagram-signs)). Other tasks have a spacer, so the titles align. Subtask rows indent the title cell only. Expanded subtasks are indented table rows directly below the parent, with all columns aligned. The table shows no family summary below a parent title.
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
  - A parent change can open the move-conflict dialog ([section 3.3](dependencies.md#33-move-conflicts)).
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

- On the screen, the footer fields are in the Header ([section 5.3](workspace.md#53-header-fields), **Sheet footer**). The workspace has no footer at the end of the page. On the sheets, the footer stays at the bottom of each page.
- **Left:** note · version · date. Three fields. The sheets hide empty parts.
- **Right:** a note and the page number. The app calculates the page number.
- The plan stores these fields one time. All pages show the same values.
- The date picker has a **Today** button. It puts the current date in the field. **Done** saves it. The app does not set the date automatically.
- The page number shows only on the sheets ([section 7](print.md#7-preview-and-print)). The workspace does not show a page number.

### Pointer targets

- Each pointer target has a hit area of at least 24 × 24 px. A smaller target can use the spacing rule: a 24 px circle centered on the target must not overlap another target or the same circle of another small target.
- Keep the drawn size of small controls. Use an invisible hit area around the control. Adjacent hit areas must not overlap. Drag handles and their hit areas stay inside the pane on phones.
- The subtask add line stays on the row edge in a zero-height row. Its 24 × 24 px hit area can overlap the row edge. Do not add space between task groups for this target.
- Keep the stage progress text and stage menu in one group. The group wraps as a unit on narrow panes.
- Exception: the overlay scrollbar thumb follows [section 5.12](workspace.md#512-scrollbars). Its hit area equals the visible thumb.

### 5.10 Hints

- Controls and status marks show their hints in a tooltip. Examples: the header buttons, the "+" buttons, the pin and height buttons of the timeline, the Timeline handle and the Keep open toggle, the Gantt labels, task lines, points, milestones and bands, the stage color swatches, the ready light and the derived status of a parent.
- The app does not use the native `title` attribute. A unit test checks this.
- A tooltip opens on hover. On an element that can get keyboard focus, it also opens on keyboard focus. The controls, the Gantt task lines and points, and the derived status select of a parent in the work plan get keyboard focus. Other status marks do not get a tab stop: the ready light, the Gantt outside markers, the dependency warnings and inherited dependencies, and the derived status select in the task dialog.
- The text alternative stays in the `aria-label`. When the hint gives more information than the name, the app gives this information to assistive technology too. For example, a Gantt label has the hint "Title: Show in the work plan" as its accessible description. A stage color swatch that another stage uses has "Another stage uses this color." in its accessible name.
- An owner field with more owners than chips shows the full owner list as its hint.
- Preview and printed sheets show no hints.
- Components show hints with `Hint.svelte` in `src/lib/components/app/`. It wraps the tooltip primitive.

### 5.11 Delete confirmations

- Plan, stage, task, remark section, band and milestone deletion use one shared confirmation component. Each caller supplies the title, body and delete action.
- The dialog has **Cancel** and a destructive **Delete** button. Cancel and Esc close the confirmation without deletion. Focus stays in the dialog while it is open. Closing it keeps the existing focus return behavior of its caller.
- Each body states the same deletion effects as before. Stage and remark section bodies include the name in the translated message. The English text starts with "The app deletes “{name}”." Counts, dependency cleanup and undo behavior stay unchanged.

### 5.12 Scrollbars

The app shows its own overlay scrollbars. They look and work the same in all browsers and on all operating systems. Refer to [ADR 18](../adr/0018-overlay-scrollbar.md).

- **Scroll areas:** these areas use the overlay scrollbar:
  - In split view, the Plan pane and the Work plan pane.
  - With tabs, the scroll region of the selected group.
  - The Timeline section body and the Gantt chart.
  - The legend rail (tabs).
  - The narrow stage tables that scroll horizontally.
  - The Preview dialog.
  - Dialogs and bottom sheets that scroll, the task dialog, the dependency picker list, the import lists and the dropdown menus.
- Text areas grow with their text and do not scroll. They have no overlay scrollbar. The list of a select keeps its scroll buttons and shows no thumb.
- The app hides the native scrollbar in each of these areas. The native scrollbar takes no space. The content uses the full width and height of the area.
- **Thumbs:** each area shows one thumb for each axis that overflows. An area with no overflow on an axis shows no thumb on that axis. The vertical thumb is at the right edge. The horizontal thumb is at the bottom edge. There is no visible track. When both axes overflow, the two thumbs do not overlap at the corner.
  - The thumb length shows the visible part of the content. Its position shows the scroll position. The minimum length is 24 px. The thumb follows the scroll position at once.
  - The thumb is 6 px thick, with fully round ends, and 2 px from the edge of the area. Its color is the foreground color of the screen theme at 25 % opacity.
  - On pointer hover over an enabled thumb and during a thumb drag, the thumb is 10 px thick at 40 % opacity.
  - In forced colors mode, the thumb uses the system text color.
- **Visibility:** at rest, the thumbs are hidden. The thumbs of an area show when one of these occurs:
  - The area scrolls, from any source: wheel, touch, keyboard, a thumb drag or a scroll by the app.
  - A mouse pointer moves over the area.
  - A thumb drag starts.
- The thumbs stay visible during a thumb drag and while the pointer is over an enabled thumb. They fade out 800 ms after the last scroll, pointer movement or drag end. A new event in this time keeps them visible and starts the 800 ms again.
- **Nested areas:** the Timeline section body contains the Gantt chart. A pointer movement shows only the thumbs of the innermost area below the pointer. A scroll shows only the thumbs of the area that scrolls.
- **Layers:** the thumbs show above the content of their area, the sticky headers and the pinned Timeline section. The layer uses z-index 35. The thumbs show below the app header, the floating island (z-index 40), menus and dialogs. The island is at the bottom center. The thumbs are at the right and bottom edges. In a dialog or a bottom sheet, the thumbs are inside the dialog content.
- **Drag:** only a visible thumb takes presses. A hidden thumb lets presses go to the content below it. The hit area matches the visible thumb. A pointer press on a visible thumb starts a drag. The thumb follows the pointer, and the area scrolls by the same proportion. The drag continues when the pointer leaves the area. It ends on release, on cancel or when the pointer capture is lost. The scroll position stays where the drag ended. A drag scrolls at once. Mouse, pen and touch can drag a thumb.
- **Other input:** wheel, trackpad, touch, keyboard and focus scrolling keep their native behavior. Scroll by the app (a restored scroll position, a label jump, the reveal of a focused element) does not change.
- **Accessibility:** the thumbs are hidden from assistive technology. They do not get keyboard focus and have no hint. Each scroll area keeps its native keyboard access and its role.
- **Motion:** the fade and the thickness change use `motionDuration(150)`. When the user prefers reduced motion, the thumbs show, hide and change thickness at once.
- **Outside presses:** a press on a thumb is not an outside press. It does not close or save a dialog, a popover, a menu or a bottom sheet.
- **Bottom sheets:** a press or a drag on a thumb in a bottom sheet does not start a drag to close ([section 5.1](workspace.md#51-layout)). It scrolls the bottom sheet content only.
- **User scroll:** a thumb drag is a scroll by the user. The floating island size ([section 5.1](workspace.md#51-layout)) and the automatic collapse of the Timeline section ([section 5.4](timeline.md#54-timeline-gantt)) use it in the same way as a wheel or touch scroll. During a thumb drag, a scroll in either direction counts.
- **Print:** Preview sheets and printed sheets show no thumbs. The Preview dialog shows thumbs on its own scroll area, as other dialogs do.
- **Parity:** the thumbs have the same look, sizes, timing and behavior in Chromium, Firefox and Safari (WebKit), on macOS, Windows, Linux, iOS and Android, in light and dark themes, and in the installed PWA, also offline. A system setting to always show native scrollbars does not show native scrollbars in these areas.
