# 19. Scene model and shared diagram layer

Status: Accepted (2026-11-11).

## Context

The Timeline has one diagram: the Gantt. Its geometry is spread across components. `gantt-layout.ts` holds the row height, the clip edges and the connector path. `GanttRow.svelte`, `GanttLine.svelte` and `Gantt.svelte` each hold their own `Tween`. `PrintGantt.svelte` builds the same geometry again with paper sizes.

The connector routing has known faults. `elbowPath` puts the vertical 6 px after the source end for every edge. Two predecessors that end on the same day thus draw one false merged line. The backward detour can run along a bar. `GanttLine.svelte` tweens only the endpoints, so the path changes shape during the tween.

More diagrams come soon: a route map without a time axis, and a Kanban board (spec, "Future: Kanban"). Both show the same tasks as the Gantt. A switch between diagrams must animate, so that the eye can follow each task. If each view builds its own geometry, each view needs its own tweens, its own print code and its own routing. Then a switch between views has no common key.

## Decision

### Identity and geometry

- The pure folder `src/lib/scene/` holds the scene model. It has no Svelte, no DOM and no store imports. The rules for `src/lib/domain/` apply.
- A `SceneNode` is the identity of a task in a diagram. Its `SceneId` is stable across views, undo, redo and tab sync. Identity does not contain positions.
- Geometry is per view. `NodeGeom` gives the box of one node. `EdgeGeom` gives the points of one edge. A `Scene` holds the nodes, the edges and the geometry of one view at one size.
- A length is `Len { f, px }`. It resolves as `f * extent + px`. A point is `Pt { x: Len, y: Len }`. A time axis can use `f` for the date fraction and `px` for fixed offsets, such as a port radius. Routing uses resolved ports and metrics at the current width. A width change requires new routes to keep the bend angles and clearances. Renderers tween between the old and new geometry by stable id.

### Routing

- `routeTracks(tracks, edges, metrics)` is a neutral layered router. A track is one row of nodes with a center, a half height, an optional span and the in and out ports. Any view with layered rows can use it. The Gantt and the route map use it. Kanban does not.
- `routePath(points, extent)` resolves the `Len` points at one extent and returns an SVG path.
- The routes follow Appendix A of the design-system plan:
  - Each edge has exactly six points. Unused points repeat the point before them. Thus a tween never changes the shape of a path.
  - The variants are `forward`, `direct` and `hook`. Segments are horizontal, vertical or exactly 45°. A 45° segment occurs only as the last segment into a start dot.
  - A trunk is the set of sources with an identical target set. The members of a trunk share one riser. Edges that share only one target do not merge.
  - Each gutter has lanes. Each riser has a slot. A fixed cost function selects the slot and the lane.
  - Reserve horizontal runs by their physical y position across both target sides. Try the near lane, then the boundary lane. Check each candidate with the same route classifier used to draw the edge. A direct entry reserves no lane and reports lane 0 without overflow. A hook reserves its full run to the entry stub. A branch reserves the union of the runs of all its sources. If both lanes have conflicts, reuse the near lane and report overflow.
  - The port rule shows the direction: a line leaves an end dot and arrives at a start dot.
- Exact ports take precedence over the usual minimum segment length for short or chart-edge segments. Aligned ports can enter vertically. Forward ports on the same row use a straight route. A hook at the left chart edge can omit its final stub, so the route stays inside the chart.
- Near the right chart edge, a riser can lie left of the out port inside the source bar; its first segment runs backward under the bar because connectors are drawn below bars.
- Routing is pure and deterministic. Sort keys are intrinsic (span, row, id). The output does not depend on the input order or on an earlier result. There is no hysteresis. Thus undo and redo give the same picture, print equals the screen, and an unrelated edit does not move a line.
- Fields that only tests need (`variant`, `slot`, `lane`, `overflow`) stay on a router result type. They are not part of `EdgeGeom`.

### Rendering

- Task nodes are HTML in every view. Only edges and guides are SVG. HTML nodes keep text layout, focus, accessible names and hints (`Hint.svelte`).
- A transition tweens the geometry by stable id. This is the project's `Tween` pattern. A `Tween` retargets during a running tween, so a fast second change does not jump.
- A FLIP flight layer is used only when the source and the target position are in different scroll containers.
- The app does not use the View Transitions API.
- `src/lib/motion.ts` holds the motion constants. `GEOMETRY_MOTION_MS = 240` is for geometry changes in a view. It replaces `ROW_MOTION_MS` in `gantt-layout.ts`. `VIEW_MOTION_MS = 300` is for a switch between views. All durations still go through `motionDuration(ms)`. `TIMELINE_MOTION_MS` is section chrome, not diagram geometry, and stays where it is.

### Shared signs

- `src/lib/components/diagram/` holds the signs that every diagram shares: `StationDot` and `StageBadge`.
- Both follow the `ReadyDot` pattern. A `still` property gives the paper variant, without transition and without animation.
- `StationDot` carries the status fill rule (decision D6 of the plan): ring = todo, half = in progress, solid = done, 40 % = canceled. The fill is the status sign in every view and on paper.
- `StageBadge` uses the stage badge text rule: white text on light fills, ground-color text on dark fills, with a contrast of 4.5:1 or more.
- The views do not copy these forms. A change to a sign is one change for all views.

### Shared state and print

- `routeId` lives in `EditingState` (`src/lib/state/editing.svelte.ts`). It is the task whose dependency route is lit. Every view reads the same value, so route focus stays when the view changes. `highlightId` keeps its current purpose: the linked highlight and scroll.
- The pure helpers in `src/lib/domain/route.ts` follow effective dependencies in both directions. Each walk stops on a visited task. They ship with the landed tests as groundwork for slice 4. Slice 2b adds no route-focus controls.
- Print builds a `Scene` with paper metrics and draws it with no tween. The paper metrics have their own row height, line widths and clearances. Print routes each fragment after the fragment filter, with rows rebased.

## Alternatives considered

- **A general obstacle router (for example, a visibility graph or A\* on a grid):** it can route around any shape. But it is not deterministic across small edits, its cost grows with the number of obstacles, and its paths have a variable number of points. A variable number of points cannot tween without a change of shape. The diagrams have rows and gutters, so a layered router is sufficient.
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
- Slice 3 (`feat/gantt-lines`) adds the `ganttScene(rows, lines, metrics)` adapter. It moves the Gantt routing behind `routeTracks` and `routePath` and removes `elbowPath`. The Gantt then uses `StationDot` and `StageBadge` on screen and on paper.
- Slice 4 (`feat/route-focus`) sets and reads `routeId`.
- The route map PR adds the view switch, the `DiagramStage` container and the first switch between two scenes with `VIEW_MOTION_MS`. The print model gets a generic scene segment when the second diagram arrives. `GanttSegment` does not change before that.
- The Kanban PR adds the FLIP flight layer when a task moves between scroll containers, for example from the Gantt body to a board column that scrolls on its own.
- Each graph algorithm in the router must stop on a cycle (ADR 13). A cycle edge gets a valid route.
- The plan file and the schema do not change.
