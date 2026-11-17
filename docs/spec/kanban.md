# Kanban

[Specification index](../spec.md)

### 5.15 Kanban

Kanban shows what needs attention: four status columns across stage swimlanes. Refer to [ADR 22](../adr/0022-kanban.md) and [ADR 23](../adr/0023-unified-diagram-language.md). ADR 23 replaced the first leaf board, its flat layout and its fixed card height.

#### Board, columns and swimlanes

- Kanban is a view inside the Timeline section. Register it only through `src/lib/components/kanban/diagram-view.ts`, with `order: VIEW_ORDER.kanban` from `view-contract.ts`. Use the shared switch, viewer preference, stage and print selection of [section 5.13](diagram-views.md#513-diagram-views) and ADR 20. The selected view is global UI state in `taktblatt:ui`, not plan data. No schema change is required.
- Use the shared task index of the workspace and `boardColumn()` from `src/lib/domain/derive.ts`. Do not calculate a second readiness, status or column value in the view. Effective dependencies include inherited dependencies. Done and canceled prerequisites both satisfy dependencies. Dates do not decide readiness.

| Position | Column      | Existing domain rule                                                     |
| -------- | ----------- | ------------------------------------------------------------------------ |
| 1        | Blocked     | Effective status is `todo` and readiness is `blocked`.                   |
| 2        | Todo        | Effective status is `todo` and readiness is `ready`.                     |
| 3        | In progress | Effective status is `in_progress`, also when a dependency is unfinished. |
| 4        | Done        | Effective status is `done`.                                              |

Blocked is a derived column, not a stored status. Todo is the ready part of stored `todo`. The stored statuses stay `todo`, `in_progress`, `done` and `canceled`. There is no Canceled column.

**Cards.** The board has one card for each eligible top-level task. A top-level task is eligible when `boardColumn()` of its task state is not null. Thus a canceled top-level task has no card, and a parent whose subtasks are all canceled has no card. A subtask has no card.

- A top-level task without subtasks has a **task card**.
- A top-level task with subtasks has a **parent summary** card. Its column comes from `boardColumn()` of the parent state, with the effective parent status and the parent readiness of [section 3.4](dependencies.md#34-ready-light). Its status icon shows the effective parent status.

**Columns.** Keep the four columns in the order above. Keep all four column headings, including empty columns. Each heading shows its name and its card count over all stages. The four counts add up to the number of eligible top-level tasks. A subtask never changes a column count. Expanding or collapsing a family never changes a count. It moves no card to another cell and moves no card of the same swimlane. The swimlanes below it shift down or up.

**Swimlanes.** Show one swimlane for each stage, in stage order, including a stage with no cards. The four status columns align across all swimlanes and with the column headings.

- Each swimlane starts with a stage heading: the stage badge, the stage title and the card count of the stage, for example "Tasks: 3". The count message has no plural form.
- A vertical stem in the stage color runs down from the badge for the full swimlane height. The badge and the stem form a "p" shape. Their left edges have the same x position. The stem is 4 px wide.
- Put the stage title to the right of the stem. A long title wraps inside the heading column. It does not overlap the stem or the first status column.
- Proposed default: a swimlane with no cards shows the text "No tasks in this stage" in place of cards.

**Order.** In each cell, show the cards of that stage and column in the shared task order: start date, missing starts last, then `createdAt`. Preserve input order for exact ties. Do not add a manual card order. Status changes filter the same sequence again; Done does not use completion time, which the plan does not store.

**Family rows.** Below the cards of a swimlane, show one family row for each parent summary of that swimlane, in task order. A family row spans the four status columns. Put the expansion control in the family row, not on the parent summary card.

- The row starts with the shared expansion control of [section 9.1](visual-language.md#91-shared-diagram-signs), then the parent title and the number of subtasks, for example "Soil preparation · Subtasks: 2". The message contains the punctuation and has no plural form.
- The control reads and changes the shared expand state ([section 4.4](storage.md#44-viewer-state)). The Work plan, Gantt, Route map and Kanban show the same state for a parent. The control has `aria-expanded` and `aria-controls` for its family detail. Do not use a `details` element or a browser disclosure triangle.
- When expanded, the row shows the **family detail**: one item for each subtask of the parent, in subtask order. Include canceled subtasks. Each item shows the 16 px status icon of the subtask, its title and its state text. The state text is the column name of `boardColumn()` for that subtask, or "Canceled". Done and canceled items have a struck-through title.
- Family detail does not move the parent summary or another card of its swimlane. It adds no card and changes no count.

#### Cards and task identity

- Cards and family detail items are HTML task nodes keyed by the existing task id.
- Proposed default: a card has no fixed height. Its height follows its content. Clamp the visible card title to two lines on screen and paper. An unbroken long word breaks inside the card without making the column wider. Keep the full title in the accessible name, the task dialog and the printed Work plan. Use a localized untitled-task fallback for imported empty titles.
- Proposed default: use the status icon of [section 9.1](visual-language.md#91-shared-diagram-signs) at 16 px as the leading sign of a card. Do not use `StationDot` in Kanban. Put the `data-diagram-station` mark on the 16 px wrapper of the icon, not on the larger station target around it. This wrapper is the position cue of [section 5.13](diagram-views.md#513-diagram-views), so its size gives the scale of the flight copy. The station target around it is the route target below.
- Proposed default: keep the ready light in its own fixed slot before the title. Its hint and text alternative use the shared readiness calculation and messages.
- The swimlane gives the stage. A card has a visible border and does not repeat the stage badge, the stage title or a stage rule.
- A parent summary shows the family summary of [section 9.1](visual-language.md#91-shared-diagram-signs) below its title, for example "1 ready and 1 blocked". Ready and blocked are separate parts of Todo. Each subtask counts one time.
- Proposed default: cards keep owners and dates. Show owners on one truncated line, with the full list in a hint and accessible description. Use `joinList()` and keep owner order. Show "No owners" when empty. Show both dates, a labeled single endpoint, or "No dates". Use the UI date format. If start is after end, keep both dates and give the existing date-warning text. Cards without dates or outside the Gantt range stay on the board. Deliverable, note and dependency lists stay in Task details.
- Done keeps the shared finished treatment: a struck-through title in secondary ink. Route dimming uses the single shared color mix on the card border and status icon. Titles, metadata, ready lights and focus outlines do not dim.
- Do not use a native `title` attribute. Hints use `Hint.svelte`.

#### Scrolling, widths and empty states

Use one shared vertical scroll region for the whole board. The column headings and counts are sticky at the top of that region. There are no independent column or swimlane scrollers. Use the shared Timeline height and viewport limits. With automatic height, use the content height of the board, capped by the shared Timeline limit; do not add a per-view saved height. Use the existing overlay scrollbar. Done retains all eligible cards. Do not archive, cap, collapse, virtualize or add "Show more". Canceled top-level tasks remain available in the Work plan and Task details.

The stage heading column is `6rem` wide. Each status column is one quarter of the remaining width and `7.5rem` or more. These lengths scale with the user's text size. Put column and card gaps inside the `7.5rem` tracks as padding, not as a grid gap. The minimum board width is thus `36rem` (`6rem + 4 × 7.5rem`): 576 px at the default text size. The four status columns fit a 640 px pane without horizontal scrolling. When the board is narrower than its minimum width, the board becomes one horizontally scrolling strip. The stage heading column then stays at the inline-start edge of the strip. Do not stack columns or status groups, and do not add status tabs. The board must not make the page wider. Horizontal touch movement scrolls the strip; vertical movement scrolls the whole board. A gesture must not start a card drag. Keyboard focus reveals the target card or item. A route-focus change alone does not scroll.

Keep the vertical offset and the strip offset while the mounted stage stays active, including workspace tab changes and resizes. Clamp offsets when content shrinks. Offsets are transient, not saved plan or viewer fields. A plan change resets them. A view remount can start at the top unless a task-focus transfer must reveal another card. Keep the same diagram above Overview and Work plan with tabs. Reuse the shared pin, height, collapse, Keep open and legend controls.

If the board has no cards, show a board-level explanation as well as the four headings. Distinguish a plan with no tasks from a plan whose top-level tasks are all canceled. Explain that canceled tasks are in the Work plan. Empty states are text, not add or status controls. An empty cell in a swimlane with cards shows no text.

Show the shared status key of [section 9.1](visual-language.md#91-shared-diagram-signs) below the last swimlane.

#### Read-only actions and future status commands

The board is read-only. It has no inline editor, status select, drag handle, drop target or reorder action. Change plan content in the Work plan or Task details. Pointer movement and keyboard navigation on the board do not create undo steps. The expansion control changes viewer state only.

A click, Enter or Space on the main action of a card or a family detail item opens the existing Task details dialog through `EditingState.openDetails`. A touch tap on the main action uses the same opener for that task id. Opening the dialog is not a status edit.

Focus return after the dialog closes follows [section 5.13](diagram-views.md#513-diagram-views). The same card or item gets focus, also when the card moved to another column. Reveal it by task id. Keep focus in the dialog during a view or workspace-layout change until close.

The card box is not focusable. Mark the main action, which holds the visible title, as the task label (`data-diagram-label`). The stage's task-id focus transfer tries the focusable task box, then the task label, then a keyboard route target. This order makes a view switch focus the main action, not the station target.

The leading station target of a card holds the status icon. It is a separate sibling of the main action, not a nested button. Give it at least a 24 px target, and 44 px with a coarse pointer. A touch tap there uses the shared route toggle and does not open the dialog. Focus there lights the same task route. A desktop click on the station target does not pin the route. Do not attach the touch-toggle behavior to the main action's dialog tap. A family detail item has one main action and no separate station target.

Keep a command-shaped seam between column intent and plan edits. Use the following contract for a later drag release. Do not enable drag:

- Accept an intent with `sourcePlanId`, `taskId` and a target `BoardColumn`. Explicitly cancel a pending intent on every plan activation or diagram-view switch, including a switch away and back to the same plan or view. This cancellation is required even if task ids match. Resolve an uncanceled intent against the current active plan and current task index at commit time; reject a `sourcePlanId` mismatch before task lookup. Return a status-change request, a reason for rejection, or a no-op. The board layout never mutates a task or calls a persistence API.
- In progress requests `updateTask(workspace, taskId, { status: 'in_progress' })`. Done requests the same command with `status: 'done'`. Dependencies do not prohibit these edits; this matches the existing status select.
- Todo requests `status: 'todo'` only if that task would be ready under the current effective dependency graph. Blocked requests `status: 'todo'` only if that task would be blocked. Evaluate the hypothetical `todo` state with the shared derivation, not a second blocker algorithm. Reject the opposite case with a localized explanation. Never write `blocked`, clear dependencies, or silently put a card in a different target column.
- Reject a missing task, a canceled task, a parent with subtasks, an unavailable target or an intent from a plan that is no longer active. A same-column intent is a no-op. Canceled intents cannot be committed or revived after switching back. Do not support within-column reordering or a Canceled target.
- `DiagramViewProps` has no command callback. A view reads the workspace from context and edits through `src/lib/state/commands.ts`. A later dispatcher calls `updateTask(getWorkspace(), taskId, patch)` directly; the shared view contract needs no change.
- A successful change calls the existing command once. Parent expansion, save, cross-tab sync and undo/redo follow the existing command behavior. A rejected or unchanged intent has no command, no save and no undo step. Rebuild the board from the resulting plan. Do not persist a card column or position.
- A future drag release must add a keyboard alternative and drop-result announcements before it ships. The read-only board exposes no drag semantics to assistive technology.

#### Route focus and connectors

- As the Kanban-specific exception to the at-rest connector rule in [section 9.1](visual-language.md#91-shared-diagram-signs), show no dependency lines when no route is active. Preview and print also have no Kanban dependency lines because they have no route focus.
- Use the single route owner in `EditingState` from [ADR 20](../adr/0020-diagram-views.md#viewer-state-and-route-focus). Call `diagramRouteTargets(() => nodeIds)` from `src/lib/components/diagram/diagram-layer.ts` during setup to register the view on mount, so a leaving layer takes no route input. Use its scoped `target` action on each card and family detail item, and do not call the route owner's `view()` directly.
- Use neutral `data-route-target` task ids and the shared keyboard and touch attributes. Treat the complete card as one hover target so moving between its station target and main action does not restart intent. Focus-visible actions light the route at once. Keep [section 5.4](timeline.md#54-timeline-gantt)'s input priority, 300 ms hover rest, 120 ms target switch, 250 ms leave grace, dialog priority and Esc rules. Esc does not clear a focus route.
- **Visible nodes:** the cards, plus the family detail items of expanded parents. Use the shared route projection of [section 5.4](timeline.md#54-timeline-gantt) (`routeFocusModel()`) with these nodes as its rows. Proposed default: a parent summary whose family is collapsed is a parent row: its route is the union of its own route and the routes of its hidden subtasks. A hidden subtask uses its parent summary as its proxy. An expanded parent and its items each show their own route.
- Keep the effective graph complete, including canceled prerequisites and top-level tasks with no card. Map both endpoints of each effective pair to visible nodes with the proxy rule. Discard a pair with an endpoint that has no visible node. Discard a pair whose endpoints map to the same node. Merge equal pairs with `lineKey()` from `src/lib/domain/route.ts`. Omitted endpoints still take part in route traversal and readiness. Do not invent a direct edge across an omitted task.
- Keep eligible edge identities in the scene independently of route visibility. While a route is active, show only eligible edges that belong to that route. A shortcut between its upstream and downstream sides stays hidden. A route with no eligible visible edge shows no connector. Its visible route nodes still keep their full color.
- Route screen edges behind opaque cards, through the gaps between cards, columns and swimlanes, with attachment points at the status icons and no arrowheads. Clip the overlay once to the board viewport below the sticky headings. Paths do not enter card text or headings.
- Suppress an edge when either endpoint is wholly outside that viewport, including after horizontal scrolling. Do not scroll to reveal an endpoint, draw a line to a heading, or make continuation stubs. Recompute from rendered geometry on vertical scroll, strip scroll, resize and family expansion.
- Lit ordinary edges use the shared ink and ground casing. Route cycle edges keep the dotted warning form and cycle casing. Hide them at rest too. Hide off-route cycle connectors while another route is active. This overrides [section 5.4](timeline.md#54-timeline-gantt)'s persistent off-route cycle warnings on this board. Off-route card borders and status icons use one opaque ground mix. Ready lights, text and focus outlines do not dim. Reuse shared route paint and `motionDuration(150)`; do not reduce whole-card opacity.
- Work plan and dialog route inputs work while Kanban is active. A route input for a subtask of a collapsed family lights its parent summary.
- Verify the parent-input fixture: parent `P` has subtasks `C1` and `C2`, unrelated top-level task `U` is present, `C2` depends on `C1`, and there are no other dependencies. With the family collapsed and route input `P`, the card of `P` keeps its full color, the card of `U` is dimmed and no edge is drawn. With the family expanded and route input `C2`, items `C1` and `C2` keep their full color, the edge `C1→C2` is drawn, and the cards of `P` and `U` are dimmed.
- Route focus does not change card order, counts or accessible names. Route graphics are decorative and have no focus targets.

#### Keyboard and accessibility

Use named column headings, one named group for each swimlane and semantic lists for cards and family detail items. Do not use an editable ARIA grid. Keep every control in normal Tab order: swimlane by swimlane; in a swimlane, the cards column by column in card order, then the family rows in order. For a card, the main action comes before its station target. For a family row, the expansion control comes before its items. No roving focus is required.

On the main action of a card, Up and Down move to the previous or next card in the same column, across swimlanes. Home and End move to the first or last card of that column. Left and Right move to the nearest nonempty cell in that direction in the same swimlane, at the same ordinal card position clamped to the available cards. Do not wrap at board edges. An empty board has no card stop. The diagram switch and surrounding controls stay available with Tab. Station targets, expansion controls and family detail items use normal button keys and do not intercept these navigation keys.

Reveal a keyboard target inside the board's own vertical region and horizontal strip, clear of the sticky headings, the sticky stage heading column and pinned Timeline controls. Set this clearance on the board's own scrollers. The vertical scroller reserves `2.5rem` for the column headings. The shared reveal of [section 5.13](diagram-views.md#513-diagram-views) uses it after a view switch. Focus-reveal scrolling is app scrolling. It must not collapse the Timeline or change the floating workspace-tab island.

Retain focus by task id when a status change moves a card. Proposed default: if a focused card or item disappears, the missing-target rule of [section 5.13](diagram-views.md#513-diagram-views) applies. Kanban has no fallback of its own: it does not move focus to the next or previous card.

Use localized names for the column headings, the swimlane groups, the vertical scroll region and the horizontal strip. Include the full task title, the status label, the derived board column and the stage in each main action's accessible name. Do not repeat the status when its column has the same label. For a parent summary, add the family summary to the accessible description. For a family detail item, include the parent title. Put complete owner and date values and the shared ready explanation in the accessible description of a card.

Name the station target "Show dependency route for {task}". Name the main action "Open task details for {task}" with the task context in the same translation message. Route focus must not change these names. Empty titles use the same fallback on screen and in accessible text. Hide the decorative status icon and ready-light graphics when the enclosing target already provides their text alternative.

Show a visible focus outline around the complete action. Use system colors in forced colors: `Canvas`, `CanvasText`, `Highlight` and `HighlightText` as applicable. Preserve the status icon shapes, visible column names, stage-badge text, stems, card borders, the status key and focus outlines. Stems and card borders stay visible in forced colors with system colors. In the dark theme, stems use the dark stage color and card borders, the status key and all text keep a contrast of 3:1 or more for graphics and 4.5:1 or more for text against the dark ground. Do not use stage color alone for membership or status.

#### Motion and identity marks

The shared stage of [section 5.13](diagram-views.md#513-diagram-views) reads current geometry from the rendered DOM; views do not report geometry. Mark the rendered nodes with the `DIAGRAM_ATTR` attributes of `view-contract.ts`:

- `data-diagram-task` on each card box and each family detail item, with the task id.
- `data-diagram-station` on the 16 px wrapper of the status icon of a card or item, with the task id.
- `data-diagram-label` on the main action, which holds the title.
- `data-diagram-parent` on each family detail item, with the parent id, for emerging subtasks.
- `data-diagram-scroller`, empty, on the vertical region and on the horizontal strip.

Declare `motion: { routerId: 'kanban', connectorSchema: 'kanban-v2' }` in the view definition.

A view change uses the shared flight layer, position cues, fades, interruption and focus rules of [section 5.13](diagram-views.md#513-diagram-views). Kanban adds no private flight layer. Missing destination nodes, including canceled top-level tasks, fade out in place. A subtask whose family is collapsed has no node; the missing-target rule of [section 5.13](diagram-views.md#513-diagram-views) gives its parent summary.

Use `motionDuration(GEOMETRY_MOTION_MS)` for card moves after edits and for the shift of the swimlanes below a family that expands or collapses; the shared geometry constant is 240 ms. Animate positions across columns on the board surface. Family detail enters and leaves with a transition through `motionDuration()`. Normal scrolling follows the input without an added tween. With reduced motion, apply positions, column moves, expansion, focus reveal and view changes immediately. Shared route-intent timers remain unchanged. Do not use the View Transitions API.

#### Required fixtures

Use the following fixtures for acceptance checks:

- **Garden example:** the example plan has seven eligible top-level tasks. The column counts are Blocked 2, Todo 3, In progress 1 and Done 1. Expanding or collapsing Soil preparation or Neighbourhood stall does not change a count. The Neighbourhood stall summary shows "1 ready and 1 blocked". The Soil preparation summary shows "1 in progress and 1 done".
- **All-Done stress board:** one stage has 300 `done` tasks without subtasks, ids `D001`–`D300`, in deterministic order. There are no other tasks or dependencies. Counts are Blocked 0, Todo 0, In progress 0 and Done 300. All four sticky headings remain available. Reach `D001` and `D300` by pointer scrolling and keyboard navigation. Preview and printed A4/Letter output contain each of the 300 ids exactly once, with no omission, duplicate or split card; every fragment repeats the total counts.
- **Unbroken title:** in that board, give `D150` a title of 512 consecutive `W` characters. The title breaks inside the card and clamps to two lines, on screen and paper. Its column keeps its width and no text overflows the card. The card keeps its full accessible name.
- **Canceled subtask:** parent `P` in stage 1 has subtasks `A` (`todo`), `B` (`done`) and `X` (`canceled`). `P` has one summary card in In progress, because its active subtasks are `todo` and `done`. Its family summary has three parts: 1 ready, 1 done and 1 canceled. The expanded family detail lists `A`, `B` and `X`. A canceled top-level task `T` has no card.
- **Unrelated cycle:** use top-level tasks `A`, `B`, `X` and `Y`, with dependency pairs `A→B`, `X→Y` and `Y→X`. With route input `A`, show only `A→B`; hide both unrelated cycle connectors. With route input `X`, show the `X↔Y` cycle in its warning form. At rest hide all three connectors.
- **Parent input:** use the `P`/`C1`/`C2`/`U` fixture above, in both expand states.
- **Stale intent:** reuse a task id in two plans. Check source-plan mismatch and cancellation on plan switch, view switch, and away-and-back switches. No canceled intent emits a command or undo step.

#### Preview, print and localization

Register a landscape paper adapter for both A4 and US Letter. Use the generic `DiagramPaperAdapter` of `view-contract.ts`: `{ orientation, segments(input), component }`. `segments` returns a `SceneSegment` (`print-model.ts`) with `diagram: 'kanban'` and the board legends. Build a separate paper scene with paper metrics. Use the same eligible cards, columns, swimlanes and order as the board. Do not print the scrolled screen or depend on its offsets. Paper does not use the screen expand state.

- Use a stage heading column and four equal status columns in the screen order.
- Paper cards have no fixed height. The height of a card row is the height of its tallest card. Clamp paper card titles to two lines, so a long title does not stretch a whole card row or force a card onto a clipped sheet on its own. Keep the full title in the printed Work plan, the task dialog and the accessible name. Use the 12 px status icon of [section 9.1](visual-language.md#91-shared-diagram-signs), the same fields and the same finished treatment. Give each card a full text alternative.
- With the print detail preference of [section 7](print.md#7-preview-and-print) off, a parent summary prints its family summary and no family detail. With the preference on, each parent summary also prints its family detail below the cards of its swimlane: a family heading, then one line for each subtask with the 12 px status icon, the title and the state text.
- Publish these legal split positions as `SceneSegment.items`, in board order. There are five item kinds: the first card row of a swimlane together with its stage heading; each further card row; each family heading together with its first subtask line; each further subtask line; an empty swimlane. The paginator splits only between items, so a card or a line never splits.
- Proposed default: a swimlane with no cards prints as one empty swimlane item with its stage heading and the text "No tasks in this stage". Paper shows the same swimlanes as the screen.
- When a swimlane continues on a later fragment, the first item of that fragment repeats the stage badge and the stage title.
- The paginator measures each item one time. The repeated stage heading must not make an item taller after that measurement. Give every item of a swimlane a minimum height equal to the height of the stage heading of that swimlane, with its wrapped title. Thus an item has the same height with and without the repeated heading, and a fragment never overflows its sheet.
- Render the Kanban heading, all four column labels with the total column counts and the shared status key as the `repeat` part (`data-part="repeat"`), so that each fragment repeats them. A board with no cards prints one fragment with its empty explanation.
- Paper has no actions, hints, scrolling, animation, expansion controls, route dimming or connectors. Use the `still` variants of the shared signs and light stage colors, also when browser background graphics are off.

For the stage legend, return `{ kind: 'legend', which: 'stages' }` from `segments`. The shared legend kinds are only `stages`, `milestones` and `bands`. The status key is part of the Kanban scene segment, not a shared legend kind. Legends use the board's landscape orientation.

Reuse [section 7](print.md#7-preview-and-print)'s selection and sheet pipeline. The active screen view does not select print diagrams. Kanban prints after any selected Gantt and Route map, with shared plan content once and one page total. Orientation changes start new sheets. Header, stage overview, Work plan and remarks remain portrait. Preview, its Print button, Cmd/Ctrl+P and browser print fallback use the same Kanban adapter.

Use `kanban_` keys for Kanban-specific column names, counts, empty states, card summaries, family rows, missing fields, action names and future rejection text. Use shared `diagram_` keys for the status key and the family summary. Use `task_expand` and `task_collapse` for the expansion control. Reuse existing status, date, stage, ready-light and task-dialog messages where they already express the same text. The sorted `kanban_` block follows `menu_this_plan` in each of `en`, `de`, `ja` and `zh-TW`. Put word order and punctuation in messages, and use `joinList()` for lists. Regenerate Paraglide with `pnpm i18n`; do not edit generated files.
