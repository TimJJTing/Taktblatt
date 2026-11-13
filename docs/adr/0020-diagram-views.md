# 20. Diagram views and print selection

Status: Proposed (2026-11-13). Keep this status until implementation is accepted.

Amends [ADR 4](0004-viewer-state.md) and extends [ADR 19](0019-scene-model.md).

## Context

The Timeline mounts the Gantt directly. The viewer has no diagram choice. The print model and sheets have a Gantt segment and Gantt paper geometry. The route map and Kanban need the same tasks, shared signs, route focus and print output.

The user wants a view switch inside the Timeline section. A task must keep its identity during a switch. The user also wants to select any one, any two or all three diagrams for print. Gantt is the default. These choices belong to the browser, not the plan.

The preliminary `feat/diagram-views` PR owns the shared machinery. The `feat/route-map` and `feat/kanban` slices stack on it. They must add their views through their own modules. They must not change shared source files owned by the preliminary PR. Shared documents and catalogs use section and key ownership below. The user chose to put the switch in this preliminary PR. The view preference is global. Print selection is independent of the screen view. The shared API must permit later Kanban drag commands.

## Decision

### Registry and stage

- Add a typed view contract and a registry. Each entry has a stable id, a fixed order, a localized label, a screen renderer, a scene adapter and a paper adapter. Gantt is the required first entry. The known order is `gantt`, `route-map`, `kanban`.
- Discover registration modules from a fixed local module pattern at build time. Use `src/lib/components/**/diagram-view.ts` for the registration entries. Keep the contract and registry outside this pattern. Each entry exports its definition. Discovery collects and validates those definitions before viewer values resolve. No network request or central list edit is required to add a view. Duplicate ids are an error.
- Keep Svelte components and discovery in the UI layer. `src/lib/scene/` and `src/lib/domain/` stay pure. The UI registry supplies pure scene and paper adapters. The print model receives prepared diagram descriptors. It does not import a Svelte component or the UI registry.
- Mount `DiagramStage` in place of the direct Gantt mount in `Timeline.svelte`. Timeline keeps ownership of its heading, pin, height, collapse and legends. The stage owns view rendering, transition coordination and task-id focus transfer. The switch reads the registry. Hide it when only Gantt is registered. Keep single-Gantt behavior unchanged.
- Use the scene identity and signs from ADR 19. The motion adapter below supplies current geometry, coordinate conversion, transition hooks and scroll-container hooks. Continue from current rendered geometry on interruption. Reduced motion swaps at once. Section 5.13 of the specification keeps the final motion target from Appendix C. This PR defers the FLIP flight layer and cross-router connector interpolation implementations. It supplies their hooks only. Any deferred shared implementation must merge in this PR or a follow-up shared PR before its consuming slice. Do not assign shared implementation to a diagram slice.
- Keep task focus by id when focus was in the outgoing diagram. If the destination has no target, focus the selected switch choice. A change from the switch keeps focus there. Do not take focus from the Work plan or a dialog. One polite live region announces the effective view after the switch.

### Motion adapter contract

The UI view adapter exposes these hooks. Geometry reads are synchronous. They sample the rendered frame, including a running tween, rather than only the target scene.

