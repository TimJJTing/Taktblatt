# 5. UI language and document language

Status: accepted (2026-11-04)

## Context

The app supports English, German, Traditional Chinese and Japanese. A plan can have a language that is different from the language of the person who edits it.

## Decision

- The **UI language** is viewer state. The default is the browser language.
- The **document language** is a plan field (`locale`). It controls the printed labels and the date formats.
- A new plan gets the current UI language as its document language.
- We use Paraglide JS for messages. English is the source. A missing key falls back to English.
- Dates use `Intl.DateTimeFormat` with the document language.

## Consequences

- A German plan prints in German, also when the UI is in English.
- Components that show printed labels must use the document language, not the UI language.
