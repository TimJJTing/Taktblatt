# 5. UI language and document language

Status: Superseded by [ADR 9](0009-one-language-plan-files-are-neutral.md) (2026-11-05). The UI language rules still hold. The document language was removed.

## Context

The app supports English, German, Traditional Chinese and Japanese. A plan can have a language that is different from the language of the person who edits it.

## Decision

- The **UI language** is viewer state. The app saves it under `taktblatt:locale`.
- The first UI language is the first supported language in the browser language list. A region variant matches its base language (`de-AT` gives `de`). `zh-Hant` and `zh-TW`, `zh-HK` and `zh-MO` give `zh-TW`. Simplified or unspecified Chinese and all other languages give English. The app saves the detected language on the first visit.
- Paraglide's `preferredLanguage` strategy does not know the Traditional Chinese variants, so a custom strategy (`src/hooks.client.ts`) uses `matchLocale`.
- The **document language** is a plan field (`locale`). It controls the printed labels and the date formats.
- A new plan gets the current UI language as its document language.
- We use Paraglide JS for messages. English is the source. A missing key falls back to English.
- Dates use `Intl.DateTimeFormat` with the document language.

## Consequences

- A German plan prints in German, also when the UI is in English.
- Components that show printed labels must use the document language, not the UI language.
