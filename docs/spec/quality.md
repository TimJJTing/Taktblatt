# Quality

[Specification index](../spec.md)

## 10. Quality

- TypeScript strict mode. ESLint. Prettier.
- Vitest unit tests in two projects. The `server` project runs the `*.spec.ts` files in Node. It covers the domain logic: derived values, sort, dependency validation, move conflicts, ready light, schema, migration, import, pagination. It also covers diagram scenes, routing and paper adapters. The `client` project runs the `*.svelte.spec.ts` files in Chromium. It covers the store, commands, undo history and diagram view components.
- Playwright end-to-end tests in `e2e/` for the main flows, diagram views, the offline app (PWA) and the pagination of the sheets. `pnpm test:e2e:fixtures` checks test-only diagram views in a separate build (ADR 20).
- Headless Playwright hides native scrollbars, and CI runs Chromium only. The end-to-end tests check that the native scrollbar is hidden (`scrollbar-width: none`) and test the overlay thumbs. Overlay scrollbar parity in Firefox and Safari, and on macOS, Windows, Linux, iOS and Android, is a manual check (ADR 18).
- GitHub Actions run `pnpm lint`, `pnpm check`, the unit tests and the end-to-end tests in separate jobs. They run on each pull request, on each merge queue entry and on each push to `main`. The `CI passed` job fails when one of these jobs does not succeed. If the end-to-end tests fail, the workflow keeps the Playwright results for 7 days.
- The branch protection rule for `main` requires the `CI passed` check before a merge. Refer to ADR 11.
- Dependabot updates `npm` and `github-actions` every week. Dependabot groups minor and patch updates. Major updates have separate pull requests.
- License: MIT.
