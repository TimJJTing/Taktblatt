# 8. Print blocks are separate components

Status: Accepted (2026-11-04)

## Context

ADR 1 said that the workspace and the preview use the same components with a `print` variant. The paginator (ADR 2) needs more than that. It needs blocks that it can measure:

- Each block has `data-part` and `data-item` markers. The paginator reads the height of each marked part and item.
- Rows have fixed heights, so the paginator can split between rows.
- The blocks have no controls and no motion.
- The labels use the document language of the plan, not the UI language.

A workspace component with print classes does not meet these needs. The workspace layout is responsive and its heights change with the width.

## Decision

- The print blocks are separate thin components in `src/lib/components/print/`.
- The print blocks read the same store as the workspace. They use the same domain helpers: `gantt.ts`, `derive.ts`, `format.ts` and `print-model.ts`.
- The workspace never prints. In print, the app hides the workspace and shows the sheets only.
- Shared logic is in domain modules or in small helper modules, not copied. Examples are `formatTarget`, `visibleBands`, `markLabel`, the milestone symbols and the paper colors.
- The workspace components have no `print:` classes.

## Consequences

- Each block has two components, one for the workspace and one for the sheets. A change to the look of a block must be made in both.
- A change to a value rule is made once, in the domain helper. Both components then agree.
- The paginator measures the same components that print.
- The workspace components stay simple. They have no print code.