| Hook                  | Contract                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current task geometry | Read by stable task id. Return the current box (`x`, `y`, `w`, `h`, `radius`) or `null`, plus the current station anchor and label position. Return no record only when the task has no rendered representation.                                                                                                                           |
| Coordinate conversion | Convert a point or box from view-local coordinates to stage coordinates in CSS pixels. The Gantt date area and sticky label area have distinct origins. Account for their offsets, current horizontal and vertical scroll, and the stage origin. Recompute after scroll or resize and on each transition capture.                          |
| Station anchor        | Supply the current center and radius of the task's identity station. Keep it aligned with the current box during a tween. A label-only task has no station; return `null` and use its label position as the transition anchor.                                                                                                             |
| Label-only geometry   | A task with no scene box, including a task with no dates, still supplies its rendered label position. Do not invent a box from target scene geometry or drop the task from transition capture. Convert label positions from the label area to the stage.                                                                                   |
| Parent origin         | For an emerging subtask with no outgoing record, supply its parent id and the parent's current box and station anchor. Use the parent's label position if it has no box. If neither is rendered, use the destination position and fade in. This motion origin does not change focus fallback.                                              |
| Router compatibility  | Expose a router id and a pairwise compatibility flag. The flag is true only when both adapters agree that connector point counts and meanings match. Otherwise it is false. Expose current rendered connector points for compatible retargeting. Gantt reads its current edge tweens. A false flag selects the deferred cross-router path. |
| Transition lifecycle  | Supply capture, apply, finish and cancel hooks keyed by task id. A new capture reads the current frame before canceling old motion. Apply uses stage geometry converted to the destination space. Finish and cancel remove temporary state. All durations use `motionDuration(ms)`.                                                        |
| Scroll containers     | Supply each task's scroll-container identity, viewport bounds and current scroll offsets. Expose a focus-reveal hook and mark transition/reveal scrolling as app scrolling. These hooks permit a later flight layer across distinct containers.                                                                                            |

This PR owns required changes to `Gantt.svelte` and `GanttRow.svelte`. Implementation note: each view marks its rendered task nodes with `data-diagram-task`, `data-diagram-label`, `data-diagram-parent` and an inner `data-diagram-station` marker (`DIAGRAM_ATTR` in `view-contract.ts`). `GanttRow` marks its mark box, label and parent id. `TaskMark` marks the identity station. The stage reads these nodes with `getBoundingClientRect` in `diagram-motion.ts`. That read samples the current rendered frame, including running tweens and transforms. It also includes the sticky label area, all scroll offsets and the stage origin, so one conversion covers the date area and the label area. Unmounted nodes have no record, so teardown needs no separate report removal. The FLIP keyframes carry their transform origin, so finish and cancel leave no inline style. The layout-change state counts active changes, so a stage change and a Timeline height change do not end each other. Gantt edge tweens are not yet exposed as connector points; that read belongs to the deferred cross-router work. Reading only `scene.geometry.nodes` is insufficient. Preserve immediate width-only Gantt reroutes.

The stage gives each rendered view a layer context (`diagram-layer.ts`). An outgoing layer is inactive and inert. Its view returns no intended route ids, so its targets lose route input before its DOM exits.

### Test-only registration

- Expose `createViewRegistry(definitions)` in the UI registry. Production discovery passes the real definitions. Component tests pass real and fixture definitions to a fresh registry and inject it into the stage and Preview. Use the same validation and ordering in both cases. Do not mutate a global registry.
- Keep fixture registration modules under `e2e/fixtures/diagram-views/**`, outside `src/lib/components/**/diagram-view.ts`. This PR owns those fixtures, `vite.config.ts`, `playwright.config.ts`, `playwright.fixtures.config.ts` and any required virtual-module type declaration.
- Vite supplies `virtual:diagram-view-fixtures`. With the build-time environment flag `TAKTBLATT_DIAGRAM_FIXTURES=1`, it imports a fixed list of fixture definitions. Otherwise it exports an empty list and imports no fixture code. Combine this list with real discovery before viewer normalization. A URL, stored field or runtime toggle cannot enable fixtures.
- Playwright uses a separate flagged build for scenarios tagged `@diagram-fixtures`. The flagged run selects those scenarios; the normal run excludes them. Stop the server before each build. Never reuse a normal server for fixture tests or a fixture server for production checks. The flagged run (`pnpm test:e2e:fixtures`) serves on port 4174 and never reuses a server. The normal run keeps port 4173. The flagged build writes to `.svelte-kit-fixtures/` and `build-fixtures/`, so it never replaces the production output in `.svelte-kit/` and `build/`.
- The fixtures are `test-list` (portrait) and `test-board` (landscape) in `e2e/fixtures/diagram-views/`. `tsconfig.json` includes that folder, so `pnpm check` and lint check the fixtures.
- Check an unflagged production build through the browser. Its effective registry must contain exactly the registered real views, with Gantt alone in this PR. The switch and print group must stay hidden. Fixture ids must be unavailable through stored preferences. Check that the production output contains no fixture modules. The flagged suite proves additive screen and paper registration without shared-file edits.

