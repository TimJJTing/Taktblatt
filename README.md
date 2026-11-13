# Taktblatt

Taktblatt is a planner for the browser. You write a plan once. Taktblatt shows it as a Gantt timeline, a stage overview and a work plan table. You can print the plan on A4 or US Letter paper, or save it as a PDF. The app has no server and no account. Your data stays in your browser.

![The split workspace: the plan header, sheet footer and Gantt timeline on the left, the work plan on the right](docs/screenshots/workspace.png)

## Workspace layout

On a wide screen (1024 px or more), the workspace has two panes. The left pane shows the plan: the header, the timeline, the stage overview and the remarks. The right pane shows the work plan. Each pane scrolls on its own. Drag the divider between the panes to change their widths, or select it and use the arrow keys. Double-click the divider to reset it to 50/50.

On a narrower screen, a tab bar at the bottom has two tabs, **Overview** and **Work plan**. They show one group at a time. The timeline is always pinned at the top. Tap the handle on its bottom edge to collapse or expand it, or drag the handle to change its height. When you scroll down, the timeline collapses to a thin stage edge. Scroll back to the top to expand it again. Turn on **Keep timeline open** to stop this.

The Preview and the printed sheets do not change with the screen layout.

## Features

### Plan header and range

Each plan has a heading, a subheading and an objective. The plan range sets the dates that the Gantt shows. Click **Fit to tasks** to set the range to the dates of all tasks.

The **Sheet footer** row below the objective has a note, a version, a date and a text on the right side. The sheets show this footer at the bottom of each page.

### Gantt timeline

![The Gantt timeline with an expanded parent task and dependency connectors](docs/screenshots/gantt.png)

- A task with a date range has a task line. A task with one date has a station dot. A parent task has a chevron. Click it to show the subtasks.
- Station dots show status: a ring for Todo, half filled for In progress, solid for Done, and a ring with a diagonal slash for Canceled. Done and canceled task lines use a 40 % color mix of the stage color with the ground.
- Thin connectors show the dependencies between tasks. They have no arrowheads.
- Hover anywhere on a Gantt row, in the label cell or timeline band, or on a Work plan row to show its dependency route. The first route waits 300 ms. While a hover route shows, a switch to another row waits 120 ms. Leaving all route targets keeps the route for 250 ms. Entering any route target cancels this grace period. Other task marks dim. Keyboard focus shows the route at once. On a touch screen, tap a task mark to toggle its route.
- Hover on a Gantt row highlights its label cell and Work plan row at once. The label cell highlight is the cue on the chart. No ring surrounds the task line. In forced colors, the highlighted label cell uses `Highlight` for its background and `HighlightText` for its text.
- Stage badges S1, S2 and so on show each stage color and number.
- Bands show a time range as a tint behind the task lines, for example a time of frost risk.
- Milestones show as symbols on their own row. The Default symbol is a ring. Each milestone has a label M1, M2 and so on.
- A dashed line shows today.
- Click a task label to go to its row in the work plan.
- In split view, use the pin button to keep the whole Timeline section at the top of the plan pane while you scroll. While pinned, drag its bottom edge or use the Taller and Shorter buttons to change its height. In split view, use the Legends button to show or hide Stages, Milestones and Bands together. With tabs, the section is always pinned, and the legends are one line of chips below the chart. Swipe the line to see more.

### Stage overview

![Three stage cards with the stage months, the description and the deliverables](docs/screenshots/stage-overview.png)

Each stage has a card. The card shows the months of the stage, a title, a description and the list of deliverables. Click the title or the description to edit it.

### Work plan table

![The work plan table with stages, subtasks and ready lights](docs/screenshots/work-plan.png)

- Tasks are in stages. Each stage has a color.
- A task can have subtasks. The parent has a planned window: its dates and owners grow to include its subtasks, and you can make the window wider. The parent's status follows its subtasks.
- Each row has a status select (Todo, In progress, Done or Canceled), a deliverable, a target date and owner chips.
- A green dot, the ready light, shows that all dependencies of a task are done or canceled and the task is still Todo. A subtask also waits for the dependencies of its parent. A parent is ready when its status is Todo and one or more of its subtasks are ready.
- Click a cell to edit it. Drag a stage to change the stage order.

### Task dialog

![The task dialog with dates, owner, stage, parent, note and dependencies](docs/screenshots/task-dialog.png)

