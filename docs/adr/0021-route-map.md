# 21. Route map

Status: Proposed (2026-11-13). This record does not claim implementation.

Extends [ADR 19](0019-scene-model.md) through [ADR 20](0020-diagram-views.md). Applies [ADR 13](0013-cycles-are-warnings.md) and [ADR 14](0014-subtasks-depend-only-on-siblings.md). [Section 5.14](../spec.md#514-route-map) defines the behavior and the terms rank, column and panel.

## Context

R11 requires a map with no time axis or duration. A stage is a line. A task is a station. Dependencies make forks, joins and transfers. A parent can expand into a subtask loop. Done and canceled tasks stay visible.

Plans can have undated tasks, cycles and legacy external subtask dependencies. Nested subtasks are invalid input. The schema requires top-level parents. The layout must preserve this data contract.

The diagram-views change (PR #50) merged to `main`. It supplies the shared stage, registry, view contract, motion hooks, viewer preferences and print host. The shared diagram-views owner (ADR 20) owns later shared changes through a shared prerequisite PR and a shared follow-up PR from `main`. The Route map adds local adapters through reserved paths. A documented hook does not prove that its implementation is ready.

## Rules

### Local placement and router

Use a Route map placement algorithm and router under the reserved `src/lib/scene/route-map-*.ts` paths. Keep Gantt's `routeTracks()` unchanged. Do not extend it or use adapter lane allocation to claim compatible six-point paths.

Declare `motion: { routerId: 'route-map', connectorSchema: 'route-map-v1' }`, so `routersCompatible()` with Gantt is false. Consume the shared cross-router transition from the shared follow-up PR. That implementation must merge to `main` before use. The Route map does not own a private replacement for shared motion.

Treat stations and label boxes as obstacles. Reserve focus-outline clearance too. Test stations A, B and C in that physical order on one line. Add an A → C dependency. Its path must bypass B and B's label. Add separate label-obstacle assertions for branch and transfer routes.

### Stored cycle warning identity

Read `dependencyWarnings(index)`. Key cycle flags by the stored `(taskId, dependencyId)` identity. Retain represented stored identities after projection. OR their flags when connectors merge under `lineKey()`.

Use strongly connected components (SCCs) for layout only. Do not derive warnings from membership of a layout component or visible endpoint pair. A grouping-only cycle must not warn.

Test the ADR 13 example in both expand states. P depends on X. X depends on S. S is P's child. S inherits P's dependency on X. `dependencyWarnings()` therefore marks the stored P-depends-on-X identity, as well as X-depends-on-S. Preserve both flags. When S is hidden, project it to P for X's visible connector. Do not create a stored S-depends-on-X identity.

### Bounded paper labels

Keep a bounded label beside each paper station. Give it a stable task reference. If the full title exceeds that bound, print the full title in a separate text continuation with the same reference.

The continuation can split between measured lines across sheets. It must wrap inside unbroken words. Preserve the complete title in reading order. The station and its bounded label stay together. Impose no schema title limit.

### Progress

Calculate **N to go** as `stageProgress(index, stageId).total - stageProgress(index, stageId).done`. Count top-level tasks by effective status. An open parent counts once. Expanding it does not change N. Done and canceled tasks do not add to N.

One open parent with three open children and one open standalone task gives **2 to go**. An empty stage, all-canceled standalone work and an all-canceled family each give zero. The user chose this progress rule.

### Task dialog activation

Station click or Enter/Space opens the task dialog through `EditingState.openDetails(taskId, stationElement)`. Title activation uses the same path. Focus returns to that station. A touch tap on the mark toggles the route under section 5.4. A title tap opens the dialog. The separate parent chevron only expands or collapses.

The dialog currently focuses the stored `EditingState.detailsReturnFocus` element. Reuse it while the station exists. The shared follow-up PR adds a close-time return-focus resolver in `TaskDialog.svelte` and `EditingState`. It finds the current station by task id. Consume it after it merges to `main`; do not patch it locally. Include the missing-target fallback in section 5.14. Do not request a Work plan jump callback. Gantt retains its jump behavior.

## Layout and integration

### First-release layout

Use horizontal lines in stage order. Use generous fixed spacing and simple branch lanes. Use pure local code without a layout package. The first release has no stationary label rail. Compact rank-based packing is an optional refinement.

1. Read effective dependency pairs for ordering. Keep stored dependency identities and warning flags separately.
2. Contract each parent and its children into one layout group. Preserve all task ids. Build group links from effective pairs.
3. Condense SCCs. Assign dependency ranks. Break available-group ties by effective start, creation time and task id. Missing dates sort last. Use sorted member keys for each component and stable key order within it.
4. Allocate columns in that stable order. Give independent same-stage tasks separate positions. Reserve group and label widths before placing successors. Apply the same ordering to the sibling graph inside an expanded parent.
5. Reserve station and label obstacles. Route local dependencies around them. Put backward edges in return gutters. Keep stage guides and membership loops outside dependency identity.

All walks must terminate. Input array order, previous coordinates and random seeds must not affect geometry. Reload, undo and redo reproduce the same scene for equal inputs.

Show all top-level tasks, regardless of date or status. Add children when expanded. Keep the parent station and shared viewer expand state. Use shared effective status and readiness. Keep empty stage lines. Show a localized empty state when there are no stages.

Draw visible dependents' own stored dependencies. Proxy a hidden predecessor child to its visible parent. Omit hidden dependents and duplicate inherited connectors. Preserve legacy external child dependencies. Effective pairs still determine readiness, order and route reachability.

### Scene and input integration

```text
Plan + TaskIndex + expand state
  -> domain/route-map.ts: groups, stored identities, warnings, progress
  -> scene/route-map-*.ts: placement, local router, Scene, paper panels
  -> components/route-map/diagram-view.ts: local registration
  -> shared DiagramStage or paper adapter host
```

Keep domain and scene code pure. Put locale formatting, DOM measurement and input registration in the UI layer. Reuse `StationDot`, `StageBadge`, `lineKey()` and `routeFocusModel()`. Use HTML controls and labels with SVG routes and guides.

Use the single route-focus owner in `EditingState` from [ADR 20](0020-diagram-views.md#viewer-state-and-route-focus). Register intended ids and scoped targets. Remove only this view's registrations. Keep shared hover timing, touch rules, floating ownership and dialog priority. Do not copy stale input across a view switch.

A collapsed route is the union of the parent and hidden children. Guides use endpoint membership for route paint. Grouping strokes use visible-member membership. Neither receives dependency lit overlays. Route focus cannot invent connectors.

Use native button and Tab behavior. Keep full accessible names and text dependency descriptions. Preserve status shapes in forced colors and cycle dots in grayscale. Use Hint rather than native title. Labels and ready lights never dim.

Keep station elements stable for dialog return. Focus a visible parent when collapse hides a child. After deletion, use a surviving parent or the selected switch choice. Test direct child focus and dialog return in both cases.

Mark rendered task boxes, stations, labels, parent ids and scroll containers with the `DIAGRAM_ATTR` marks. The stage samples them for current-frame geometry, including running tweens and label-only origins. Supply connector geometry to the connector-geometry hook that the shared follow-up adds. Use the shared FLIP flight layer for different scrollers and the shared cross-router path for incompatible routers after they merge. Use `motionDuration()` for all motion.

### Paper layout

Use one orientation in the first release: landscape for A4 and US Letter. Build a separate scene at readable paper metrics. Exclude route focus and tweens. The shared host retains selection, page order, orientation changes and page totals.

Measure usable diagram width after margins, repeated labels and continuation gutters. Lay out physical columns before panel assignment. Accumulate whole columns while they fit that width. Cut only at measured column boundaries. A dependency rank is not a physical cut position. Stack panels vertically. Publish each block between legal vertical splits as one `SceneSegment.items` entry. The sheets measure each rendered `data-item` height. No horizontal split axis is needed.

Derive stable column ids from station identities. Derive stable panel ids from ordered column ids and paper metrics. Equal inputs reproduce the ids after reload or input permutation. Keep each station on one panel. Let families split between columns or branch lanes.

Reflow a cell that exceeds panel width before assignment. Bound the station label and wrap at arbitrary word positions. Use the text continuation for excess full-title text. Put excess route gutters in extra lanes. Use a bounded reflow procedure. Every resulting cell must fit usable sheet width and height without clipping or scaling.

Use at most two lines for the station label. Keep it with the station. Allow legal breaks between continuation text lines. Repeat panel ids, stage text, headings and relevant parent labels. Put whole-stage progress at the final terminus.

Use simple paired exit/entry ids for cross-panel and cross-sheet dependencies. Derive each pair from connector identity and boundary. Preserve direction and cycle forms. Detailed destination references, compact rank-based panel packing and automatic orientation choice are optional refinements.

### Ownership and delivery

Use only reserved Route map source paths and `route_map_` keys. The shared `diagram_` keys own names, regions, announcements and print-selection text. German uses the shared name **Linienplan** (`diagram_view_route_map`), because the map is schematic, not geographic. English **Route map**, Japanese **路線図** and Traditional Chinese **路線圖** already exist.

Keep schema and storage unchanged. Register through `src/lib/components/route-map/diagram-view.ts` with `order: VIEW_ORDER['route-map']`. Edit no shared registry, view contract, viewer, Timeline, Gantt, print, domain or state source, `e2e/helpers.ts` or build configuration in this slice. A demonstrated gap goes to the shared prerequisite PR or the shared follow-up PR from `main`.

The shared prerequisite PR merges before this slice registers its view. It makes the shared view-set tests independent of the real views and moves `chooseView` and `expectView` into `e2e/helpers.ts`. Route map and Kanban can merge in either order. The slice that merges second merges the latest `main`, runs the checks again and adds the Route map ↔ Kanban switch and mixed-print checks in its own E2E file. Route map tests assert only Route map and Gantt, never the exact set, count or full order of real views. This slice does not edit `docs/adr/README.md`. Verify owned-key completeness in all four locales. Validate workspace, Preview, print and installed PWA, including offline, during implementation acceptance.

## Alternatives considered

- **Reuse or extend `routeTracks()`.** Use local routing. Gantt has different obstacle and point semantics. Shared cross-router motion supplies the transition.
- **Warn from SCC endpoint membership.** This can lose stored parent warnings from inherited child edges. It can also warn on grouping-only cycles. Use `dependencyWarnings()` by stored identity.
- **Count open leaves.** Count top-level tasks to match `stageProgress()`.
- **Jump to Work plan on activation.** Open the task dialog and return focus to the station.
- **Unbounded full titles beside stations.** A label can exceed sheet height. Use bounded labels and splittable full-title continuations.
- **Force-directed placement or a layout package.** These add constraints or dependencies. Reconsider only if local deterministic routing cannot meet clearance.
- **Shrink the map to one paper width.** This reduces readability. Measured panels preserve text size and the existing vertical split contract of `SceneSegment.items`.

## Consequences

- Placement and routing stay local. Gantt routing does not change. The shared incompatible-router transition is a delivery gate.
- Warning identity survives inheritance, projection and merging. Layout cycles remain separate from warnings.
- The user chose top-level progress and task dialog activation with station focus return.
- Wide maps require scrolling and paper panels. Large families and arbitrary titles require measured, splittable paper output.
- The minimal first release uses fixed spacing, simple lanes, one paper orientation and paired continuation ids. Packing and destination-detail refinements can follow later.
- Shared adapter readiness and required deferred motion remain integration gates. This documentation does not mark them complete.
- Export, storage and offline data contracts stay unchanged.
