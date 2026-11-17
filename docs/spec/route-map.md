# Route map

[Specification index](../spec.md)

### 5.14 Route map

The Route map is a metro-style stage workflow without a time scale. [ADR 21](../adr/0021-route-map.md) records its architecture. [ADR 23](../adr/0023-unified-diagram-language.md) records its notation.

The information order is workflow, then family structure, then status.

#### Workflow and dependency meaning

The Route map shows a stage workflow as a thick colored metro line. Date order connects tasks in the stage, including tasks with no dependency between them. Unrelated same-stage tasks remain connected, including D—E when E has no dependency on D. A thick segment alone is not proof of a stored dependency. Required order and suggested order in one stage use the same rail form. Keep their provenance distinct in the model.

Include all tasks. Readiness and status do not remove tasks or change workflow connections. Keep done, canceled, in-progress, ready and blocked tasks. An expanded family shows a station for each subtask, including canceled subtasks. Use the shared expansion state to show or hide children.

Dates order unconstrained tasks. There is no time axis, duration scale or proportional date spacing. Read stations from top to bottom and from left to right. Preserve substantial 45° runs, smooth turns and few bends. Stage color identifies membership. A stage does not require one fixed horizontal row.

Keep these relations separate:

- **Stage workflow:** thick solid stage-color rails derived from task order. They can connect unrelated tasks. They do not change stored dependencies, readiness or cycle warnings. Do not use dashed rails for suggested order. Do not put a chevron on a colored rail.
- **Dependency:** stored relations remain distinct from workflow order. A stored dependency between tasks in one stage has a colored rail and no thin path. A stored dependency between tasks in different stages has a thin neutral path. A cycle dependency has the dotted warning path.
- **Family:** the existing parent and subtask relation. Expansion keeps the parent station on its main rail and adds a child branch. The attachment of the branch shows membership. Membership does not create a stored dependency.

#### Dependency projection

Build the dependency edges of the map in `routeMapModel()`. Use the shared task index of the workspace. Do not build a second index.

1. **Eligibility.** Read each stored dependency `(taskId, dependencyId)`. Its source is the dependency task. Its target is the dependent task. Read the stored `stageId` of both tasks before any mapping to a visible task. The dependency is **cross-stage** when these stage ids differ. It is **same-stage** when they are equal. It is a **cycle** dependency when `dependencyWarnings(index)` gives a cycle warning for this stored identity.
2. **Projection.** Map each endpoint to its visible station. A subtask of a collapsed parent maps to that parent. Project in both directions: a hidden predecessor maps to its parent, and a hidden dependent maps to its parent.
3. **Self-links.** Omit a dependency when both endpoints map to the same visible station.
4. **Aggregation.** Merge dependencies with equal visible endpoint pairs with `lineKey()`. Keep every stored `(taskId, dependencyId)` identity of the merged edge. A merged edge is a cycle edge when one or more of its stored identities has a cycle warning. A merged edge is cross-stage when one or more of its stored identities is cross-stage.
5. **Expansion.** When the parent is expanded, each cross-stage dependency and each cycle dependency uses its exact stored endpoints again.
6. **Rail endpoints.** A same-stage dependency that is not a cycle dependency is a colored rail. Its rail endpoints do not depend on the expand state:
   - When both tasks are top-level tasks, the rail runs between them in the top-level scope of the stage.
   - When both tasks are subtasks of one parent, the rail is part of the child branch of that parent. It shows only when the parent is expanded.
   - In all other cases, one or both tasks are subtasks and the tasks are in different scopes. Map each subtask to its parent. The rail runs between these top-level stations in the top-level scope, in both expand states. Thus the top-level route does not change shape on expansion. This covers a top-level task that depends on a subtask of another parent, and legacy external child dependencies.
   - The rail keeps all stored identities of the dependencies that it represents.

Inherited dependencies are effective dependencies. Do not draw an inherited or effective pair as a stored edge. Effective dependencies still determine readiness and route reachability. Preserve legacy external child dependencies and their scope warnings.

Each projected edge has one of these forms:

