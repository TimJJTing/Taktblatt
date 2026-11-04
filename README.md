# Taktblatt

Taktblatt is a simple and lightweight project planner. It shows a plan as a Gantt timeline, stages, milestones and a detailed work table. You can print the plan or save it as a PDF.

- The app has no server and no account.
- The app keeps all data in your browser (`localStorage`).
- You can import and export plans as JSON files.

## Requirements

- Node.js 24 or later
- pnpm 11

## Procedures

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

| Command                  | Check                                         |
| ------------------------ | --------------------------------------------- |
| `pnpm lint`              | Formatting (Prettier) and code rules (ESLint) |
| `pnpm check`             | Types (svelte-check)                          |
| `pnpm exec vitest --run` | Unit tests                                    |
| `pnpm test:e2e`          | End-to-end tests (Playwright)                 |

### Format the code

1. Run `pnpm format`.

## Languages

The app has these UI languages: English, German, Traditional Chinese and Japanese.

> **Note:** The German, Traditional Chinese and Japanese texts are machine drafts. A native speaker must review them.

The message files are in `messages/`. English (`en.json`) is the source.

## Documents

- [Specification](docs/spec.md)
- [Architecture decision records](docs/adr/README.md)
- [Glossary](GLOSSARY.md)

## License

MIT. Refer to [LICENSE](LICENSE).
