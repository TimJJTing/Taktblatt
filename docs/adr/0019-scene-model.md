# 19. Scene model and shared diagram layer

Status: Accepted (2026-11-11). Amended 2026-11-13 (slices 3 and 4). Delivery assignments superseded by [ADR 20](0020-diagram-views.md), which is Proposed until implementation is accepted.

## Context

The Timeline has one diagram: the Gantt. Its geometry is spread across components. `gantt-layout.ts` holds the row height, the clip edges and the connector path. `GanttRow.svelte`, `GanttLine.svelte` and `Gantt.svelte` each hold their own `Tween`. `PrintGantt.svelte` builds the same geometry again with paper sizes.

The connector routing has known faults. `elbowPath` puts the vertical 6 px after the source end for every edge. Two predecessors that end on the same day draw one false merged line. The backward detour can run along a bar. `GanttLine.svelte` tweens only the endpoints, so the path changes shape during the tween.

More diagrams come soon: a route map without a time axis, and a Kanban board (spec, "Kanban"). Both show the same tasks as the Gantt. A switch between diagrams must animate, so that the eye can follow each task. If each view builds its own geometry, each view needs its own tweens, its own print code and its own routing. Then a switch between views has no common key.

## Decision

### Identity and geometry

- The pure folder `src/lib/scene/` holds the scene model. It has no Svelte, no DOM and no store imports. The rules for `src/lib/domain/` apply.
- A `SceneNode` is the identity of a task in a diagram. Its `SceneId` is stable across views, undo, redo and tab sync. Identity does not contain positions.
- Geometry is per view. `NodeGeom` gives the box of one node. `EdgeGeom` gives the points of one edge. A `Scene` holds the nodes, the edges and the geometry of one view at one size.
- A length is `Len { f, px }`. It resolves as `f * extent + px`. A point is `Pt { x: Len, y: Len }`. A time axis can use `f` for the date fraction and `px` for fixed offsets, such as a port radius.

### Routing

- `routeTracks(tracks, edges, metrics)` is a neutral layered router. A track is one row of nodes with a center, a half height, an optional span and the in and out ports. Each port has its actual radius in `Track.inR` or `Track.outR`. This includes shrunk dots and clipped ports. Any view with layered rows can use it. The Gantt and the route map use it. Kanban does not.
- `routePath(points, extent)` resolves the `Len` points at one extent and returns an SVG path.
- The routes use these rules:
  - Each edge has exactly six points. Unused points repeat the point before them. A tween never changes the shape of a path.
  - The variants are `forward`, `direct` and `hook`. Segments are horizontal, vertical or exactly 45°. A 45° segment occurs only as the last segment into a start dot.
  - A trunk is the set of sources with an identical target set. The members of a trunk share one riser. Edges that share only one target do not merge.
  - Each gutter has three lanes: near, boundary and far. Their distances from the target row center are 10, 14 and 18 px on screen, or 6, 9 and 12 px on paper. The far lane can enter the neighboring row band. It keeps at least 5 px clearance from a line edge on screen, or 3 px on paper. Reject a lane outside the body.
  - Each riser has a slot. Compare slot costs in this order: parallel conflicts, end-zone plus approach-zone hits, body crossings, then slot index. Use the first count that differs. Secondary costs cannot outweigh a parallel conflict. An approach hit occurs for a track strictly between the trunk's outer rows that has incoming edges, including a track without a span. Its approach interval is `[inX - Dfar - pitch, inX]`, with both limits included. `Dfar` is 18 px on screen or 12 px on paper. A trunk with a source-row junction starts at slot 1 or higher.
  - Reserve horizontal runs by their physical y position across both target sides. Try the near lane, then the boundary lane, then the far lane. A branch with a hook tries boundary, near, then far. Check each candidate with the same route classifier used to draw the edge. A direct entry reserves no lane and reports lane 0 without overflow. A hook reserves its full run to the entry stub. A branch reserves the union of the runs of all its sources. If all three lanes have conflicts, reuse the near lane and report overflow.
  - `Junction.kind` is `'junction'` for an ordinary ring or `'tap'` for a source tap. Ordinary rings mark joins and continuing branches inside a riser. Their distance from every port is at least `portR + ringR + 2`. Use each port's actual radius and `RouteMetrics.ringR`, which is 3 px on screen or 2 px on paper. Suppress an ordinary ring that fails this clearance. If only slot 0 is available, suppress source-row rings.
  - If `trunk.x < source.outX`, return one tap at `(trunk.x, source.center)` for that source. Set `Junction.source` to its track id. Taps are exempt from ordinary port clearance. Only taps have a source field. Junction keys use trunk and one join or branch role. A join role uses its source id. A branch role uses its target id, approach side and route variant. Mixed direct and hook exits have distinct keys. A straight same-row edge has no riser exit and adds no branch role. For coincident roles, prefer a branch, then sort by role identity. The key excludes other coincident members. Tap keys use trunk and source identity. Row positions are not part of these keys.
  - The port rule shows the direction: a line leaves an end dot and arrives at a start dot.
