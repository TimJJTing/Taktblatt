# Dropdown previews and more milestone symbols

## Scope and decisions

Add visual previews to the band tint and milestone symbol Select controls. Keep the existing bits-ui Select controls and text names. Each preview comes before the name in every option and in the trigger. The preview is decorative and has `aria-hidden="true"`. Keep the text names as accessible names and keep the existing field labels.

Use `bandFill(bandTintVar(tint))` from `src/lib/components/plan/colors.ts` for tint swatches. Add a visible border so light tints remain visible. Use the shared icon map in `src/lib/components/timeline/milestone-symbols.ts` for symbol previews. Render icons with `fill-current`, as in the Gantt.

Use this symbol order: diamond, flag, star, circle, triangle, square, hexagon, pentagon, pin, bookmark, heart. Add the Lucide icons `triangle`, `square`, `hexagon`, `pentagon`, `map-pin`, `bookmark` and `heart`. Map `pin` to `map-pin`. The English name is "Map pin".

The pin uses a filled map-pin shape with a hole because Lucide's map-pin loses its centre when filled.

Keep `SCHEMA_VERSION = 1`. Only extend the `MILESTONE_SYMBOLS` picklist in the schema. All existing v1 files stay valid. App builds before this change reject files that use a new symbol. This applies to plan files and backup files. Keep stored plan data at version 1.

## Acceptance criteria

1. **Unit: schema.** A valid milestone accepts each of the eleven symbol keys. Test each new key separately. An unknown key is rejected. Existing v1 plan files, backup files and stored plan data remain valid. The schema version stays `1`.
2. **Unit: shared icon map.** Every key in the schema's `MILESTONE_SYMBOLS` list has an icon in `src/lib/components/timeline/milestone-symbols.ts`. The seven new keys use the specified Lucide icons.
3. **E2E: symbol previews.** Follow `e2e/overview.e2e.ts` and reuse `e2e/helpers.ts`. Open `milestone-symbol`. Check all eleven options in the specified order. Each option contains the correct filled icon before its text name. Each preview has `aria-hidden="true"`. Each option remains selectable by its exact text name. The trigger shows the selected filled icon before the selected name, both initially and after a selection.
4. **E2E: save and render.** Use `chooseOption(page, 'milestone-symbol', 'Hexagon')`. Save a milestone with a date inside the plan range. Check that stored plan data has `symbol: 'hexagon'`. Reopen the dialog and check its selected name and icon. Check the hexagon icon in the workspace Gantt and in the Gantt on a Preview print sheet. Check the icon shape, not only the milestone text or an SVG count.
5. **E2E: tint previews.** Open `band-tint`. The trigger and every option contain an `aria-hidden="true"` swatch before the text name. Each swatch has a visible border and the fill from `bandFill(bandTintVar(tint))`. Check the fill and border in light and dark themes. Use `chooseOption` to select a different tint. Check that the trigger swatch changes and the saved band uses that tint. Keep exact text names for option selection.
6. **Localization.** Add all seven symbol names to `messages/en.json`, `messages/de.json`, `messages/ja.json` and `messages/zh-TW.json`. Regenerate Paraglide output with `pnpm i18n`. Check that each language shows names in the trigger and the options. The stored symbol keys stay language-neutral.
7. **Manual: Preview and print.** Check layout, interaction, pagination and rendering in the app's Preview dialog. Check printed sheets or Save as PDF. Confirm that new symbols render and bands retain their paper tints. `pnpm preview` alone does not validate the Preview dialog.
8. **Manual: installed PWA and offline use.** Check the two Select controls, saved values and Gantt rendering in the installed PWA. Repeat the checks offline. Open Preview offline and check the new symbols on its sheets. Record each mode that cannot be validated and its reason. Do not report an unchecked mode as passed.

## Implementation plan

1. Have an independent plan verifier check this plan against the specification and the fixed decisions. Resolve material gaps before implementation.
2. Assign behavior tests to a testcase implementer. Add schema and icon-map unit tests. Add E2E tests in the style of `e2e/overview.e2e.ts`. Reuse `chooseOption`, `openApp` and `storedPlan` from `e2e/helpers.ts`. Extend shared helpers only if needed. Confirm that the new tests fail for the expected missing behavior before production changes.
3. Assign production changes to a separate code implementer. Extend the schema picklist in the specified order. Keep the schema version and compatibility handling. Add the seven icons to the shared map. Add the translated names and run `pnpm i18n`.
4. Update `BandDialog.svelte` and `MilestoneDialog.svelte`. Add decorative previews before the names in each option and the trigger. Reuse the existing Select controls, color helpers and icon map. Preserve keyboard selection, field labels and dialog save and cancel behavior.
5. Make the behavior tests pass. Have an independent reviewer check the change. Have an independent verifier run `pnpm lint`, `pnpm check` and `pnpm test`. Compare results with the acceptance criteria.
6. Use the Playwright agent CLI for interactive checks, as required by `AGENTS.md`. Complete the Preview, print and installed PWA checks, including offline use. Record results, unavailable modes and screenshots for the visual change.