### Viewer state and route focus

- Add `diagramView` and `printDiagrams` under `taktblatt:ui`. Both are global browser preferences across plans. Their defaults are `gantt` and `[gantt]`. They are independent. Neither is plan data, a backup field, an undo step or a schema change.
- Resolve an absent, invalid, unknown or unregistered view to Gantt. Treat an absent or non-array `printDiagrams` value, including `null`, a scalar or an object, as the default. For arrays, retain only known registered string ids, remove duplicates and use print order. If none remain, select Gantt. Invalid new fields do not reset valid older viewer fields.
- Preserve the existing stored pin and height names, `ganttPinned` and `ganttHeight`. They continue to apply to the whole Timeline section. Do not add per-view height or pin settings.
- Reuse the shared route-focus contract in ADR 19. Keep one `RouteFocusState` owned by `EditingState`. Each view uses `view(() => intendedIds)`, its registration cleanup and its scoped `target` action. Reconcile outgoing intended ids before exit DOM is removed. Dispose only that view's targets. Keep neutral route attributes, document focus handling, timers and floating ownership in the shared owner. A switch does not copy stale input to the new view.
- The view context permits callbacks for view-level task commands. It does not define a read-only constraint for every view. Future content edits must use `src/lib/state/commands.ts`. The first Kanban implementation is read-only. Status editing stays in the Work plan and task dialog. This PR adds no drag behavior.

### Print selection and adapters

- Add a labeled checkbox group in the Preview toolbar after paper size and before Print. Hide it when Gantt is the only entry. Prevent removal of the last selection. Store the selection in viewer state. Screen view changes do not select a print diagram.
- Preview, its Print button, direct keyboard print and the browser print fallback use the same selection and sheet renderer. Only registered diagrams can be selected. The default output stays Gantt only.
- Segment ids stay unique. If a diagram repeats an id that an earlier segment uses, the print model prefixes it with the diagram id.
- Prepare selected paper diagrams in registry order. The header and objective come first. Finish each diagram and its legends before the next starts on a new page. Stage overview follows the last diagram. Work plan starts on a new page. Remarks follow. Shared plan content prints once. Page numbering has one total.
- Extend the print contract now with a generic scene segment and paper adapter. It carries diagram identity, paper geometry, legal split positions, repeated labels and orientation. The shared renderer delegates to the registered adapter. Do not add a route-map or Kanban branch to `Sheets.svelte` or `SegmentView.svelte` later.
- A paper scene has no tween. It uses the same task ids and signs with paper metrics. Use `Scene.breaks` to split each diagram independently. Screen focus and route dimming do not enter paper adapters. Each adapter states its required legends and repeated labels.
- Keep the existing Gantt segment and its paper-cache behavior behind the Gantt adapter. Preserve measured-width routing, the one-entry cache, local fragment routing and continuation marks from ADR 19. Adding generic scene segments does not require a Gantt routing rewrite.
- Permit a diagram to request landscape for the selected A4 or US Letter paper. Measure and paginate against that orientation. Use named print-page rules. Start a new sheet at each orientation change, including after the header if the first diagram is landscape and before stage overview if the last diagram is landscape. A diagram's legends use its orientation. Other sections keep their existing portrait layout. The diagram slices define their own paper layout, not a second print pipeline.

### Stacked slice ownership

This decision uses section and key ownership. Source paths remain exclusive. Shared documentation and locale catalogs use the following reserved sections, rows and keys.

