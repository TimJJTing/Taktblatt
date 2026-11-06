# 12. Import modules with the file extension on disk

Status: Accepted (2026-11-06)

## Context

SvelteKit 3 replaces `$lib` with the `#lib` subpath import in `package.json`. Node and TypeScript need an unambiguous subpath import, so each import names a file extension.

- The project used `.js` for TypeScript modules, for example `#lib/motion.js` for `motion.ts`. This convention comes from `tsc` output: `tsc` does not change import specifiers, so the source names the emitted file.
- The project does not emit with `tsc`. The SvelteKit tsconfig sets `noEmit`, `moduleResolution: "bundler"` and `allowImportingTsExtensions`. Vite builds the app.
- Node does not search for extensions. It maps `#lib/*` to `./src/lib/*` as text. `#lib/motion.js` names a file that does not exist. Only TypeScript, Vite and the Playwright loader map it to `motion.ts`. The Playwright loader does this only for relative specifiers, so e2e tests could not import `src/lib/` through `#lib`.
- Node 24 runs TypeScript files with type stripping. It needs the `.ts` specifier.

## Decision

- Import each module with the extension of the file on disk: `.ts` for a TypeScript module, `.svelte.ts` for a reactive module, `.svelte` for a component and `.js` for a JavaScript file.
- Use `#lib/...` for imports from `src/lib/`. A relative import is only for a sibling (`./x.ts`) or a file in a parent folder (`../x.ts`).
- `#lib` maps to `./src/lib/index.ts`.
- The local ESLint rule `local/import-specifiers` (`scripts/eslint/import-specifiers.js`) checks these rules. `pnpm exec eslint --fix` corrects most findings.
- Vendored files in `src/lib/components/ui/` keep their own specifiers.

## Consequences

- An import names the file that a reader finds on disk.
- Node, Vite, TypeScript, Vitest and Playwright resolve the same specifier. E2E tests import `src/lib/` through `#lib`.
- The code cannot be emitted with `tsc` without a rewrite of the specifiers. To publish a library from `src/lib/`, configure the rewrite first.
- Vendored UI files use `.js`. App files that import them use `.ts`.
