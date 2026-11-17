# Language

[Specification index](../spec.md)

## 6. Language

- The **UI language** is a viewer setting. The app saves it under `taktblatt:locale`. An import never changes it.
- Choose the UI language under **Menu → Language**. The selected language is the language this tab shows. Choosing a language closes the menu before a reload or a confirmation dialog. Canceling the dialog returns focus to the Menu button.
- The first UI language comes from the browser language list. The app uses the first supported language in the list. A region variant matches its base language (`de-AT` gives `de`). `zh-Hant` and `zh-TW`, `zh-HK` and `zh-MO` give `zh-TW`. Simplified or unspecified Chinese and all other languages give English. The app saves the detected language on the first visit. A later change of the browser language has no effect.
- There is one language: the UI language. It controls the texts, the date formats and the printed labels (for example "Objective:", "Timeline", the column titles). A plan has no language setting.
- Plan files are language-neutral. Dates are stored as ISO `YYYY-MM-DD`. The app formats them with the UI language when it shows or prints them. The same file shows and prints in German for a German UI and in Japanese for a Japanese UI.
- An old file or stored plan can still have a `locale` key. The app ignores the key and does not write it again.
- A change of the UI language reloads the page, also in other open tabs. The reload clears the undo history ([section 4.5](storage.md#45-undo)) and drops the draft of an open dialog.
- When a reload would drop something (undo or redo history, or an open dialog with a draft), the app asks first in a dialog. **Cancel** keeps the language. In another tab, the dialog says that the language changed there. **Not now** (or **Esc**) keeps that tab in its current language until it reloads. A text field with the focus commits first. The print preview is not a draft. If the other tab changes back to the language of this tab, the question closes without a reload. When nothing would be dropped, the language changes at once.
- Supported languages: English (`en`), German (`de`), Traditional Chinese (`zh-TW`), Japanese (`ja`).
- English is the source. A missing key falls back to English.
- The `de`, `zh-TW` and `ja` texts are machine drafts. A native speaker must review them.
- Dates use `Intl`. Weeks start on Monday.
- Messages control punctuation, spaces and word order when a label combines text with a name, value, qualifier or status clause. This applies to visible labels, hints, accessible names and printed labels. Traditional Chinese uses `·` (U+00B7) between a name and a qualifier. Japanese uses `・` (U+30FB). Accessible names for Gantt task lines and points join status and clipping clauses with localized clause punctuation (English and German: `, `; Traditional Chinese: `，`; Japanese: `、`), not conjunctions.
- Complete warning sentences use `joinSentences()`. English and German sentences have one space between them. Japanese and Traditional Chinese sentences have no space between them. Each message contains its final punctuation.
- User-facing item lists use `joinList()`, which formats the list with `Intl.ListFormat` for the UI language. This includes owner lists on screen and on sheets. Stored owner arrays stay unchanged.
