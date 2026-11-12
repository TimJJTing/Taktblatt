# Repository Guidelines

## Project Structure & Module Organization

Taktblatt is a static, browser-only planner built with Svelte 5, SvelteKit, TypeScript, and Tailwind CSS.

- `src/lib/domain/`: pure schema, date, dependency, import/export, and pagination logic.
- `src/lib/state/`: workspace, persistence, commands, and undo history.
- `src/lib/components/`: workspace, timeline, editing, and print components; `ui/` contains vendored UI primitives.
- `src/routes/`: app page, layout, and global styles.
- `src/service-worker/`: offline support; `static/`: icons and PWA manifest.
- `messages/`: translations; `project.inlang/`: Paraglide configuration.
- `e2e/`: browser tests. Unit tests live beside source files.
- `docs/`: specification, data model, architecture decisions, and screenshots. `docs/plans/` is for local working plans. Git ignores it. Record lasting decisions in the specification and ADRs.

## Build, Test, and Development Commands

Use the Node.js and pnpm versions in `package.json`. See [README development instructions](README.md#development) for installation, development, builds, and formatting commands. Required validation commands are listed below.

## Coding Style & Naming Conventions

Use strict TypeScript and Svelte runes. Prettier enforces tabs, single quotes, no trailing commas, and a 100-character width; plugins format Svelte and sort Tailwind classes. Use PascalCase app components, kebab-case utilities, and camelCase functions.

Before you complete a task, run `pnpm exec prettier --write <changed files>` for the supported files that you changed. Review the diff and run `pnpm lint`. Do not format unrelated files.

Use `#lib/...` for imports from `src/lib/`. Relative imports are only for siblings and parents. Use the file extension on disk. See [ADR 12](docs/adr/0012-import-file-extensions.md) for examples, vendored-file exceptions, and ESLint fixes.

Keep domain logic pure. Route plan-content edits through `src/lib/state/commands.ts`; use Workspace operations for plan lifecycle and undo/redo. Avoid unrelated changes to vendored `components/ui/` files.

Reuse an established pattern when it serves the same purpose across the project. Do not introduce a competing pattern for preference alone. If you find a flaw, document it and explain the replacement.

Use ASD-STE100 style for comments and all user-facing documentation. Use short sentences, direct instructions, consistent terms, and one topic per paragraph.

Keep documentation current with every change. Update affected guides, specifications, and examples in the same change. Record behavior changes in `docs/spec.md`, data-contract changes in `docs/data-model.md`, and architecture decisions in `docs/adr/`.

## UI, Motion & Accessibility

Animate or transition every change in an element's position so users can follow the change. Route all motion durations through `motionDuration(ms)` from `src/lib/motion.ts`. This includes CSS transitions and animations, Svelte transitions, `animate:flip`, and `Tween`. When the user prefers reduced motion, the helper returns `0`; position changes must then be immediate.

Show hints with `src/lib/components/app/Hint.svelte`, which wraps the Tooltip. Do not use the native `title` attribute; `src/lib/components/no-native-title.spec.ts` checks this. Keep the text alternative in `aria-label`. Refer to `docs/spec.md`, section 5.10.

Provide text alternatives for SVGs and graphics that convey information. Hide purely decorative graphics from assistive technology. Ensure interactive bars, labels, and milestones have accessible names and support keyboard focus and activation.

Floating triggers in a Work plan row must expose `aria-controls` and `aria-expanded` for route ownership.

For every UI change, check the workspace, app Preview dialog, printed sheets, and installed PWA, including offline use. Follow the [Taktblatt UI validation skill](.agents/skills/taktblatt-ui-validation/SKILL.md). Report any mode you could not validate and the reason; do not report it as passed.

## Agent Workflow & Change Planning

Use multiple independent agents for nontrivial tasks. A trivial task is a small, unambiguous edit with no behavior, schema, architecture, or interaction change, such as a documentation correction. Select only the roles the task needs. Assign each selected role to a distinct agent; do not combine roles in one agent. Agents can run in sequence when concurrency is limited. If delegation is unavailable, perform the required roles in separate sequential passes. Report that independent review and verification were unavailable.

| Role                     | Responsibility                                                         |
| ------------------------ | ---------------------------------------------------------------------- |
| Project supervisor       | Coordinate scope, assignments, and completion.                         |
| Requirement consolidator | Combine requirements and resolve conflicts.                            |
| Spec composer            | Write the specification, acceptance criteria, and implementation plan. |
| Researcher               | Check relevant code, sources, and constraints.                         |
| Plan verifier            | Check the plan against requirements and risks before implementation.   |
| Auditor                  | Check architecture, data contracts, and project conventions.           |
| Testcase implementer     | Write behavior tests from the specification.                           |
| Code implementer         | Implement the specified behavior.                                      |
| Reviewer                 | Review the completed changes for defects and maintainability.          |
| Verifier                 | Run checks and compare results with the acceptance criteria.           |

For new features and major changes, first question the requesting developer (the user) in depth. Major changes include changes to architecture, persistence, or shared interaction flows. Challenge assumptions and clarify the problem, scope, constraints, edge cases, and acceptance criteria. Use answers already provided. Ask about unresolved points and resolve material gaps before implementation.

Use specification-driven development (SDD) and test-driven development (TDD) for behavior changes. Consolidate requirements, write or update the specification and implementation plan, and verify the plan before implementation. Write behavior tests and confirm that they fail for the expected reason before changing production code. Implement the change, make the tests pass, then refactor. Use separate testcase and code implementers, plus independent review and verification, for nontrivial changes. Documentation-only edits need formatting checks, not behavior tests.

Before changing the project file schema, ask the user whether to bump `schemaVersion`. This schema covers exported plan files, backup files, and stored plan data defined in `src/lib/domain/schema.ts`; it is separate from the package version. Wait for the answer before making the schema change. Update `SCHEMA_VERSION`, compatibility handling, tests, and documentation as agreed.

## Testing Guidelines

Use the Playwright agent CLI for interactive browser checks. Follow [README browser automation instructions](README.md#browser-automation-for-coding-agents) for setup and commands, then read `.agents/skills/playwright-cli/SKILL.md`. Substitute `pnpm browser` for `playwright-cli` in skill examples. Close the browser session when finished.

Run colocated Vitest `*.spec.ts` and reactive `*.svelte.spec.ts` tests with `pnpm test:unit --run`. Run automated Playwright regression tests in `e2e/*.e2e.ts` with `pnpm test:e2e`. Before final E2E validation, stop any server on port 4173. Local Playwright runs reuse an existing server and skip the build; with the port free, the suite builds and serves the current code. This also applies to `pnpm test`. Interactive CLI checks supplement these tests. Add regression coverage for changed behavior. For code changes, run `pnpm lint`, `pnpm check`, and `pnpm test` before a PR.

Do not write trivial tests. Each test must check behavior that can fail because of a defect in project code. Do not write these tests:

- A test that compares a wrapper with the platform or library API that it calls.
- A test that checks what the type system already guarantees.
- A test that reads source text instead of behavior, except for static policy checks such as `no-native-title.spec.ts`. Use these checks only for source constraints; they do not replace behavior tests.
- A copy of a test for each locale or input when one case proves the behavior.

Reuse `e2e/helpers.ts` for shared browser setup and interactions. Extend the helpers when needed instead of duplicating them in tests.

For date, history, popover, animation, and scroll checks, follow the interaction rules in the [Taktblatt UI validation skill](.agents/skills/taktblatt-ui-validation/SKILL.md).

## Commit & Pull Request Guidelines

Create or switch to a separate branch before you commit changes. Give the branch a name that tells its purpose, for example `fix/stable-chevron-test`. Do not commit directly to `main`. Submit changes to `main` through a pull request. A pull request can merge only when the `CI passed` check succeeds. See [ADR 11](docs/adr/0011-required-ci-checks.md) for the required checks and branch protection rules.

Use `feat:`, `fix:`, `refactor:`, `docs:`, or `chore:` with imperative descriptions, following Git history. PRs must explain the change and list validation results. Link related issues when available and include screenshots for visual changes.

## Localization & Data Boundaries

Use `messages/en.json` as the translation source. Regenerate with `pnpm i18n`; do not edit generated `src/lib/paraglide/` files. The inlang plugins load from `node_modules`, so `pnpm i18n` needs no network after `pnpm install`. Do not change them back to CDN URLs; refer to `docs/adr/0010-local-inlang-plugins.md`. Plan files stay language-neutral with ISO dates; UI language controls displayed and printed labels. Preserve browser-local storage and offline operation.

Put punctuation and word order in translation messages, not in templates. Use `joinList()` for user-facing lists.