| Edge                                       | Form                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Cycle edge, in one stage or between stages | Thin dotted warning path between the visible endpoints.                              |
| Cross-stage edge that is not a cycle edge  | Thin neutral path with an open destination chevron, between the visible endpoints.   |
| Same-stage edge that is not a cycle edge   | Colored rail between the rail endpoints of step 6. It takes part in forks and joins. |

A **scope** is the set of top-level tasks of one stage, or the set of visible subtasks of one parent. Proposed default: a same-stage edge that came from projection, and a legacy external-child edge, have no thin path.

When a rail stands for a dependency of a visible subtask, the map shows the exact subtask in two ways. Route focus lights the rail and the exact subtask station. The accessible description of each station names its exact predecessors and dependents.

#### Branch priority

Families and same-stage dependency forks create branches. Date overlap alone does not create a branch. The workflow is derived; it adds no stored relation.

Same-stage dependencies determine colored workflow forks and joins. For A → B and A → C, fork from A to B and C. Join branches at their shared dependent. Do not add B—C only because C has a later date. Dependencies take priority when dates conflict. Use date order for unconstrained tasks. Keep unrelated same-stage D—E connected.

Use this deterministic derivation:

1. Build the ordinary same-stage dependency graph of each scope before adding workflow order. The graph contains the same-stage edges that are not cycle edges, at their rail endpoints. The top-level graph of a stage is equal in both expand states. Keep every stored dependency identity separate from synthetic adjacency. Condense strongly connected components for placement only; do not infer warning paint from that condensation.
2. Order the resulting directed acyclic graph with Kahn's algorithm. Among currently eligible tasks, use effective start date, then `createdAt`, then task id. Put undated tasks last. A dependency must precede its dependent even when their dates disagree. Sort stable identities within a layout component so equal inputs and shuffled arrays give equal results.
3. Draw ordinary same-stage dependency forks and joins as colored rails. Add synthetic workflow adjacency from the preceding task in this order only when the receiving task has zero ordinary same-stage predecessors in that scope. Never insert adjacency into `dependsOn`, readiness, warning data or dependency route identities. Check the actual dependency graph and existing workflow adjacency before adding an edge; do not close a cycle. A cycle predecessor or a cross-stage predecessor does not prevent date-order workflow adjacency.
4. A same-stage dependency that skips another station still gets its own colored route around that station; it must not silently connect the intervening task. Use bounded return routing for backward cross-stage paths and cycle paths. Cycle warning identity comes only from stored warnings.
5. Apply the same derivation to the subtasks of each expanded parent. Keep the parent station on its main rail. Draw the child branch from the parent station to each first subtask of the child order. Route stored sibling dependencies as forks and joins of the child branch. Do not add an inherited dependency path merely because a child is visible.

For the diamond A → B, A → C, B → D, C → D, followed by unrelated E, the colored rails are A—B, A—C, B—D, C—D and D—E. There is no B—C rail and no thin path. Keep this result when B has an earlier date than A. D—E has no stored dependency identity.

#### Signs

