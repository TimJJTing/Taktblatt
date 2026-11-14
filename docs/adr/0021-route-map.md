# 21. Route map

Status: Accepted (2026-11-14).

Extends [ADR 19](0019-scene-model.md) through [ADR 20](0020-diagram-views.md). Applies [ADR 13](0013-cycles-are-warnings.md) and [ADR 14](0014-subtasks-depend-only-on-siblings.md). [Section 5.14](../spec.md#514-route-map) defines the behavior.

## Context

The Gantt shows dates and duration. Route map shows how work branches within a stage and connects across stages. It must also include tasks without dependencies, dates or unfinished work. A stage workflow and a stored dependency are different relations.

The view needs compact metro geometry, shared task interactions and readable paper output. It must preserve browser-local data and work offline without a layout service or package.

## Decision

### Workflow and dependency model

Derive the workflow from existing stage, family, date and dependency data. Same-stage dependencies create colored forks and joins. They take priority over conflicting dates. Date order connects unconstrained stage members, so a colored segment alone does not prove a stored dependency. Status and readiness do not change the connections.

Build the ordinary same-stage dependency graph within top-level stage tasks or one sibling group before adding workflow order. Cycle, proxy and legacy external-child links remain thin exceptions outside this ordinary graph. Condense strongly connected components for placement only. Use Kahn ordering with effective start, `createdAt`, then task id among eligible tasks; put undated tasks last. Add synthetic adjacency from the preceding task only when the receiver has zero eligible ordinary same-stage predecessors in its scope. Check the actual graph and existing workflow adjacency to avoid a cycle. Thin exceptional predecessors do not block workflow adjacency. Do not write these edges into the plan.

The diamond A → B, A → C, B → D, C → D plus unrelated E has rails A—B, A—C, B—D, C—D and D—E. It has no B—C rail or duplicate thin links. A date conflict does not reverse a dependency.

Ordinary same-stage dependencies use colored rails, including skips around unrelated stations. Cross-stage, proxy, legacy external child and cycle dependencies use thin links. Preserve hidden-predecessor projection, hidden-dependent omission, merged stored identities and dependency warning identity. Cycle links keep dotted warning paint. A layout SCC does not create a warning.

Keep expanded parents visible and draw a distinct family membership branch. Sibling dependencies retain their stored identities. Family membership and synthetic order do not affect readiness, warning data or dependency route focus.

### Geometry and signs

Use deterministic local placement and bounded routing under the Route map scene files. Preserve substantial 45° runs, smooth turns and few bends. Reserve complete station, title, control and focus bounds. Horizontal spacing is not a time scale. Stage color identifies membership without a fixed row per stage.

Use Berlin termini at workflow endpoints and capsules at cross-stage transfers. A capsule takes precedence when both apply. Keep station glyphs neutral with respect to status. Put the shared status icon beside the task name on screen and paper, with accessible status text and an existing `Hint`.

Show effective task dates only in the station Hint on hover or keyboard focus of the dot. Use existing localized date formatting. The map has no persistent date labels. Titles, stage badges, ready lights and the local sign key remain readable in normal, dark and forced-color modes.

### Shared behavior and ownership

Reuse shared route-focus ownership, task-dialog activation, focus return, expansion state, `Hint`, `joinList()` and `DIAGRAM_ATTR` marks. Preserve the parent identity and separate title and chevron controls. Expansion changes no plan content or history.

Route position changes through `motionDuration()`. Retarget interrupted motion from its current frame. Cross-fade incompatible paths. Reduced motion applies geometry immediately. Keep shared Gantt routing and view contracts unchanged.

Register locally through the diagram view contract. Use owned `route_map_` messages and shared `diagram_` names. Keep schema, export, persistence, domain behavior and offline contracts unchanged.

### Paper

Build a separate readable landscape A4/Letter scene with the same workflow, status icons and expansion state. Keep a fitting panel whole. Split oversized panels at legal boundaries and preserve every station-label pair exactly once.

Wrap labels at word boundaries. Use stable references with a 3 px gap and secondary ink. Preserve complete titles in splittable continuations. Add paired connector stubs only at actual panel or item boundaries. Repeat relevant stage and parent references and the local sign key.

## Consequences

A colored workflow can represent a dependency or connect unrelated stage members. The key and route focus must preserve that distinction. Synthetic order edges must never become stored dependencies or warnings.

The view needs its own placement, routing, station glyph and paper adapter. It reuses shared status icons, interactions, paint and motion contracts. No plan schema change or network service is required.

## Validation

Cover exact fork/join rails, dependency priority, date ties, undated tasks, deterministic input order, synthetic adjacency and complete stored-edge coverage. Check thin exceptions, warning identity, hidden-child projection, family expansion and route focus.

Check neutral station glyphs, status icons beside names, dates only in station Hints, accessible controls, substantial 45° geometry, interrupted motion and reduced motion. Verify word wrapping, whole panels, continuation markers and the local key on paper.

Validate workspace, Preview, rendered A4/Letter print output and offline use. Validate an installed PWA window when available and report any unavailable mode with its reason. A browser offline check does not prove an installed app window.
