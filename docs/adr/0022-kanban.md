# ADR 22: Kanban leaf board and command seam

Status: Proposed.

Date: 2026-11-13.

## Context

Kanban is a view inside the Timeline section. It keeps one task identity across views under [specification section 5.13](../spec.md#513-diagram-views). Cards have a fixed height and a two-line title clamp. Dependency lines show only during route focus. The user chose a read-only first release with an API that permits later status drag without a board rewrite. The user also chose task dialog activation through `EditingState.openDetails`, with focus return to the same card. Use one shared vertical scroll region with sticky column headings. Cross-column FLIP flights are not required. Use a flat board without stage swimlanes, in Blocked, Todo, In progress and Done order. Cards show a stage badge and parent title where applicable.

The existing specification and `boardColumn()` already define leaves-only membership and four columns. Blocked and Todo are derived from stored `todo` and readiness. Canceled tasks have no column. The board must use that calculation. It must not add a status, a card-position field or another readiness algorithm.

ADR 20 owns the shared registry, stage, view preference, print selection, motion and scroll hooks. PR #50 merged these parts to `main`:

- The view contract (`view-contract.ts`, with `VIEW_ORDER.kanban` = 20) and the registry, which discovers each `src/lib/components/**/diagram-view.ts` module (`view-registry.ts`).
- The stage (`DiagramStage.svelte`) with the view switch, viewer fields, task-id focus transfer, FLIP of task boxes by id, layer cross-fade and recapture on interruption.
- The DOM geometry marks (`DIAGRAM_ATTR`), `captureGeometry()` and the scroll-container hooks (`diagram-motion.ts`).
- The generic paper adapter (`DiagramPaperAdapter`) and `SceneSegment` print path.

These parts are deferred shared work: the FLIP flight layer across scroll containers, cross-router connector motion, the close-time return-focus resolver and a per-view focus reveal. One open shared motion and focus follow-up PR (#57) from `main` supplies them. Kanban consumes a capability only after it merges to `main`. Cross-column flights are not required.

Kanban and Route map have no technical dependency on each other. Either slice can merge first. The slice that merges second merges the latest `main`, runs `pnpm lint`, `pnpm check`, `pnpm test:unit --run`, targeted E2E checks (`pnpm exec playwright test e2e/kanban.e2e.ts --trace off`) and `pnpm test:e2e:fixtures` again, and leaves the full E2E suite to CI. The shared prerequisite PR (#58) is merged on `main`. It made the exact-view-set tests independent of the registered views, moved `chooseView` and `expectView` into `e2e/helpers.ts`, replaced non-Gantt `Scene.breaks` references with `SceneSegment.items` and amended ADR 20 for either merge order.

## Proposed decision

The Kanban section in [the specification](../spec.md#kanban) defines the behavior. This record remains Proposed.

### Board model

- Build a pure Kanban scene from the plan and shared task index. Keep its modules under `src/lib/scene/kanban-*.ts`. They do not import Svelte or the UI registry.
- Include childless tasks and subtasks. Omit tasks with subtasks and canceled leaves. Call the existing `boardColumn()` for every eligible leaf. Keep Blocked, Todo, In progress and Done in that order, including empty columns.
- Use one flat board without stage swimlanes. Each card shows a stage badge; a subtask also shows its parent title. Filter the existing stage and parent/subtask traversal into columns. Keep start-date and creation-time ordering. Do not add a second parent card. Board membership does not depend on expanded table rows.
- Use fixed-height HTML cards. Reuse the shared station dot, ready light and stage badge. Add the 4 px leading stage rule. Show stage title, parent context, owners and dates in reserved lines. Keep full values in accessible text and Task details.
- Use one shared vertical scroll region for all columns and sticky column headings/counts. Use a horizontal strip on narrow screens. Done has no automatic archive or card cap. Canceled items stay in the Work plan and Task details.

### Derived columns and later drag

The first board has no drag or status control. A separate intent resolver is the seam for a later drag release. The input has `sourcePlanId`, `taskId` and target `BoardColumn`. It returns a status-change request, a rejection reason or a no-op. It reads the current plan and task index at commit time, rejecting a source-plan mismatch before task lookup. Explicitly cancel pending intents on every plan activation or diagram-view switch. Switching away and back never revives an intent, even when task ids match. This explicit-cancel policy needs no activation token.

| Future target | Result                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| In progress   | Request `updateTask(workspace, taskId, { status: 'in_progress' })`.                                                       |
| Done          | Request `updateTask(workspace, taskId, { status: 'done' })`.                                                              |
| Todo          | Evaluate the leaf with hypothetical stored `todo`. Request `status: 'todo'` only if shared derivation puts it in Todo.    |
| Blocked       | Evaluate the leaf with hypothetical stored `todo`. Request `status: 'todo'` only if shared derivation puts it in Blocked. |

Reject an incompatible derived target. Do not remove dependencies or promise a column that the shared calculation cannot produce. Reject missing or canceled tasks, parents, stale source plans and unavailable targets. An unchanged column is a no-op. Do not call `moveTask()`, which changes stage or hierarchy. A successful status change calls `updateTask()` once and uses its existing parent expansion, persistence and undo behavior. No drag command is connected in the first release. The later release must add keyboard operation and result announcements.

### Route focus and actions

Use the single route owner, scoped targets through `diagramRouteTargets()`, effective graph projection and the shared `lineKey()` helper from [ADR 20](0020-diagram-views.md#viewer-state-and-route-focus) and [specification section 5.4](../spec.md#route-focus). Keep edge identity independent of visibility. Hide every connector without route focus, including cycle connectors. During route focus, draw only route-member edges with actual eligible card endpoints. Hide off-route cycle connectors while another route is active, in addition to hiding all connectors at rest. This overrides the shared persistent off-route cycle warning rule. Test an unrelated `X↔Y` cycle while route `A→B` is active, then activate `X` and verify its warning connectors. Keep hidden parents and canceled tasks in the graph for readiness and traversal. Do not create proxy parent cards or new transitive edges.

Click, Enter and Space on the main action open Task details through the existing `EditingState.openDetails`; focus returns to the same card. Use a separate leading station target for touch route focus. Main-action activation must not also toggle the touch route. The optional close-time return-focus resolver comes from the shared motion and focus follow-up PR. The current `TaskDialog.svelte` close handler focuses only the stored `EditingState.detailsReturnFocus` element. The resolver lets the board find/reveal the current card by captured plan id and task id, or use the selected diagram choice if the card is absent or the view changed. Preserve the stored-element return path when no resolver is supplied. No new shared opener or Work plan jump callback is needed. Use normal list and button semantics with keyboard card navigation. Do not advertise drag behavior.

An isolated parent input remains an active route without lit cards. Shared projection does not union child routes unless a visible collapsed parent row requests it. Kanban supplies leaf rows only. The exact fixture has parent `P`, children `C1`/`C2` and unrelated leaf `U`, all stored `todo` with empty dependency lists. Input `P` gives active ids `{P}`, no lit cards or edges, and dimmed cards `C1`/`C2`/`U`. Do not request a child-route union in this slice. This verifies integration with the shared route-focus API in ADR 20.

### Motion dependency and ownership

Register through `src/lib/components/kanban/diagram-view.ts` with `order: VIEW_ORDER.kanban`. Supply the screen renderer, paper adapter and motion description without central imports or cases in shared files. The stage reads geometry from DOM marks; views do not report geometry. Put `data-diagram-task` on each card box, `data-diagram-station` on the station dot (pass the task id to `StationDot` or `TaskMark`), `data-diagram-label` on the main action, `data-diagram-parent` on subtask card boxes and an empty `data-diagram-scroller` on the vertical region and the strip. `captureGeometry()` reads them in the current frame. A removed card has no record. Declare `motion: { routerId: 'kanban', connectorSchema: 'kanban-v1' }`.

Keep all column moves on one board surface. Animate reorders and status moves with local geometry motion in that shared scroll region; cross-column FLIP flights are not required. The landed stage moves real task boxes by id with FLIP, without flight copies. Verify it with the Kanban scroller at nonzero offsets, with interruption and with reduced motion. Request the shared flight layer or cross-router fade/move/fade from the shared motion and focus follow-up PR only if this verification fails Appendix C. Do not add a private flight layer in Kanban.

Keep Appendix C's task-id box morph, station cue, current-frame retargeting, parent and undated-task origins, focus transfer and single announcement. Flight copies, if a shared flight layer is used later, are inert. Use `motionDuration()` for all motion. Reduced motion swaps immediately and leaves no temporary layer. The View Transitions API is excluded.

### Paper and localization

Use a landscape adapter with four columns for A4 and US Letter. Use a separate paper scene in one `SceneSegment` with one item per complete card row. The paginator splits only between items. Render the board heading and column labels/counts as the repeat part, so that each continuation repeats them. Include all eligible leaves, not only the screen viewport. Short columns stay blank on later fragments. Use the board's leaf set independently of table expansion; no expansion preference changes. Keep paper static, without route lines or dimming.

Reuse ADR 20's selection, generic scene segments, orientation changes, legends and shared page numbering. Declare the stage legend as `{ kind: 'legend', which: 'stages' }`. Draw any status key inside the Kanban scene segment; do not add a shared legend kind. A demonstrated gap in a generic hook goes to a shared PR from `main`, owned by the diagram-views owner. Do not add a second print path. Use only `kanban_` locale keys for new board text. Insert them directly after `menu_this_plan`. The shared name `diagram_view_kanban` and the diagram announcements already exist on `main`.

## Alternatives considered

- **Store Blocked as a fifth status.** This duplicates readiness and changes the plan contract. It can become stale when a dependency changes.
- **Show parents and subtasks as independent cards.** This counts the same work twice and gives a derived parent a misleading status-drop target. A parent context line keeps the hierarchy visible.
- **Add stage swimlanes now.** Use a flat board. Stage badges and parent titles give context. Swimlanes are not an open question for v1.
- **Put canceled items in a fifth column.** This changes the existing `boardColumn()` contract. Keep them in the Work plan unless the user requests a separate scope change.
- **Drop into either derived column and accept whichever result occurs.** This can place a card outside the requested target. Validate the hypothetical shared state and reject an incompatible target.
- **Enable drag in the first release.** The first release is read-only. Keep a command seam and defer gesture behavior, keyboard drops and announcements.
- **Use independent vertical column scrollers.** Use shared vertical scrolling with sticky headings. Independent scrollers would add coordinate and cross-column flight requirements that v1 does not need.
- **Implement local flight or print machinery.** This competes with ADR 20 and breaks strict shared-file ownership. Request a shared change from `main` instead.

## Consequences

- No schema, dependency, stored-status or manual-order change is required. Export, backup and offline persistence keep their current contract.
- The same shared derivation controls the Work plan, ready light and board. A dependency edit can move a stored `todo` card without a direct status edit.
- Unbounded Done cards keep all work available but can make large boards expensive. Use an all-Done fixture with 300 childless tasks `D001`–`D300`, no dependencies and counts 0/0/0/300. Reach the first and last cards by pointer and keyboard. Verify fixed `11rem` screen and 34 mm paper heights, sticky headings, and complete A4/Letter pagination with every id exactly once and no split cards. Give `D150` a title of 512 consecutive `W` characters; keep two title lines without card growth or column overflow and retain its full accessible title. Virtualization is outside this slice.
- A parent or canceled endpoint can be absent from the board. Some route paths therefore have no drawn connector. The graph remains complete; Task details provides full dependency context.
- The read-only renderer stays separate from future intent resolution and command dispatch. A later drag release can add input without replacing the board model. `DiagramViewProps` has no command callback; views edit through `commands.ts` from context. A later dispatcher calls `updateTask(getWorkspace(), taskId, patch)` once, so the shared contract needs no change. Tests cover only the local resolver and a dispatcher that calls `updateTask()` once. Do not ask for speculative command APIs or connect production drag.
- The shared return-focus resolver and per-view reveal are delivery gates for those behaviors. Source work can proceed against the landed contract, but hooks alone are not proof that the feature can merge.
- The Kanban slice changes only its reserved source paths, its spec section, ADR 22 and `kanban_` keys. It does not edit `docs/adr/README.md`; row 22 already exists. A separate docs change sets its status and date after acceptance. This documentation pass changes no source, test or catalog.
