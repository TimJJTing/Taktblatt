# 9. One language: plan files are language-neutral

Status: Accepted (2026-11-05). Supersedes [ADR 5](0005-ui-language-and-document-language.md).

## Context

ADR 5 gave each plan a document language (`locale`). It set the printed labels and the date formats. A file from a person with another language then looked and printed in that language. This made the file depend on one person's setting, and a person could not read a shared plan in their own language.

## Decision

- A plan has no language. We remove `locale` from the plan schema.
- Dates are stored as ISO `YYYY-MM-DD` in the file. The app formats them with `Intl.DateTimeFormat` and the UI language when it shows or prints them.
- The UI language governs the app texts, the date formats, the owner sort order and the printed labels. Formatting code reads it through `uiIntl()` in `src/lib/ui-language.ts`, which is outside the pure domain code.
- The UI language rules of ADR 5 stay: it is viewer state, saved under `taktblatt:locale`, and an import never changes it.
- We do not change `SCHEMA_VERSION` and we add no migration. The app has no active users. The plan schema ignores unknown keys, so an old file or stored plan with a `locale` key still loads. The app drops the key at the next save or export.
- "Load example" writes the example in English. The example is content, not a setting.

## Consequences

- The same file shows and prints in the UI language of the person who opens it.
- A plan written in one language prints with the labels of another UI language. Free text (titles, notes) stays as the author wrote it.
- Components must not take a language from the plan. They call `uiIntl()` and the message functions without a `locale` option.
- A change of the UI language reloads the page (Paraglide default), also in other open tabs, so the helpers need no reactive state. The reload clears the undo history.