- Exact ports take precedence over the usual minimum segment length for short or chart-edge segments. Aligned ports can enter vertically. Forward ports on the same row use a straight route. A hook at the left chart edge can omit its final stub, so the route stays inside the chart.
- Near the right chart edge, a riser can lie left of the out port inside the source task line; its first segment runs backward under the task line because connectors are drawn below task lines.
- Routing is pure and deterministic. Sort keys are intrinsic (span, row, id). The output does not depend on the input order or on an earlier result. There is no hysteresis. Undo and redo give the same picture, print equals the screen, and an unrelated edit does not move a line.
- Fields that only tests need (`variant`, `slot`, `lane`, `overflow`) stay on a router result type. They are not part of `EdgeGeom`.

### Rendering

- Task nodes are HTML in every view. Only edges and guides are SVG. HTML nodes keep text layout, focus, accessible names and hints (`Hint.svelte`).
- Row and range transitions tween the Gantt geometry by stable id. A second change continues from the current position. Marks, station sizes, taps and rings use the same geometry timing. One shared geometry-tween helper compares target coordinates. Equal targets do not restart a running tween. Diagram switches retain their separate view-transition duration.
- Routing uses resolved ports and metrics at the current width. A width change requires new routes to keep the bend angles and clearances. The shared helper applies current-width geometry at once with duration 0, including during a running tween. Do not interpolate resolved old-width points against a new-width chart.
- Measure the timeline width synchronously when its action starts. In the ResizeObserver callback, assign the current container width directly when it changes. Do not defer the assignment to an animation frame, add a window resize listener or call `flushSync`.
- The shared Today-tag placement rule keeps the 7 px milestone half-width clear on both sides of the Today line. This includes a milestone on the same date. Screen and paper use this rule. If neither side fits, clamp the tag inside the date area.
- A FLIP flight layer is used only when the source and the target position are in different scroll containers.
- The app does not use the View Transitions API.
- `src/lib/motion.ts` holds the motion constants. `GEOMETRY_MOTION_MS = 240` is for geometry changes in a view. It replaced `ROW_MOTION_MS` in `gantt-layout.ts`. `VIEW_MOTION_MS = 300` is for a switch between views. All durations still go through `motionDuration(ms)`. `TIMELINE_MOTION_MS` is section chrome, not diagram geometry, and stays where it is.

### Shared signs

- `src/lib/components/diagram/` holds the signs that every diagram shares: `StationDot`, `TaskMark`, `TaskTap`, `DiagramRing` and `StageBadge`.
- Signs with motion follow the `ReadyDot` pattern. A `still` property gives the paper variant, without transition and without animation.
- `StationDot` carries the status form: ring = todo, half = in progress, solid = done, ground-filled ring with a diagonal slash = canceled. Done and canceled dots use the full stage color. A canceled task line uses a 40 % color mix of the stage color with the ground. The forms differ in forced colors and grayscale print. Use these forms in every view and on paper.
- `StageBadge` uses the stage badge text rule: white text on light fills, ground-color text on dark fills, with a contrast of 4.5:1 or more.
- The views do not copy these forms. A change to a sign is one change for all views.

### Shared state and print

