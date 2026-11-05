# Taktblatt

Taktblatt is a planner for the browser. You write a plan once. Taktblatt shows it as a Gantt timeline, a stage overview and a work plan table. You can print the plan on A4 or US Letter paper, or save it as a PDF. The app has no server and no account. Your data stays in your browser.

![The workspace with the plan header and the Gantt timeline](docs/screenshots/workspace.png)

## Features

### Plan header and range

Each plan has a heading, a subheading and an objective. The plan range sets the dates that the Gantt shows. Click **Fit to tasks** to set the range to the dates of all tasks.

### Gantt timeline

![The Gantt timeline with an expanded parent task and dependency lines](docs/screenshots/gantt.png)

- Each task has one bar. A parent task has a chevron. Click it to show the subtasks.
- Thin lines show the dependencies between tasks.
- Bands show a time range as a tint behind the bars, for example a time of frost risk.
- Milestones show as symbols on their own row. Each milestone has a label M1, M2 and so on.
- A dashed line shows today.
- Click a task label to go to its row in the work plan.
- Use the pin button to keep the timeline at the top of the page while you scroll. Drag its bottom edge to change its height.

### Stage overview

![Three stage cards with the stage months, the description and the deliverables](docs/screenshots/stage-overview.png)

Each stage has a card. The card shows the months of the stage, a title, a description and the list of deliverables. Click the title or the description to edit it.

### Work plan table

![The work plan table with stages, subtasks and ready lights](docs/screenshots/work-plan.png)

- Tasks are in stages. Each stage has a color.
- A task can have subtasks. The parent shows the earliest start, the latest end, the owners and the progress of its subtasks.
- Each row has a done checkbox, a deliverable, a target date and owner chips.
- A green dot, the ready light, shows that all dependencies of a task are done and the task is not done.
- Click a cell to edit it. Drag a stage to change the stage order.

### Task dialog

![The task dialog with dates, owner, stage, parent, note and dependencies](docs/screenshots/task-dialog.png)

Click the "…" button of a row to open the task dialog ("Task details"). You can change the stage or the parent of the task, write a note and choose the dependencies. Type `@` in a note to mention a task. If a change causes a conflict, the app lists it before the change.

### Remarks and footer

![Remark sections and the plan footer](docs/screenshots/remarks-footer.png)

Remark sections hold lists of short bullets at the end of the plan. The footer has a note, a version, a date and a text on the right side. The sheets show the same footer on each page.

### Preview and print

![The preview with the first A4 sheet of the example plan](docs/screenshots/preview.png)

Click **Preview** to see the paper sheets. Choose A4 or US Letter. Click **Print** to print the plan or to save it as a PDF. The printed labels and dates use the UI language.

### Several plans, import, export and offline use

- Create, rename, duplicate and delete plans with the plan switcher in the app header.
- Export one plan or all plans as JSON files. Import them again on any device.
- Undo with Cmd/Ctrl+Z. Redo with Shift+Cmd/Ctrl+Z or Ctrl+Y.
- Install the app as a PWA. It works offline after the first visit.

### Languages

The app has four UI languages: English, German, Traditional Chinese and Japanese. The UI language also sets the date formats and the printed labels. A plan file has no language, so you can open the same file in any UI language.

### Privacy

- The app has no server and no account.
- The app keeps all data in your browser (`localStorage`).
- The app has no analytics and no telemetry. It sends no data on the network.

### Dark mode

The app follows the theme of your system. The printed sheets are always light.

![The workspace in dark mode](docs/screenshots/workspace-dark.png)

## Quick start

1. Open the app in a modern browser.
2. Click **Load example** to see a complete example plan. Or start with the empty plan.
3. Click a heading, a date or a task to edit it.
4. Click **Preview** to see the sheets.
5. Click **Print** to print the plan or to save it as a PDF.
6. Click **Export → Export this plan** to save a copy of your plan as a JSON file.

## Development

### Requirements

- Node.js 24 or later
- pnpm 11

### Install the dependencies

1. Run `pnpm install`.
2. Run `pnpm e2e:install`. This installs the Chromium browser for the tests.

### Start the development server

1. Run `pnpm dev`.
2. Open the URL that the terminal shows.

### Build the app

1. Run `pnpm build`.
2. Find the static files in the `build` folder.
3. To examine the build, run `pnpm preview`.

### Do the checks

| Command                | Check                                     |
| ---------------------- | ----------------------------------------- |
| `pnpm lint`            | Format (Prettier) and code rules (ESLint) |
| `pnpm check`           | Types (svelte-check)                      |
| `pnpm test:unit --run` | Unit tests                                |
| `pnpm test:e2e`        | End-to-end tests (Playwright)             |

### Format the code

1. Run `pnpm format`.

### Browser automation for coding agents

Use the [Playwright agent CLI](https://playwright.dev/agent-cli/introduction) for interactive browser checks. The installed Playwright dependency includes the CLI; no global package is needed.

1. Run `pnpm browser:setup` to initialize the workspace and install the official skill in `.agents/skills/playwright-cli/`.
2. Run `pnpm e2e:install` if Chromium is not installed yet.
3. Start the app with `pnpm dev`. In another terminal, run:

```sh
pnpm browser open http://localhost:5173
pnpm browser snapshot
pnpm browser screenshot
pnpm browser close
```

Use the URL reported by Vite if port 5173 is occupied. Read the snapshot for element references, then use commands such as `pnpm browser click <ref>` or `pnpm browser fill <ref> "text"`. Refresh the snapshot after page changes. Run `pnpm browser --help` for all commands, and add `--headed` to `open` to see the browser.

`pnpm browser` automatically loads `.playwright/cli.config.json`: headless Chromium, an isolated browser profile, English locale, and a 1280×900 viewport. Generated snapshots and screenshots are ignored in `.playwright-cli/`. After upgrading Playwright, rerun `pnpm browser:setup` to refresh the bundled skill. CLI sessions support exploration; `pnpm test:e2e` runs the regression suite used by CI.

### Project structure

| Folder                | Content                                                  |
| --------------------- | -------------------------------------------------------- |
| `src/lib/domain/`     | Pure logic: schema, derived values, dependencies, Gantt  |
| `src/lib/state/`      | The store, commands, undo history and viewer state       |
| `src/lib/components/` | Svelte components for the workspace and the print sheets |
| `src/service-worker/` | The service worker for offline use                       |
| `src/routes/`         | The app page and the layout                              |
| `messages/`           | UI texts for each language                               |
| `e2e/`                | End-to-end tests                                         |
| `docs/`               | Specification, data model, decisions and screenshots     |

### Languages

The message files are in `messages/`. English (`en.json`) is the source.

> **Note:** The German, Traditional Chinese and Japanese texts are machine drafts. A native speaker must review them.

## Documentation

- [Specification](docs/spec.md)
- [Data model and file format](docs/data-model.md)
- [Architecture decision records](docs/adr/README.md)
- [Glossary](GLOSSARY.md)

## License

MIT. Refer to [LICENSE](LICENSE).
