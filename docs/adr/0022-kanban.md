# ADR 22: Kanban leaf board and command seam

Status: Proposed.

Date: 2026-11-13.

## Context

Kanban is a view inside the Timeline section (D9). It keeps one task identity across views (R10). Cards have a fixed height and a two-line title clamp (D10). Dependency lines show only during route focus (D11). D49 decides that the first release is read-only, with an API that permits later status drag without a board rewrite. D50 decides that card activation uses `EditingState.openDetails` and focus returns to the same card. D60 decides one shared vertical scroll region with sticky column headings and no cross-column FLIP flight. D61 decides a flat board without stage swimlanes, in Blocked, Todo, In progress and Done order, with a stage badge and parent title on cards.

The existing specification and `boardColumn()` already define leaves-only membership and four columns. Blocked and Todo are derived from stored `todo` and readiness. Canceled tasks have no column. The board must use that calculation. It must not add a status, a card-position field or another readiness algorithm.

ADR 20 owns the shared registry, stage, view preference, print selection, motion and scroll hooks. These contracts are proposed; the current stack does not yet implement all of them. The preliminary PR defers the FLIP flight layer and cross-router connector implementation. Required shared cross-view support must land in that PR or a shared follow-up before a slice consumes it. A demonstrated common transition surface may satisfy the cross-view contract without flights. D60 removes the cross-column flight requirement. Route map merges before Kanban (D14).

## Proposed decision

