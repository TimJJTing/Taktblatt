# Visual language

[Specification index](../spec.md)

## 9. Visual language (screen and print)

- Screen themes use a white ground and `#1A1D23` ink in light mode. Dark mode uses `#13161A` ground and `#E7E9EC` ink. Focus rings use the ink color. The shared theme colors are in `src/lib/theme-colors.ts`. `src/lib/theme.ts` exports the same values for browser use.
- Font: Source Sans 3, self-hosted. Dates, counts, and targets use tabular figures.
- Ink `#1A1D23`. Secondary text `#505663` and `#5A6070`. Rules `#C9CDD4` and `#DDE0E5`. Neutral fill `#EEF0F3`.
- The ready light uses the paper color token `--color-paper-ready`, with value `#2E9D5B`. Preview and print use this token in every screen theme.
- Dotted cycle connectors use `--color-paper-warning`, with value `#C8352D`. Its contrast against white paper is 5.25:1. It passes WCAG AA for normal text and graphics. The screen uses the `destructive` token. Gantt dependency connectors have no arrowheads.
- Dependency warning icons and borders use the `warning` token. It reuses Signal Line Amber: `#A0690A` in light mode and `#E6A940` in dark mode. The stage color picker uses the same token for duplicate-color rings and decorative dots.
- Stage palette: 8 colors. Each light value has a contrast of at least 4.5:1 against white. Each dark value has a contrast of at least 6:1 against the dark ground (`#13161A`). Stage badge text is white in light mode and `#13161A` in dark mode. Band palette: 4 light tints. Dark band tints use the dark stage values at 14% opacity. Gray uses white at 7% opacity.

### 9.1 Shared diagram signs

The diagrams share signs where their meaning is the same. Refer to ADR 19 and [ADR 23](../adr/0023-unified-diagram-language.md).

- **Status icon:** `TaskStatusIcon` is the status sign of the Work plan, Route map and Kanban, on screen and paper. It shows the effective status of the task.
  - `todo`: a circle.
  - `in_progress`: a half-filled circle.
  - `done`: a circle with a check.
  - `canceled`: a circle with a slash.
  - On screen the icon is 16 px at 100 % zoom, with the original Lucide geometry (`viewBox="0 0 24 24"`) and stroke width 2. On paper every status icon is 12 px. Tasks and subtasks use the same size. Dense layouts and keys do not use a smaller icon.
  - Do not use square status signs or square subtask signs in any view.
  - The icon is decorative when its control or cell gives the status as text. Otherwise it has a text alternative.
- **Station dot:** the Gantt station dot is the status sign of the Gantt, on screen and paper. Its fill shows the effective status of the task. The Gantt does not show the status icon. Route map and Kanban do not use status fills.
  - `todo`: a ring with the ground color inside.
  - `in_progress`: half filled.
  - `done`: solid at full strength, even when its task line is pale.
  - `canceled`: a ground-filled ring with a diagonal slash at full stage strength. Its task line uses a 40 % mix of the stage color with the ground. The form differs from `done` in forced colors and grayscale print.
- **Status key:** one shared component explains the status icons. Proposed default: Route map and Kanban show it, on screen below the diagram and on each of their paper sheets. The Gantt keeps its existing legends and shows no status key.
  - The key is a list with the accessible name "Status". Its entries are Todo, In progress, Done and Canceled, in this order. Each entry has the status icon and the status label of the Work plan status select.
  - After the entries, the key explains readiness as text: "Ready: all dependencies are finished. Blocked: a dependency is not finished."
  - Use "In progress" and "Todo" as the names in every view.
- **Family summary:** the child-state breakdown of a parent. Proposed default: one pure function in `src/lib/domain/derive.ts` calculates it from the shared task index, and Route map and Kanban receive that index. Do not store it. Do not add another parent-status calculation.
  - Classify each subtask of the parent exactly one time: by `boardColumn()` of its task state, or as canceled when `boardColumn()` gives null.
  - The result has the counts `ready`, `blocked`, `inProgress`, `done` and `canceled`, and `total`. `ready` is the Todo column. Ready and blocked are separate parts of stored `todo`. The five counts add up to `total`, the number of subtasks. Canceled subtasks count as canceled.
  - Show the nonzero parts in this order: ready, blocked, in progress, done, canceled. Each part is one message with its count, for example "1 ready". Proposed default: join the parts with `joinList()`, for example "1 ready and 1 blocked".
  - Route map and Kanban show the family summary for each parent, in both expand states. Its placement can differ by diagram. The Gantt and the Work plan do not show it.