Click the "…" button of a row to open the task dialog ("Task details"). You can change the stage or the parent of the task, write a note and choose the dependencies. Type `@` in a note to mention a task. If a change causes a conflict, the app lists it before the change.

### Remarks

![Two remark sections with bullets](docs/screenshots/remarks.png)

Remark sections hold lists of short bullets. They are at the end of the plan pane. On the sheets, they come after the work plan.

### Preview and print

![The preview with the first A4 sheet of the example plan](docs/screenshots/preview.png)

Open **Menu** (**…**) in the app header and choose **Print…**. The preview shows the paper sheets. Choose A4 or US Letter. Click **Print** in the preview to print the plan or to save it as a PDF. The printed labels and dates use the UI language.

### Several plans, import, export and offline use

- Open the plan switcher (**Plans**) in the app header to change plans, create a plan, import files and back up all plans.
- Open **Menu** (**…**) to print, export, rename, duplicate or delete the open plan.
- Export the open plan with **Menu → Export this plan**. Back up all plans in one file with **Plans → Back up all plans**. Import the files again on any device with **Plans → Import…**.
- When the primary pointer is touch, as on phones and most tablets, both menus open as bottom sheets.
- Undo with Cmd/Ctrl+Z. Redo with Shift+Cmd/Ctrl+Z or Ctrl+Y.
- Install the app as a PWA. It works offline after the first visit.

### Languages

The app has four UI languages: English, German, Traditional Chinese and Japanese. Open **Menu → Language** to select one. The UI language also sets the date formats and the printed labels. A plan file has no language, so you can open the same file in any UI language.

### Privacy

- The app has no server and no account.
- The app keeps all data in your browser (`localStorage`).
- The app has no analytics and no telemetry. It sends no data on the network.

### Dark mode

Open **Menu** (**…**) in the app header. Under **Theme**, choose **Light** (sun icon), **Dark** (moon icon) or **System** (monitor icon). The default is **System**. The app saves your choice in this browser. Preview sheets and printed sheets are always light.

![The workspace in dark mode](docs/screenshots/workspace-dark.png)

## Quick start

1. Open the app in a modern browser.
2. Click **Load example** to see a complete example plan. Or start with the empty plan.
3. Click a heading, a date or a task to edit it.
4. Click **Menu → Print…** to see the sheets in the preview.
5. Click **Print** in the preview to print the plan or to save it as a PDF.
6. Click **Menu → Export this plan** to save a copy of your plan as a JSON file.

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

| Command                  | Check                                                |
| ------------------------ | ---------------------------------------------------- |
| `pnpm lint`              | Format (Prettier) and code rules (ESLint)            |
| `pnpm check`             | Types (svelte-check)                                 |
| `pnpm test:unit --run`   | Unit tests                                           |
| `pnpm test:e2e`          | End-to-end tests (Playwright)                        |
| `pnpm test:e2e:fixtures` | End-to-end tests of test-only diagram views (ADR 20) |

### Format the code

- Run `pnpm format` to format the full repository.
- Run `pnpm format:src` to format JavaScript, TypeScript, Svelte and CSS files under `src/`.
- Run `pnpm format:watch` to format those files when you add or save them. Keep this command running in a separate terminal while you run `pnpm dev`. Press Ctrl+C to stop it.

The watcher excludes paths in `.gitignore`, including generated files in `src/lib/paraglide/`. Prettier also applies `.prettierignore` when it formats a file.

The shared configuration uses the official [Svelte Prettier plugin](https://github.com/sveltejs/prettier-plugin-svelte) and [Tailwind CSS Prettier plugin](https://github.com/tailwindlabs/prettier-plugin-tailwindcss). The Tailwind plugin loads last and uses `src/routes/layout.css` as the Tailwind v4 stylesheet. The watcher uses `onchange`, as shown in the [Prettier watch guide](https://prettier.io/docs/watching-files).

Run `pnpm install` to install the dependencies and activate the Husky Git hooks. Before each commit, the hook runs lint-staged to format supported staged files with Prettier. This includes source, configuration and documentation files. Prettier keeps its ignore rules and skips unknown file types.

The hook keeps unstaged edits out of the commit, including edits in partially staged files. A formatting error stops the commit. Correct the error, stage the correction and commit again. CI still runs `pnpm lint` to check formatting and code rules.

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