- `routeId` lives in `EditingState` (`src/lib/state/editing.svelte.ts`). It exposes the resolved route-focus task. Every view reads the same value. `highlightId` keeps its current purpose: the immediate linked highlight and scroll. Refer to the route-focus decisions below.
- `ganttScene(rows, lines, metrics)` adapts task rows and dependency lines to the shared scene. It supplies station positions, exact ports, task boxes and source-local taps for both renderers. Clipped ports use the window edge. Short bars retain their date width.
- The workspace renders one keyed list of base connector paths. Satisfied paths paint first and cycle paths paint last. A status change moves keyed siblings without changing their parent.
- Cycle casings are decorative siblings. Ordinary junctions stay below task marks. Taps stay inside their source mark between its line and dots.
- Print builds a `Scene` with paper metrics and draws it with no tween. The paper metrics have their own row height, line widths and clearances. `ganttFragment` filters rows and complete edges, rebases row indices and routes each fragment at its measured date-area width. The first fragment has a 22 px milestone offset. Later fragments have no offset.
- Whole-segment paper routing supplies only continuation riser x. `Sheets` owns the shared measured result and passes it to each fragment. Cache entries use row-array identity, dependency-line-array identity and paper width. Complete paths still route locally after filtering and rebasing.
- Crossing edges get one represented base path in each endpoint or intervening fragment. Boundary stubs, cross ticks and cycle casings are decorative overlays. They do not add task nodes or edges to the router.
- `createGanttPaperCache` retains one current geometry/width result. The cache and fragments use the same measured date-area width.
- Continuation entries are built locally from the body boundary at the shared riser x. Preserve the 4 px stub and exact task port. Shorten the approach when a boundary row has less gutter space. Reserve horizontal entry runs against local routes and other continuation trunks with the same lane policy.
- Derive continuation joins and branches from the fragment paths. Add one keyed ring only where at least three arms meet and ordinary port clearance permits it. Hooks use 90° bends. A diagonal occurs only at the final entry.
- Clip connector ink to the body, clear of repeated headers and footers. Read status and line weight from the full segment rows. Preserve a source-local tap where a clamped continuation riser leaves from under the source line. Continuation taps use the whole-segment trunk and source identity as their key. Keep one tap per key. If a local tap has the same key, use the continuation riser position.

### Route-focus state (slice 4)

- Section 5.4 of the specification defines input behavior, timing, priority and clearing. One `RouteFocusState` in `src/lib/state/route-focus.svelte.ts` belongs to `EditingState`. It owns the input candidates, intent and leave-grace timers, document listeners, floating-content observer, plan reset, reconciliation and disposal. Export `HOVER_COLD_MS`, `HOVER_WARM_MS` and `HOVER_GRACE_MS` for the timing values. Components report hover and touch input. They do not own timers or set `routeId` directly.
- Attach this owner once through `onMount` where `+page.svelte` creates `EditingState`. Return its cleanup from `onMount`. Reconcile against `ws.index` and the target ids registered by mounted views. A view registers and removes its own targets. A view with exit transitions also registers a reactive getter for its intended target ids. Reconcile these ids before outgoing DOM is removed, so an exit animation cannot retain stale input. Gantt teardown does not dispose shared route state. Work plan input and floating ownership work without a mounted Gantt. This state stays outside storage and undo history.
- `EditingState.routeId` resolves the input candidates. Keep `detailsTaskId` as the only dialog-task state. Record an input sequence for accepted low-priority candidates. Store the input cause on each focus candidate. Capture document `pointerdown` and `keydown` to classify input. `keyboardInput()` resets the pointer type and handles Escape. Expose the pointer type through a read-only getter. Record the origin of navigation keys so the cause changes only after focus moves. No separate input-mode or touch-gesture tracker is needed.
- The full Gantt row, including its label cell and timeline band, owns one hover target and one stable token. Keep the row wrapper at `pointer-events: none` so bands beneath rows keep their click and Hint handling. The common chart container resolves pointer movement against row bounding rectangles once per animation frame. It uses the row wrapper's token for the label, empty timeline area and mark. Keep keyboard focus, touch toggle, `tabindex`, Hint and click handling on the label and mark. Work plan rows keep one hover target per row. Refer to spec 5.4 for hover timing and grace cancellation.
- Use `data-route-target` with the task id for route targets and row owners in every view. Use `data-route-focus="keyboard"` for Gantt marks and labels. Use `data-route-touch` for marks that accept a touch toggle. Production route logic does not read test ids or require a table row. Use one element-keyed `WeakMap` for stable target tokens. Route all focus through document `focusin` and `focusout` to `resolveFocus`; component handlers report only hover and touch. Capture pointer and keyboard input before focus events. Handle outside touch clicks in the bubble phase. Keep route handling separate from control and dialog key handling.
- Use one floating-content ownership mechanism. Link content to its trigger through `aria-controls` and the content id. Resolve the trigger through its neutral route owner. Nested content inherits its trigger's owner. Floating triggers in a Work plan row must expose `aria-controls` and `aria-expanded`. Bits UI supplies these attributes. Cover selects, date popovers, owner popovers and nested menus without registration code in each app component or changes to vendored UI primitives.
- Discover triggers only inside route owners and registered floating content. Cache trigger links per observer sync pass. Do not scan the whole document for `[aria-controls]` on each mutation. Resolve ownership synchronously on focus events as well as through the observer. Use a plain `Map` for content registrations and per-pass caches. The target registry updates one reactive revision. Reconciliation reads that revision; DOM maps do not create reactive dependencies.
- Detect content close from `aria-expanded="false"` or `data-state="closed"` on the trigger, or from disconnection. Use `aria-controls` only for the ownership link; it can remain set after close. Keep the owner through close and normal focus return, then remove the closed registration. For null-target blur, resolve `document.activeElement` on the next task. Refer to spec 5.4 for portal transfers, focus return and input-cause behavior.