- **Stations:** every task, parent and subtask uses the same round station: a ground-filled ring in the stage color. Proposed default: one station size on screen (8 px) and one on paper (6 px). A station does not show status. Do not encode Todo, In progress, Done or Canceled in its fill, slash or inner shape. Do not draw a second circle inside or around a station. Do not use ticks, square stations or terminus circles. Proposed default: workflow endpoints have no terminus sign.
- **Transfer capsules:** a station with a cross-stage path uses a transfer capsule. Tasks and subtasks use the same capsule size: 16 × 32 px on screen and 10 × 20 px on paper. Proposed default: a capsule is an empty ground-filled outline with no dots inside.
- **Empty stage:** proposed default: a stage with no tasks shows one neutral station in ink with its stage badge, on screen and paper. It has no status icon. On screen, keep the hidden screen-reader text "{stage} {count} to go" (with count 0) for that station.
- **Main rails:** solid, 8 px on screen and 5 px on paper, in the stage color. Preserve round ends and joins.
- **Child branch:** two parallel solid lines in the stage color of the parent, with a gap between them. Use the full stage color, not the lighter subtask mix. On screen each line is 2 px and the gap is 2 px. On paper each line is 1 px and the gap is 1.5 px. The branch connects to the parent station. Do not use a detached bracket or stem. All rails between the subtasks of one parent use this form, for stored sibling dependencies and for suggested order.
- **Child branch gap:** the gap uses the actual diagram ground. It is the screen ground in the light theme and the dark theme, white on paper, and `Canvas` in forced colors. No white seam shows on a dark surface. The gap stays opaque where the branch crosses another path.
- **Rail dimming:** a rail segment is pale when one of its tasks is canceled, or when it has two or more tasks and all of them are done. A pale segment uses the 40 % finished mix of the stage color with the ground. This applies to main rails and child branches, on screen and paper. Station glyphs stay at full stage color.
- **Cross-stage paths:** thin neutral paths in secondary ink: 2 px on screen and 1 px on paper. Tasks and subtasks use the same width. Each path ends with one small open chevron that points to the waiting task. The chevron has two strokes, no fill and the stroke width of its path. Its arms are 5 px long on screen and 3 px on paper. Its tip stays 4 px or more outside the station or capsule outline. A path from a done or canceled source keeps the satisfied 40 % mix of [section 5.4](timeline.md#54-timeline-gantt). This rule does not change Gantt connectors.
- **Cycle paths:** 2 px dotted warning stroke, `1 4` dashes, round caps and 4 px total ground casing, on screen and paper. They have no chevron. A cycle edge gets no colored dependency rail. A cycle inside one stage still keeps any synthetic workflow rails of step 3, in addition to this dotted path.
- **Status:** put the status icon of [section 9.1](visual-language.md#91-shared-diagram-signs) directly before the task name, outside the station. Use 16 px on screen and 12 px on paper. Tasks and subtasks use the same size. The station button gives the status in its accessible name. The Route map shows no ready light, readiness dot or halo. Readiness stays in the accessible description as text.
- **Status key and sign key:** show the shared status key of [section 9.1](visual-language.md#91-shared-diagram-signs) and the local sign key below the map. The local key has these entries in this order: Stage journey, Subtask route, Station, Transfer, Cross-stage dependency, Dependency cycle. Hide the sample graphics from assistive technology.

#### Labels and layout constraints

- Center each task name and its status icon directly below its station. Use this one placement for all stations. Do not move a name above, beside or far from its station to solve a collision. Move stations or routing corridors instead.
- Use Source Sans 3, a two-line name, a full-title `Hint` and a full accessible name.
- **Stage badge:** put the stage badge below the name of the first station of each stage only. The first station is the first top-level task of the stage in the derived order of step 2. Do not repeat the badge at other tasks, at subtasks, at transfer capsules or at route ends. A stage with tasks has exactly one badge. On screen, the badge has a `Hint` with the stage title.
- Show task dates only in the existing station `Hint` on hover or keyboard focus of the station. Use the established localized date formatting and effective dates. Do not add persistent date labels to the map or printed map.
- If stage progress is shown, use top-level `stageProgress().total - stageProgress().done`. Expansion does not change the count.
- **Parent label:** keep a parent name at full width. Below the name, show the family summary of [section 9.1](visual-language.md#91-shared-diagram-signs) and the shared expansion control of [section 9.1](visual-language.md#91-shared-diagram-signs) as siblings. Proposed default: the control is the shared component with the "Expand {task}" and "Collapse {task}" names. Use sibling native buttons, never nested buttons. The control exposes `aria-controls` and `aria-expanded` and changes viewer state only. Its target is 24 × 24 px or more.
- **Label reservation:** reserve the complete bounds of each station, name, status icon, family summary, expansion control, stage badge and focus outline before routing. Measure label heights before the routes are final. Keep rails, paths, chevrons and other labels clear of these bounds. Use deterministic local placement and bounded routing passes. Prefer direct horizontal and 45° routes with few bends. Bound curves by segment length, station clearance and neighboring paths.
- Keep parent and child stations close. Keep cross-stage corridors compact. Reserve space so a colored rail cannot hide a thin path.
- Keep station targets at 28 × 28 px on screen and never below 24 × 24 px. Use one two-axis scroller with the shared overlay scrollbars, Timeline height, pin, collapse and focus-reveal rules. Add no zoom or drag mode.
- Preserve dark-theme ground, forced-color signs and readable labels. Reuse shared route paint. Preserve dotted warning paint on rendered warning paths during route focus. Keep labels, status icons and capsule outlines readable.

#### Warnings, input and motion

- Read `dependencyWarnings(index)`. Key warning paint by stored `(taskId, dependencyId)` identities and OR it when visible edges merge. Do not infer warnings from SCC membership. A grouping-only cycle must not warn. Retain the ADR 13 example in both expand states: P depends on X; X depends on S; S is P's child and inherits its dependency on X. Preserve the stored P-depends-on-X and X-depends-on-S warnings without inventing a stored S-depends-on-X path.
- Reuse the single route-focus owner, registration and cleanup from sections [5.4](timeline.md#54-timeline-gantt) and [5.13](diagram-views.md#513-diagram-views) and [ADR 20](../adr/0020-diagram-views.md). Treat a station and name as one hover target. Keep the shared 300 ms cold rest, 120 ms warm switch and 250 ms leave grace. Keyboard focus lights the route immediately. Keep shared touch toggling, outside-tap and Esc behavior, floating ownership and dialog priority. Add no private timer or document listener.
- Project route focus from actual stored and effective dependency relations, not from stage adjacency. A collapsed parent's route is the union of its route and its hidden children's routes. Do not treat unrelated workflow segments or family membership as dependencies. A rail segment lights only when it represents a stored dependency on the route. Do not light an order-only segment as a dependency edge. A rail between parent stations that represents a dependency of a visible subtask lights together with the exact subtask station.
- Station click or Enter/Space opens the task dialog through `EditingState.openDetails`. Name activation does the same. On touch, a station tap toggles route focus and a name tap opens details. The expansion control only changes expansion. After station or name activation, dialog close returns focus to the station. Missing targets follow [section 5.13](diagram-views.md#513-diagram-views). Do not move focus to the Work plan.
- Use native buttons. Tab reaches a station, its name and then its expansion control before the next task. Give full task, stage and status names, plus text dependency directions, family relation, readiness, family summary and warnings as applicable. Use `joinList()` for user-facing lists.
- Mark stations, labels, parents and scrollers with the shared `DIAGRAM_ATTR` marks. Keep stable task elements for dialog focus return. Use the shared view-change motion of [section 5.13](diagram-views.md#513-diagram-views). Scope tests to the incoming `[data-diagram-view="route-map"]:not([inert])` layer; shared Gantt graphics retain their test ids inside Route map wrappers.
- Route every position change through `motionDuration()` with the shared 240 ms geometry base. Retarget interrupted motion from its current frame. Use 150 ms for route paint. Cross-fade incompatible path kinds; do not morph different routing semantics point by point. Update the local connector schema when the point semantics change. Reduced motion applies geometry immediately and keeps intent timers. Paper uses still signs and no route focus or tween.

#### Preview and print

- Build a separate readable landscape A4 and US Letter scene with the same workflow, dependency and sign meanings as the workspace. Paper does not use the screen expand state. The print detail preference of [section 7](print.md#7-preview-and-print) collapses or expands all families. Use the local `DiagramPaperAdapter` and shared selection, orientation, page order and page-total contracts in [section 7](print.md#7-preview-and-print). Do not scale a workspace screenshot.
- Paper uses the paper sizes above: 12 px status icons, 6 px stations, double-line child branches with a white gap, first-station stage badges, open chevrons and family summaries as text. Paper has no expansion control and no ready light.
- Measure physical columns before panel assignment. Keep a fitting whole panel in one `SceneSegment.items` entry so paths across rows stay continuous. Split oversized panels only at legal station-label, row or continuation-text boundaries. Keep every station-label pair exactly once. Do not clip or scale an oversized item to sheet height.
- Keep bounded two-line station names with stable references. Wrap at word boundaries; split only a word that exceeds the available width. Reserve the reference width, a space and a 3 px visual gap. Use secondary ink for references. Preserve all title characters in splittable full-title continuations. Add no schema title limit.
- Add paired continuation stubs only at actual item or panel boundaries. Attach each marker to its endpoint fragment. Preserve dependency identity, cycle dots and casing. Distinguish workflow continuations from dependency continuations. Use `joinList()` for grouped target text.
- Repeat relevant panel, stage and parent references, the local sign key and the shared status key on each Route map sheet. Reserve the measured header before pagination. Keep the shared stage legend.
- Use CSS px and the existing physical-unit conversions. Retain deterministic panel identities and bounded text layout under the shared paper adapter contract.

#### Messages and acceptance

Use `route_map_` messages for Route map text, with English as source. Use shared `diagram_` messages for the status key, the family summary and the view names. Use `task_expand` and `task_collapse` for the expansion control. Keep all four catalogs complete and regenerate Paraglide. Preserve English **Route map**, German **Linienplan**, Japanese **路線図** and Traditional Chinese **路線圖**.

Keep schema, export, persistence and offline operation unchanged. Keep Gantt behavior unchanged. Register locally with `VIEW_ORDER['route-map']`.

Acceptance coverage includes these requirements:

- Unrelated tasks connect through the stage workflow in date order. Status and readiness do not change that topology. Date distance does not scale station distance.
- Workflow adjacency adds no stored dependency, readiness rule or warning. Cover same-stage skips, cross-stage paths and stored cycle warnings. Cover a cycle in one stage and a cycle between stages: both keep red dotted paths.
- Stations do not encode task status and have no nested circle. The 16 px status icon stands before the name on screen, and the 12 px icon on paper. The map has no ready light. Status changes do not rewire the workflow. Dates appear in the station Hint on hover or focus and are absent from persistent map labels.
- Preserve parent identity, dependency projection and stored warning identities. Test the exact diamond rails and a conflicting date order. Test undated tasks, date ties, shuffled arrays, no false B—C adjacency, and synthetic adjacency for a task with zero ordinary predecessors. Structural SCCs do not create warning paint.
- In the collapsed garden example, Site survey → Order seeds is a colored same-stage rail with no thin path. There are exactly three thin cross-stage paths, each with one open chevron at its target: Order seeds → Sowing, Soil preparation → Sowing as the projection of hidden Add compost, and Sowing → First harvest. Expand Soil preparation to restore the actual Add compost endpoint. Soil test → Add compost is then a double-line rail with no thin path.
- In that example, only Site survey, Sowing and First harvest carry stage badges, in both expand states.
- Expanding Soil preparation keeps its station and adds a connected double-line branch through Soil test and Add compost in the stage color of Prepare. The gap has the ground color in the light theme, the dark theme, forced colors and print.
- A collapsed family projects incoming and outgoing hidden-child dependencies to the parent. Equal pairs merge and keep all stored identities. A dependency between two hidden siblings draws no self-link.
- A top-level task depends on a subtask of another parent in the same stage, for example Order seeds depends on Soil test. The rail Soil preparation—Order seeds shows in both expand states. The top-level rails are equal in both expand states. There is no thin path. With Soil preparation expanded, route focus on Order seeds lights that rail and the Soil test station.
- An expanded family shows its canceled subtasks as stations and counts them in the family summary.
- Reserved label bounds stay clear of rails, paths, chevrons, stations and other labels, also with long names.
- Settled geometry has substantial 45° runs where direction changes require them, smooth turns, compact spacing and clear labels. A test that merely permits orthogonal segments does not prove the metro visual requirement.
- Cover task activation, focus return, interrupted motion, reduced motion, paper wrapping, whole panels and paired continuation markers.
- Validate workspace split/tabs, Preview, rendered print/PDF, installed PWA and offline use. Follow the UI validation skill. Report unavailable modes and their reasons. A browser offline check does not prove an installed app window.
