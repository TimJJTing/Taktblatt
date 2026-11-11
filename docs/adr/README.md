# Architecture decision records

Each record has a number, a status and a date. Write a new record when a decision changes.

| No. | Title                                                                                            | Status                                          | Date       |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ---------- |
| 1   | [Workspace for editing, preview for print](0001-workspace-and-preview.md)                        | Accepted (amended by ADR 8 and ADR 16)          | 2026-11-04 |
| 2   | [Pagination in JavaScript](0002-pagination-in-javascript.md)                                     | Accepted                                        | 2026-11-04 |
| 3   | [One Workspace store, localStorage, sync between tabs, undo](0003-store-persistence-and-sync.md) | Accepted                                        | 2026-11-04 |
| 4   | [Viewer state is not in the plan](0004-viewer-state.md)                                          | Accepted (amended by ADR 17)                    | 2026-11-04 |
| 5   | [UI language and document language](0005-ui-language-and-document-language.md)                   | Superseded by ADR 9                             | 2026-11-04 |
| 6   | [Effective dependencies and move conflicts](0006-effective-dependencies-and-move-conflicts.md)   | Accepted (amended by ADR 13, ADR 14 and ADR 15) | 2026-11-04 |
| 7   | [Static SPA, offline, no network](0007-static-spa-offline.md)                                    | Accepted                                        | 2026-11-04 |
| 8   | [Print blocks are separate components](0008-print-blocks.md)                                     | Accepted (amended by ADR 9)                     | 2026-11-04 |
| 9   | [One language: plan files are language-neutral](0009-one-language-plan-files-are-neutral.md)     | Accepted                                        | 2026-11-05 |
| 10  | [Load the inlang plugins from node_modules](0010-local-inlang-plugins.md)                        | Accepted                                        | 2026-11-05 |
| 11  | [Required CI checks before a merge to main](0011-required-ci-checks.md)                          | Accepted                                        | 2026-11-05 |
| 12  | [Import modules with the file extension on disk](0012-import-file-extensions.md)                 | Accepted                                        | 2026-11-06 |
| 13  | [Cycles are warnings, not errors](0013-cycles-are-warnings.md)                                   | Accepted                                        | 2026-11-08 |
| 14  | [Subtasks depend only on siblings](0014-subtasks-depend-only-on-siblings.md)                     | Accepted                                        | 2026-11-08 |
| 15  | [A parent's planned window grows with its subtasks](0015-parent-planned-window.md)               | Accepted                                        | 2026-11-08 |
| 16  | [Split workspace with pane scrolling](0016-split-workspace.md)                                   | Accepted (amended by ADR 17)                    | 2026-11-09 |
| 17  | [Menus by scope, bottom sheets on touch, and the narrow Timeline handle](0017-menus-by-scope.md) | Accepted                                        | 2026-11-10 |
| 18  | [Overlay scrollbar](0018-overlay-scrollbar.md)                                                   | Accepted                                        | 2026-11-11 |