- **Expansion control:** proposed default: one shared component expands and collapses a parent in the Work plan, Gantt, Route map and Kanban. It is a separate native button with an outlined chevron. The chevron points right when collapsed and down when expanded. The turn uses `motionDuration(200)`.
  - It has `aria-expanded` and the accessible name "Expand {task}" or "Collapse {task}". It has a visible keyboard focus outline.
  - It changes only the shared expand state of [section 4.4](storage.md#44-viewer-state). All four places show the same state.
  - In the Work plan and the Gantt, a pointer click keeps the rule of [section 5.2](workspace.md#52-edit-fields): it removes focus from the control. In Route map and Kanban, a pointer click changes the state and keeps focus on the control. Enter and Space keep focus on the control in all four places.
  - The visible button is 20 px. Its target is 24 × 24 px or more in all four views, and it has `aria-controls` for the content that it shows.
  - Do not use a `details` element, a text arrow or a browser disclosure triangle.
- **Stage badge:** the stage label (S1, S2, …) on the stage color, with a 4 px corner radius. The text is white on the light fills and the ground color (`#13161A`) on the dark fills. The text has a contrast of 4.5:1 or more on its fill.
- Stage badge colors change at once with reduced motion. Paper badges have no transitions and always use the current light stage color.
- The signs do not use color alone. The icon shape or the fill shape gives the status, and the badge text gives the stage.

The Gantt uses station dots and stage badges for task lines, points, stage headings and legends. Route map uses neutral stations and the status icon ([section 5.14](route-map.md#514-route-map)). Kanban uses the status icon ([section 5.15](kanban.md#515-kanban)).

Gantt layers, from bottom to top: month rules, bands, Today line, base connectors, lit casings and lit connectors, cycle connectors, ordinary junction rings, task marks, milestone rings and labels. Within each task mark, a tap stays above its source line and below its station dots. It is clipped to the timeline area. Each cycle casing sits directly below its warning-painted connector.

Dim diagram marks by mixing their color with the ground. Do not reduce element opacity. Task lines and station dots stay opaque over connectors. Apply one dim level at a time.

At rest, the screen shows every dependency. Secondary ink is `#505663` in light mode and `#9BA3AF` in dark mode. Junction and interchange rings use the ground color inside. The ready light stays in the task label slot. It does not change a task line to green.

Preview and print use light stage colors and white ground. They show all routes without hover or focus dimming. They keep the status treatment for done and canceled tasks and satisfied connectors.

Paper Gantt rows are 18 px high. Top-level task lines are 5 px thick with 1 px connectors. Their station dots have a 6 px outer diameter, a 4 px ground hole and a 1 px inset. Subtask lines are 3.5 px thick with 0.75 px connectors. Subtask station dots and point dots have an outer diameter of 4 px. Junction rings have an outer diameter of 4 px.

Cycle paths retain the warning style and ground casing of [section 5.4](timeline.md#54-timeline-gantt). The default milestone is an ink interchange ring. Other milestone symbols keep their shapes in paper ink. Line weight, status fill and dotted cycle connectors keep the hierarchy clear in grayscale.

Each task keeps its identity when its geometry changes. In the Gantt, each connector has six route points. Sources with identical complete target sets share a trunk. A width change applies new routes at once to preserve angles and clearances. Exact ports take priority when a short segment or chart edge cannot meet the normal minimum length. A finish-to-start chain can enter vertically when its riser and start port align.

Forward ports on the same row use a straight route. A hook at the left chart edge can omit its final stub to stay inside the chart.

Riser slots keep their pitch spacing near the right chart edge. A riser can lie left of the out port inside the source task line. Its first segment runs backward under the task line because connectors are drawn below task lines. A tap marks where that riser leaves from under the source task line. It stays with the source row, above the line and below the station dots, inside the timeline area. This tap is exempt from ordinary junction clearance.

Horizontal runs reserve their actual vertical position across both target sides. A third lane is tried before overflow. Hooks try the boundary lane first. Direct entries need no gutter lane. Hooks reserve their full run to the entry stub. A branch reserves the combined runs of all its sources. If all three lanes have conflicts, the branch reuses the near lane.