| Owner                       | Sections, rows, keys and source paths                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preliminary PR              | Spec sections 4.4, 5.13 and 7 (Preview and print); ADR 20; the whole ADR index, including rows 21 and 22. Set rows 20, 21 (Route map) and 22 (Kanban) to Proposed with links to their ADR files. Own the registry, discovery, stage, switch, viewer fields, generic print integration, shared tests and test-build configuration. Own Gantt registration and all required `Gantt.svelte` and `GanttRow.svelte` adapter changes. |
| Preliminary PR: locale keys | All three view names and every shared label, announcement, diagram-region name, print-group text and selection instruction in `messages/en.json`, `messages/de.json`, `messages/ja.json` and `messages/zh-TW.json`. Use the shared `diagram_` prefix for new shared keys, including all three names. A view's shared name does not use its slice prefix.                                                                        |
| Route map                   | Only spec section 5.14; ADR 21; keys prefixed `route_map_`; `src/lib/components/route-map/**`, `src/lib/scene/route-map-*.ts`, `src/lib/domain/route-map.ts`, `e2e/route-map.e2e.ts` and associated colocated tests. Registration is `src/lib/components/route-map/diagram-view.ts`.                                                                                                                                            |
| Kanban                      | Only the existing "Future: Kanban" spec section, rewritten in place and renumbered later; ADR 22; keys prefixed `kanban_`; `src/lib/components/kanban/**`, `src/lib/scene/kanban-*.ts`, `e2e/kanban.e2e.ts` and associated colocated tests. Registration is `src/lib/components/kanban/diagram-view.ts`.                                                                                                                        |

The ADR index links for rows 21 and 22 point to files that the stacked slice PRs will add.

The catalogs are not sorted. Do not sort unrelated keys. In this PR, append a sorted `diagram_` block after the existing keys in all four catalogs. Route map inserts its `route_map_` block immediately after the existing `$schema` key. Kanban inserts its `kanban_` block immediately after the existing `menu_this_plan` key. Both anchors already exist in all four catalogs and are far apart. Each slice sorts only its own block by key name. Separate insertion points and disjoint prefixes avoid a shared insertion at the end of the catalog. Do not move the anchors or change another owner's block. Use English as the source and regenerate Paraglide; do not edit generated files.

Implementation of the two slices can run in parallel after the shared contract is ready. Route map merges before Kanban. Update Kanban to the merged Route map before final integration. Neither slice edits `docs/adr/README.md` or shared sections and keys.

If a slice finds a gap in the shared contract, fix it in `feat/diagram-views` first and update the stacked branches. Do not patch a shared file separately in both slices. This ownership table takes priority over earlier file assignments. Shared adapter hooks needed for registration belong here. The remaining Gantt cleanup stays out of this PR. If that cleanup needs a file owned here, the supervisor must move it to an earlier shared change before either slice starts implementation.

## Alternatives considered

- **A switch and print integration in each diagram PR.** This duplicates shared work. The slices would change the same files and could give different focus, motion or print behavior.
- **A central list with explicit imports for every view.** It is simple, but each slice must edit a file owned by the preliminary PR. Local registration discovery meets the ownership rule.
- **A diagram field in each plan.** It would change the data contract and make imports change the viewer's choice. The choice is global UI state.
- **Print only the active screen diagram.** This cannot select two diagrams or all three. It also couples screen navigation to paper output.
- **Separate print pipelines for each diagram.** This duplicates paper size, pagination and footer logic. A paper adapter keeps diagram geometry separate while it reuses the sheet pipeline.
- **SVG task nodes or the View Transitions API.** These conflict with ADR 19. HTML task nodes and the existing scene model keep the shared focus and motion contracts.

## Consequences

- Gantt works alone. The switch and print group appear when another module registers.
- The two diagram slices can add their screen and paper renderers without changes to shared source files. Test registrations must prove this before the slices start.
- The preliminary PR must test motion hooks, current-frame capture, focus and print through test-only adapters. Gantt-only checks cannot prove the contract. Flight-layer and cross-router behavior tests belong to the shared implementation that supplies those deferred features before a consuming slice merges.
- Browser preferences survive plan changes and offline reload. Export and backup compatibility stay unchanged.
- The shared print path must support diagram-specific split positions and orientation. Real route-map geometry and Kanban layout remain in their own slices.
- This decision does not add Kanban drag, change route-focus timing or complete the remaining Gantt cleanup.