The existing Kanban section in [the specification](../spec.md#kanban) defines the proposed behavior. D49, D50, D60 and D61 are **Decided**. All other design choices below remain **Proposed defaults** and need review. This record does not accept them on behalf of the user.

### Board model

- Build a pure Kanban scene from the plan and shared task index. Keep its modules under `src/lib/scene/kanban-*.ts`. They do not import Svelte or the UI registry.
- Include childless tasks and subtasks. Omit tasks with subtasks and canceled leaves. Call the existing `boardColumn()` for every eligible leaf. Keep Blocked, Todo, In progress and Done in that order, including empty columns.
- **Decided (D61):** Use one flat board without stage swimlanes. Each card shows a stage badge; a subtask also shows its parent title. **Proposed default:** Filter the existing stage and parent/subtask traversal into columns. Keep start-date and creation-time ordering. Do not add a second parent card. Board membership does not depend on expanded table rows.
- Use fixed-height HTML cards. Reuse the shared station dot, ready light and stage badge. Add the 4 px leading stage rule. Proposed metadata is stage title, parent context, owners and dates in reserved lines. Keep full values in accessible text and Task details.
- **Decided (D60):** Use one shared vertical scroll region for all columns and sticky column headings/counts. **Proposed default:** Use a horizontal strip on narrow screens. Done has no automatic archive or card cap. Canceled items stay in the Work plan and Task details.

### Derived columns and later drag

The first board has no drag or status control. A separate intent resolver is the seam for a later drag release. The **Proposed default** input has `sourcePlanId`, `taskId` and target `BoardColumn`. It returns a status-change request, a rejection reason or a no-op. It reads the current plan and task index at commit time, rejecting a source-plan mismatch before task lookup. Explicitly cancel pending intents on every plan activation or diagram-view switch. Switching away and back never revives an intent, even when task ids match. This explicit-cancel policy needs no activation token.

| Future target | Proposed result                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| In progress   | Request `updateTask(workspace, taskId, { status: 'in_progress' })`.                                                       |
| Done          | Request `updateTask(workspace, taskId, { status: 'done' })`.                                                              |
| Todo          | Evaluate the leaf with hypothetical stored `todo`. Request `status: 'todo'` only if shared derivation puts it in Todo.    |
| Blocked       | Evaluate the leaf with hypothetical stored `todo`. Request `status: 'todo'` only if shared derivation puts it in Blocked. |

Reject an incompatible derived target. Do not remove dependencies or promise a column that the shared calculation cannot produce. Reject missing or canceled tasks, parents, stale source plans and unavailable targets. An unchanged column is a no-op. Do not call `moveTask()`, which changes stage or hierarchy. A successful status change calls `updateTask()` once and uses its existing parent expansion, persistence and undo behavior. No drag command is connected in the first release. The later release must add keyboard operation and result announcements.

### Route focus and actions

Use the single D44 route owner, scoped targets, effective graph projection and shared line-key helper. Keep edge identity independent of visibility. Hide every connector without route focus, including cycle connectors. During route focus, draw only route-member edges with actual eligible card endpoints. **Proposed default — Kanban override:** Hide off-route cycle connectors while another route is active, in addition to hiding all connectors at rest. This overrides the shared persistent off-route cycle warning rule. Test an unrelated `X↔Y` cycle while route `A→B` is active, then activate `X` and verify its warning connectors. Keep hidden parents and canceled tasks in the graph for readiness and traversal. Do not create proxy parent cards or new transitive edges.

**Decided (D50):** Click, Enter and Space on the main action open Task details through the existing `EditingState.openDetails`; focus returns to the same card. **Proposed default:** Use a separate leading station target for touch route focus. Main-action activation must not also toggle the touch route. Request only an optional close-time return-focus resolver from PR #50. The current `TaskDialog.svelte` close handler (near line 116) focuses a stored element only. The resolver lets the board find/reveal the current card by captured plan id and task id, or use the selected diagram choice if the card is absent or the view changed. Preserve the stored-element return path when no resolver is supplied. No new shared opener or Work plan jump callback is needed. Use normal list and button semantics with keyboard card navigation. Do not advertise drag behavior.

An isolated parent input remains an active route without lit cards. Shared projection does not union child routes unless a visible collapsed parent row requests it. Kanban supplies leaf rows only. The exact fixture has parent `P`, children `C1`/`C2` and unrelated leaf `U`, all stored `todo` with empty dependency lists. Input `P` gives active ids `{P}`, no lit cards or edges, and dimmed cards `C1`/`C2`/`U`. Do not request a child-route union in this slice. This is integration evidence for the existing D44 API, not a shared change.

### Motion dependency and ownership

Register through `src/lib/components/kanban/diagram-view.ts`. Supply the screen renderer, scene adapter and paper adapter without central imports or cases in shared files. Each card reports its current rendered geometry, station and label anchors, parent id, shared board scroll-container identity, bounds, shared vertical/horizontal offsets and reveal hook. Use the shared coordinate conversion and lifecycle hooks.

D60 keeps all column moves on one board surface. Animate reorders and status moves with local geometry motion in that shared scroll region; cross-column FLIP flights are not required. The cross-view transition gate stays. PR #50 or a shared follow-up must prove Appendix C behavior with current offsets, interruption, inert copies where needed and immediate reduced motion. Distinct transition surfaces need the shared flight implementation; a demonstrated common surface can satisfy the contract without it. Hooks alone do not close this gate. Request missing shared support from `feat/diagram-views`; do not add a private flight layer in Kanban. Required cross-router fade/move/fade support has the same gate.

Keep Appendix C's task-id box morph, station cue, current-frame retargeting, parent and undated-task origins, inert flight copies, focus transfer and single announcement. Use `motionDuration()` for all motion. Reduced motion swaps immediately and leaves no temporary layer. The View Transitions API is excluded.

### Paper and localization

Propose a landscape adapter with four columns for A4 and US Letter. Use a separate paper scene and legal `Scene.breaks` between complete card rows. Repeat the board heading and column labels/counts. Include all eligible leaves, not only the screen viewport. Short columns stay blank on later fragments. Use the board's leaf set independently of table expansion; no expansion preference changes. Keep paper static, without route lines or dimming.

Reuse ADR 20's selection, generic scene segments, orientation changes, legends and shared page numbering. Request a missing generic hook from the shared owner. Do not add a second print path. Use only `kanban_` locale keys for new board text. Shared names and announcements remain with the preliminary PR.

## Alternatives considered

- **Store Blocked as a fifth status.** This duplicates readiness and changes the plan contract. It can become stale when a dependency changes.
- **Show parents and subtasks as independent cards.** This counts the same work twice and gives a derived parent a misleading status-drop target. A parent context line keeps the hierarchy visible.
- **Add stage swimlanes now.** D61 decides a flat board. Stage badges and parent titles give context. Swimlanes are not an open question for v1.
- **Put canceled items in a fifth column.** This changes the existing `boardColumn()` contract. Keep them in the Work plan unless the user requests a separate scope change.
- **Drop into either derived column and accept whichever result occurs.** This can place a card outside the requested target. Validate the hypothetical shared state and reject an incompatible target.
- **Enable drag in the first release.** D49 requires read-only first. Keep a command seam and defer gesture behavior, keyboard drops and announcements.
- **Use independent vertical column scrollers.** D60 decides shared vertical scrolling with sticky headings. Independent scrollers would add coordinate and cross-column flight requirements that v1 does not need.
- **Implement local flight or print machinery.** This competes with ADR 20 and breaks strict shared-file ownership. Request the shared prerequisite instead.

## Consequences

- No schema, dependency, stored-status or manual-order change is required. Export, backup and offline persistence keep their current contract.
- The same shared derivation controls the Work plan, ready light and board. A dependency edit can move a stored `todo` card without a direct status edit.
- Unbounded Done cards keep all work available but can make large boards expensive. Use an all-Done fixture with 300 childless tasks `D001`–`D300`, no dependencies and counts 0/0/0/300. Reach the first and last cards by pointer and keyboard. Verify fixed proposed `11rem` screen and 34 mm paper heights, sticky headings, and complete A4/Letter pagination with every id exactly once and no split cards. Give `D150` a title of 512 consecutive `W` characters; keep two title lines without card growth or column overflow and retain its full accessible title. Virtualization is outside this slice.
- A parent or canceled endpoint can be absent from the board. Some route paths therefore have no drawn connector. The graph remains complete; Task details provides full dependency context.
- The read-only renderer stays separate from future intent resolution and command dispatch. A later drag release can add input without replacing the board model. S7 checks PR #50's actual context types against its existing command-callback contract with a typed test adapter that calls `updateTask()` once. Request only a specific failed capability; do not ask for speculative command APIs or connect production drag.
- Shared motion and dialog handoff are delivery gates. Source work can proceed against the agreed contract, but hooks alone are not proof that the feature can merge.
- The Kanban slice changes only its reserved source paths, its spec section, ADR 22, ADR index row 22's status/link and `kanban_` keys. This documentation pass changes no source, test or catalog.
