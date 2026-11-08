# Data model and file format

This document describes the JSON files that Taktblatt imports and exports. The Valibot schema in `src/lib/domain/schema.ts` is the reference. This document follows that schema.

The workspace has limits that the schema does not have, for example the length of the objective. The import does not check these limits.

## File kinds

There are two kinds of file. Each file has a `schemaVersion` and a `kind`.

| `kind`   | Content              | Menu command         |
| -------- | -------------------- | -------------------- |
| `plan`   | One plan in `plan`   | **Export this plan** |
| `backup` | All plans in `plans` | **Export all plans** |

The current `schemaVersion` is `1`.

The UI language and screen theme are browser preferences. Plan files and backup files do not include them. An import does not change them.

```json
{ "schemaVersion": 1, "kind": "plan", "plan": { "id": "…", "heading": "…" } }
```

## File name

The export file name is `taktblatt-<heading-slug>-<YYYY-MM-DD>.json`.

- The slug has lowercase letters, digits and hyphens. Letters and marks of other scripts (for example Chinese) stay.
- The date is the export date.
- When the heading is empty, the slug is `untitled-plan`.

## Values

- **Dates** are date-only strings `YYYY-MM-DD`. They are never timestamps. They have no language: the app formats them with the UI language.
- **Timestamps** (`createdAt`, `updatedAt`) are ISO 8601 strings with a time zone.
- **Ids** are strings. The app makes UUIDs. Other non-empty strings are also valid.

## Plan

| Field                    | Type                             | Rule                                                     |
| ------------------------ | -------------------------------- | -------------------------------------------------------- |
| `id`                     | string                           | Unique.                                                  |
| `heading`                | string                           | Empty means "Untitled plan".                             |
| `subheading`             | string                           | Optional text.                                           |
| `range`                  | `{ start, end }`                 | Dates. `start` ≤ `end`.                                  |
| `objective`              | string                           | Max 250 characters in the workspace.                     |
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

| Field          | Type                                            | Rule                                                                                                                                             |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`           | string                                          | Unique in the plan.                                                                                                                              |
| `stageId`      | string                                          | A stage of the plan. A subtask has the stage of its parent. This value is redundant on purpose. Import rejects a subtask with a different stage. |
| `parentId`     | string \| `null`                                | A task (not a subtask) of the same stage.                                                                                                        |
| `title`        | string                                          |                                                                                                                                                  |
| `deliverable`  | string                                          |                                                                                                                                                  |
| `start`, `end` | date \| `null`                                  |                                                                                                                                                  |
| `owners`       | string[]                                        | Compared without case, after the app trims them.                                                                                                 |
| `status`       | `todo` \| `in_progress` \| `done` \| `canceled` | Required. New tasks default to `todo`.                                                                                                           |
| `note`         | string                                          | Plain text. Can contain mention tokens `@[task:<id>]`.                                                                                           |
| `dependsOn`    | string[]                                        | Ids of other tasks of the plan. Not its own id.                                                                                                  |
| `createdAt`    | timestamp                                       | Sort tie-breaker.                                                                                                                                |

A parent keeps its own `start`, `end`, `owners` and `status`. The app does not show these values while the parent has subtasks. The stored values show again after you delete or move the last subtask. Refer to [spec.md](spec.md), section 2.

## Milestone

| Field         | Type                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | string                                                                                                                           |
| `title`       | string                                                                                                                           |
| `description` | string                                                                                                                           |
| `date`        | date                                                                                                                             |
| `symbol`      | `diamond` \| `flag` \| `star` \| `circle` \| `triangle` \| `square` \| `hexagon` \| `pentagon` \| `pin` \| `bookmark` \| `heart` |

The `pin` key represents a map pin. Symbol keys are language-neutral. The UI language controls the displayed names.

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

A subtask uses its own dependencies and the own dependencies of its parent in the effective graph. A task, with or without subtasks, uses its own dependencies. The app excludes the task itself and unknown ids. Remove a task's own subtasks from this set. A parent does not inherit the stored dependencies of its subtasks.

Load and import accept cycles in the effective dependency graph. UI cycle warnings will come in PR 3. Refer to [ADR 13](adr/0013-cycles-are-warnings.md).

The sibling dependency rule is an editor rule. A subtask can add dependencies only on siblings with the same parent. A task can depend on other tasks and on subtasks of other tasks. Stored and imported legacy subtask dependencies outside the parent stay valid. They count for that subtask only and show a scope warning. No migration or new schema validation is required. Refer to [ADR 14](adr/0014-subtasks-depend-only-on-siblings.md).

Import counts stored dependency rows with date or scope warnings. A row with both kinds counts once.

The date rule checks stored dependencies only. It uses effective task dates. If a dependency starts after its dependent task ends, the app shows a warning. The app permits this condition on import.

The app shows the path of each wrong field, for example `plan.range.start`. A missing field says that the field is required. A value outside a fixed set lists the allowed values. The error text uses the UI language. The app does not change data.

## Versions

The ready-light change keeps `schemaVersion` at 1. The file shape does not change. Files valid before this change stay valid: cycle rejection is removed, and no validation rule is added. Older app builds can reject a file with a cycle.

When the schema changes, the `schemaVersion` increases by 1. The app migrates old files when it reads them. It cannot read files from a newer app version.

Exception: the milestone symbols `triangle`, `square`, `hexagon`, `pentagon`, `pin`, `bookmark` and `heart` do not increase the version. The change only adds values, so all existing v1 files stay valid. App builds before this change reject a plan or backup file that uses one of these symbols.