### Route-focus projection (slice 4)

- Add a pure effective-dependency graph builder in `src/lib/domain/route.ts`. Store upstream and downstream adjacency maps and the effective predecessor/dependent pairs. `Gantt.svelte` derives this graph once per `ws.index`. Reuse it across route changes and across focus tasks. Keep `dependencyRoute(index, focus)` as a wrapper for existing callers and tests. Add a graph-based walk for projection.
- Add the pure `routeFocusModel(graph, index, rows, lines, focusId)` function in the same module. It returns `active`, `onRouteRowIds` and `litLineKeys`. It has no DOM, timer, Svelte or store dependency. Gantt derives it from the shared graph, current index, visible rows, drawn lines and `editing.routeId`.
- A null or missing focus gives an inactive model with empty sets. For a collapsed parent, the focus set contains the parent and all its hidden subtasks. Otherwise it contains only the focus task. Walk the shared graph separately for each focus in this set.
- A valid focus activates the model, including an isolated focus. Refer to spec 5.4 for its visible treatment.
- Union the focus tasks and their upstream and downstream tasks. Map each id to its visible row, or to its visible parent when the subtask is hidden. This gives `onRouteRowIds`. Mapping does not add ancestors to either graph walk.
- Use the graph's effective predecessor/dependent pairs. Map both endpoints to visible rows with the same task-to-parent proxy rule. Discard unmapped or same-row pairs. Keep only mapped keys that exist in `lines`. This projection does not change the stored-edge drawing policy in section 5.4 and ADR 14.
- A line key is lit if an effective pair mapped to that drawn line passes `isLitEdge(route, focus, realFrom, realTo)` for at least one focus in the focus set. Evaluate each route on real ids before mapping. Testing endpoints against the union of all route nodes can light a shortcut incorrectly.
- For example, a hidden subtask inherits `external → child` from its parent. If the existing chart has `external → parent`, focus on the hidden child lights that path. If the mapped path does not exist, route focus adds none. An expanded child does not borrow the parent's path.
- Effective dependencies determine reachability and lit membership. Existing `lines` determine which drawn keys can light. A hidden dependent's own connectors stay omitted. Do not add inherited or hidden-target connectors for route focus.

### Route-focus rings and paint (slice 4)

- Add optional `edges?: readonly string[]` to the scene `Junction` type. In `trunkJunctions`, record the key of each same-trunk edge whose nonzero segment passes the existing containment test for an ordinary ring. Keep unique keys in stable order. Use the existing tolerance and bounds. Keep ring geometry, clearance and keys unchanged. No separate `junction-route.ts` module or coordinate resolution is needed.
- A tap belongs only to edges with the same trunk and `edge.from === junction.source`. Another source's riser can pass through that tap. It must not light the tap. Build a tap membership map by trunk and source once per scene geometry. Route paint reads member keys from that map; it does not filter all scene edges for each tap on each route change. Tap membership uses these ids, not geometry. The optional scene field changes no stored or exported plan data.
- A ring or tap is lit if any member key is in `litLineKeys`. Shared signs apply the route paint defined in spec 5.4.
- Keep one keyed list of base connector elements. Its existing order is satisfied, then open, with cycles last. Route focus cannot sort, move or re-parent these elements.
- Insert one separate lit-overlay block before the first cycle connector in that list. If there is no cycle connector, insert it after the base list. Each lit noncycle edge has a keyed casing and ink path pair. Both are decorative siblings. Keep cycle paths in their existing block. A lit cycle base uses `data-route="lit"`. An off-route cycle base has no `data-route`. Refer to spec 5.4 for paint and casing width.
- Follow the `milestoneTweens` registry pattern in Gantt. Pass each edge's `GeometryTween` instance to `GanttLine` and its overlay pair. All paths read the same current six points, including when an overlay appears during a running tween. `GanttLine.test.svelte` creates the tween for the existing motion tests. Preserve width snapping, retargeting and equal-target behavior.
- Month rules, bands and the Today line are HTML siblings below the connector SVG. Inside that SVG, paint noncycle bases, lit casings and overlays, then cycle casings and connectors. Ordinary junction rings stay below task marks. Within each task mark, paint the task line, local taps, then station dots. Milestones and labels keep their current upper layers.
- Shared signs use `markColorLevel` for off-route paint. Bypass the finished-task level and `subtaskFill` for off-route task ink. Refer to spec 5.4 for color levels and opaque ground fill.
- Render overlay pairs only for lit noncycle keys. Use local bidirectional Svelte `transition:` color transitions with `motionDuration`. Their `css` interpolates stroke from transparent to ink or ground, and back on exit. Svelte owns outgoing keyed items through the outro. Do not add retention timers or two-frame insertion. Decorative paths use `aria-hidden` and `data-overlay-for`; they never use the dependency test id. Refer to spec 5.4 for duration and paint continuity.
- Remove the linked-highlight ring from the Gantt mark. Keep the immediate label cell highlight as the chart cue. In forced colors, use `Highlight` for the highlighted label cell background and `HighlightText` for its text. Apply `forced-color-adjust: none` where needed for these explicit system colors.
- In forced colors, keep ordinary task marks and off-route connectors at their normal system paint. Use `Highlight` for lit overlays, rings and taps. Use `Canvas` for ground casings and holes. Apply `forced-color-adjust: none` only to these explicit system-color signs. Cycle paths keep their warning treatment and dotted form. Do not depend on a pale color mix to show the route.
- Preview and print do not read route-focus state. Their `still` signs retain status treatment and have no lit overlay. The plan schema and translated text do not change.

