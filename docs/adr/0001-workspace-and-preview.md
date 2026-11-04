# 1. Workspace for editing, preview for print

Status: accepted (2026-11-05). Amended by [ADR 8](0008-print-blocks.md).

## Context

The design artifact shows two fixed A4 sheets. A fixed sheet is a bad editing surface: the table is narrow, the Gantt has little space and you cannot pin it.

## Decision

- The screen shows a responsive **workspace** for editing. It is one page that scrolls, with a sticky section navigation.
- A **preview** shows the paginated sheets. It is read-only.
- Print always uses the sheets of the preview.
- The workspace and the preview use the same store. The workspace never prints. The sheets use their own thin print blocks (ADR 8).

## Consequences

- A field that shows in more than one place reads one store value. All places stay in sync without extra code.
- Each block has two layouts (screen and print). The print layout follows the artifact.
- The two layouts are two sets of components. They share the store and the domain helpers (ADR 8).
