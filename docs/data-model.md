# Data model and file format

This document describes the JSON files that Taktblatt imports and exports. The Valibot schema in `src/lib/domain/schema.ts` is the reference. This document follows that schema.

## File kinds

There are two kinds of file. Each file has a `schemaVersion` and a `kind`.

| `kind`   | Content              | Menu command         |
| -------- | -------------------- | -------------------- |
| `plan`   | One plan in `plan`   | **Export this plan** |
| `backup` | All plans in `plans` | **Export all plans** |

The current `schemaVersion` is `1`.

```json
{ "schemaVersion": 1, "kind": "plan", "plan": { "id": "…", "heading": "…" } }
```

## File name

The export file name is `taktblatt-<heading-slug>-<YYYY-MM-DD>.json`.

- The slug has lowercase letters, digits and hyphens. Letters of other scripts (for example Chinese) stay.
- The date is the export date.
- When the heading is empty, the slug is `untitled-plan`.

## Values

- **Dates** are date-only strings `YYYY-MM-DD`. They are never timestamps.
- **Timestamps** (`createdAt`, `updatedAt`) are ISO 8601 strings with a time zone.
- **Ids** are strings. The app makes UUIDs. Other non-empty strings are also valid.

## Plan

| Field                    | Type                             | Rule                                                     |
| ------------------------ | -------------------------------- | -------------------------------------------------------- |
| `id`                     | string                           | Unique.                                                  |
| `heading`                | string                           | Empty means "Untitled plan".                             |
| `subheading`             | string                           | Optional text.                                           |
| `range`                  | `{ start, end }`                 | Dates. `start` ≤ `end`.                                  |
| `objective`              | string                           | Max 250 characters in the editor.                        |
| `locale`                 | `en` \| `de` \| `zh-TW` \| `ja`  | The document language.                                   |
| `paper`                  | `a4` \| `letter`                 | The paper size for print.                                |
| `footer`                 | `{ note, version, date, right }` | `date` is a date or `null`.                              |
| `stages`                 | Stage[]                          | The array order is the stage order.                      |
| `tasks`                  | Task[]                           | The array order has no meaning. The app sorts the tasks. |
| `milestones`             | Milestone[]                      |                                                          |
| `bands`                  | Band[]                           |                                                          |
| `remarks`                | RemarkSection[]                  | The array order is the section order.                    |
| `createdAt`, `updatedAt` | timestamp                        |                                                          |

## Stage

| Field         | Type                                                                             | Rule                        |
| ------------- | -------------------------------------------------------------------------------- | --------------------------- |
| `id`          | string                                                                           | Unique in the plan.         |
| `title`       | string                                                                           | Empty means "Stage N".      |
| `description` | string                                                                           |                             |
| `color`       | `blue` \| `amber` \| `green` \| `violet` \| `red` \| `teal` \| `pink` \| `slate` | A key of the stage palette. |

## Task

A **task** has `parentId: null`. A **subtask** has the id of a task in `parentId`.

| Field          | Type             | Rule                                                        |
| -------------- | ---------------- | ----------------------------------------------------------- |
| `id`           | string           | Unique in the plan.                                         |
| `stageId`      | string           | A stage of the plan. A subtask has the stage of its parent. |
| `parentId`     | string \| `null` | A task (not a subtask) of the same stage.                   |
| `title`        | string           |                                                             |
| `deliverable`  | string           |                                                             |
| `start`, `end` | date \| `null`   |                                                             |
| `owners`       | string[]         | Compared without case, after the app trims them.            |
| `done`         | boolean          |                                                             |
| `note`         | string           | Plain text. Can contain mention tokens `@[task:<id>]`.      |
| `dependsOn`    | string[]         | Ids of other tasks of the plan. Not its own id.             |
| `createdAt`    | timestamp        | Sort tie-breaker.                                           |

A parent keeps its own `start`, `end`, `owners` and `done`. The app does not show these values while the parent has subtasks. Refer to [spec.md](spec.md), section 2.

## Milestone

| Field         | Type                                      |
| ------------- | ----------------------------------------- |
| `id`          | string                                    |
| `title`       | string                                    |
| `description` | string                                    |
| `date`        | date                                      |
| `symbol`      | `diamond` \| `flag` \| `star` \| `circle` |

## Band

| Field          | Type                                   |
| -------------- | -------------------------------------- |
| `id`           | string                                 |
| `title`        | string                                 |
| `start`, `end` | date                                   |
| `color`        | `gray` \| `blue` \| `amber` \| `green` |

## Remark section

| Field     | Type     |
| --------- | -------- |
| `id`      | string   |
| `title`   | string   |
| `bullets` | string[] |

## Validation on import

The app rejects a file when one of these conditions is true:

- The file is not JSON.
- The file has no `schemaVersion`, or the version is newer than the app.
- A field has a wrong type or a wrong value.
- A task points at a stage, a parent or a dependency that does not exist.
- A subtask has a subtask, or its stage is different from the stage of its parent.
- Two stages, two tasks, two milestones, two bands or two remark sections have the same id.
- A backup file has no plan, or two plans in it have the same id.
- A task depends on itself.
- A parent depends on one of its own subtasks, or a subtask depends on its own parent.
- The effective dependency graph has a cycle.

A subtask uses its own dependencies in the effective graph. A parent uses its own dependencies and the dependencies of its subtasks. Remove the parent's own subtasks from this set.

The date rule uses effective task dates. If a dependency starts after its dependent task ends, the app shows a warning. The app permits this condition on import.

The app shows the path of each wrong field, for example `plan.range.start`. It does not change data.

## Versions

When the schema changes, the `schemaVersion` increases by 1. The app migrates old files when it reads them. It cannot read files from a newer app version.
