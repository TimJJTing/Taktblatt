---
name: taktblatt-ui-validation
description: Validate Taktblatt UI changes in the workspace, paginated Preview dialog, print output, and installed PWA, including offline use. Use after UI changes or for a requested UI regression check in this repository.
---

# Taktblatt UI validation

Validate the changed behavior across the app's rendering modes. Keep the scope tied to the change. This skill supplements the checks required by `AGENTS.md`.

All repository paths below are relative to the repository root. Read the affected sections of `docs/spec.md` for expected behavior. Use `e2e/helpers.ts` and the relevant E2E suites as the source for test setup and existing assertions.

## Prepare the browser and build

Use the repository's Playwright agent CLI. Follow `README.md`, section “Browser automation for coding agents”, for setup. Read `.agents/skills/playwright-cli/SKILL.md` and substitute `pnpm browser` for `playwright-cli`. Use element references from a fresh snapshot for interactive checks. Save temporary screenshots and PDFs in `.playwright-cli/`.

Use an isolated test profile and example or disposable plan data. Do not clear a user's browser storage to prepare a test.

The development server supports workspace exploration. For service-worker and offline checks, run `pnpm build`, then serve that build with `pnpm preview`. Use the URL reported by the server. The `preview` command does not open the app's Preview dialog.

Before final E2E validation, stop the preview server you started and ensure port 4173 is free. Local Playwright runs reuse a server on that port and skip the build. See `playwright.config.ts`; this applies to both `pnpm test:e2e` and `pnpm test`.

## Workspace and interaction

Reproduce the changed behavior with representative plan data. Check the affected layout in split view (1024 px or wider) and with tabs (below 1024 px). With tabs, check both tabs, the collapsed Timeline and the automatic collapse on scroll. For menu changes, also emulate a coarse pointer to check the bottom sheets. Include empty, long, or overflowing content when it exercises the change.

For changed controls, check accessible names, keyboard activation, focus placement, and focus return after dismissal. For position changes, check normal motion and reduced motion. Check affected translated labels and theme variants when their length or colors can alter the result.

Use these rules when writing or running interaction checks:

- In calendar tests, select a date different from the initial date. Derive local-date expectations from the browser date.
- In history tests, start with empty history and check both Undo and Redo.
- Wait for focus and animation completion before asserting popover state.
- Read related animated geometry in one snapshot and retry the assertions together.
- In scroll tests, observe the full interaction, including temporary jumps.
- The page does not scroll. Scroll the pane or group region (`workspace-content`, `plan-pane`, `work-pane`), not the window.
- Read geometry after the animation of a resize or collapse ends, for example with `waitForAnimations`.

## App Preview dialog

Open the app's Preview dialog through its UI. Use `openPreview` in `e2e/helpers.ts` for automated tests. Wait for fonts and pagination to settle before recording sheet counts or geometry.

Check the changed content on the sheets, including labels, clipping, overlap, and page numbers. Check a page boundary when the change affects size or pagination. Compare the preview with the workspace for data and label consistency. Verify dialog dismissal and focus return when the change affects interaction.

The workspace and sheets use separate components. Read `docs/adr/0008-print-blocks.md` when a change affects both. Do not infer that sheets are correct from a workspace screenshot. Use `e2e/print.e2e.ts` for existing pagination cases and assertions.

## Print output

Check print media and generate a PDF when the available browser supports it. Inspect the rendered PDF pages, not only the preview DOM. Confirm that the sheets contain the expected content, fit the selected paper, and exclude workspace controls. Allow the clipping of oversized indivisible blocks specified in `docs/spec.md`, section 7. When geometry or pagination changes, check both A4 and Letter. When printed colors change, also check output with background graphics off. Check page breaks, page count, and the affected colors or graphics against the Preview dialog.

Use the PDF options and print setup in `e2e/print.e2e.ts` as a reference. CSS print emulation checks styles; it does not by itself validate PDF pagination or a native print dialog. A generated PDF does not prove physical printer output. State which evidence was available.

## Installed PWA and offline use

Use the fresh production build. The default CLI profile is isolated and headless; a normal browser tab or manifest check does not prove installed-app behavior. When an installed app window is available, launch it and check the affected layout and interactions. Confirm standalone display mode. If installation or an installed window cannot be exercised, report that mode as unvalidated and continue with the browser-based offline checks.

For offline checks:

1. Load the test plan online. Wait for `navigator.serviceWorker.ready` and confirm that `navigator.serviceWorker.controller` is non-null.
2. Set the browser context offline, then reload. Check the plan content and the affected controls.
3. Make a relevant edit in the disposable plan. Reload offline and confirm that it persists when persistence is part of the expected behavior. Check the Preview dialog offline.
4. Restore the browser context to online in cleanup, including after failures.

Use `e2e/pwa.e2e.ts` for the readiness and offline sequence. Its manifest and offline-tab tests do not validate an installed window.

An old worker can serve an old build. Use a fresh test profile, or close all test tabs and installed test windows before reopening after an update. Do not force `skipWaiting` to make the check pass. See `docs/adr/0007-static-spa-offline.md` for the update lifecycle.

## Evidence and completion

Run the regression checks required by `AGENTS.md`. Interactive checks supplement those tests. Close the CLI session and stop servers started for this validation.

Report the result for workspace, Preview dialog, print output, installed PWA, and offline reload. For each mode, state what was checked and whether it passed, failed, or was not validated. Link useful artifacts. For an unavailable mode, give the specific limitation and identify any narrower check that did run. Do not count that narrower check as a pass for the unavailable mode.