## Alternatives considered

- **A general obstacle router (for example, a visibility graph or A\* on a grid):** it can route around any shape. But it is not deterministic across small edits, its cost grows with the number of obstacles, and its paths have a variable number of points. A variable number of points cannot tween without a change of shape. The diagrams have rows and gutters, so a layered router meets these needs.
- **The View Transitions API:** it captures snapshots of the page and cross-fades them. Svelte cannot retarget a running view transition, the snapshots do not follow scroll containers, and the API does not read `motionDuration`. Browser support also differs. A tween by stable id gives the same continuity with the project's own pattern.
- **An SVG node morph:** one SVG shape for each task, which morphs between a bar, a station and a card. SVG text does not wrap, does not clamp to two lines and does not get the HTML focus and hint behavior. Accessible names on SVG shapes are harder to keep correct. HTML nodes avoid these problems.
- **Geometry built by hand in each view:** this is the current state for the Gantt. Each new view would need its own tweens, its own print geometry and its own routing. There is no shared key for a switch between views, and the routing faults would repeat.

## Consequences

- Slice 2b (`feat/scene-model`) is thin. It ships:
  - this ADR;
  - the types in `src/lib/scene/`;
  - `routeTracks` and `routePath`, with unit tests;
  - `GEOMETRY_MOTION_MS` and `VIEW_MOTION_MS` in `src/lib/motion.ts`;
  - `StationDot` and `StageBadge` in `src/lib/components/diagram/`, with screen and `still` variants;
  - `routeId` in `EditingState`.
- Slice 2b does not change the Gantt on screen or on paper. No view uses the new router or the new signs yet.
- The Gantt adoption uses four parts. Slice 3a (`feat/gantt-router`) changes the unused neutral router and contracts. Slice 3b (`feat/gantt-signs`) independently adopts badges and chrome. Slice 3c (`feat/gantt-lines`) depends on both. It adopts `ganttScene(rows, lines, metrics)` and `ganttFragment`, draws lines and station dots on screen and paper, and removes `elbowPath`, jagged cuts and markers. Slice 3d (`feat/gantt-continuations`) adds paired 4 px continuation stubs with 2 px cross ticks and intervening pass-throughs. One whole-segment paper route supplies the matched riser x for those signs.
- Slice 4 (`feat/route-focus`) resolves shared route input, projects effective routes onto visible rows and existing lines, and adds screen-only lit overlays. It preserves stored dependency drawing rules and paper output.
- **Superseded by ADR 20:** the earlier assignment of the view switch, `DiagramStage`, the first scene switch and generic scene print integration to Route map no longer applies. The preliminary `feat/diagram-views` PR owns these shared contracts and integration. It also owns the required Gantt and GanttRow motion-adapter hooks.
- **Superseded by ADR 20:** the earlier assignment of the FLIP flight layer to Kanban no longer applies. The preliminary PR supplies transition and scroll-container hooks only. FLIP flight-layer and cross-router connector interpolation implementations are deferred. Each required shared implementation must merge in the preliminary PR or a follow-up shared PR before its consuming slice. Appendix C and spec section 5.13 retain the final motion target.
- Route map and Kanban can implement in parallel against the shared contract. They can merge in either order. The slice that merges second merges `main` and runs the checks again (ADR 20).
- Each graph algorithm in the router must stop on a cycle (ADR 13). A cycle edge gets a valid route.
- The plan file and the schema do not change.
