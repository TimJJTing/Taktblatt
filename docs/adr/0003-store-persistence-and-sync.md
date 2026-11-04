# 3. One store, localStorage, sync between tabs, undo

Status: accepted (2026-11-05)

## Context

The app has no server. A field can show in many places (heading, stage title, owners, dates). These places must stay in sync. A delete must be safe without a server backup.

## Decision

- One `PlanStore` (a Svelte 5 runes class) holds the active plan. All views read from it.
- All derived values are pure functions in `src/lib/domain`. The store exposes them through `$derived`. No view calculates a derived value itself.
- All changes go through store commands. Each command is one commit and one undo step.
- The store writes the plan to `localStorage` after each commit. Each plan has its own key.
- The store listens to the `storage` event. When a different tab changes the active plan, the store loads it. The last write wins.
- Undo keeps up to 50 snapshots of the plan in memory. The plan is a plain object, so a snapshot is a structured clone.
- Valibot validates the data on load and on import. The app migrates old `schemaVersion` values on load.

## Consequences

- Sync between views is automatic.
- Unit tests can call domain functions without a browser.
- Snapshots use more memory than patches. For a small plan, this is not a problem.
