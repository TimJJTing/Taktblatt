# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Small teams and volunteer groups: community groups, small project teams, and the person who leads them. The lead writes a plan for a season or a project, keeps it current, and prints it for a wall, a meeting, or a handout. Team members read the printed sheet more often than the screen.

## Product Purpose

Taktblatt turns one written plan into three views: a Gantt timeline, a stage overview, and a work plan table. The same plan prints on A4 or US Letter, or saves as a PDF. Success is a plan that is quick to keep current on screen and clear to read on paper.

## Positioning

One plan, written once, that is equally at home on the screen and on a printed sheet. No server, no account, no telemetry. The data stays in the browser, and the app works offline as a PWA.

## Operating Context

- The lead edits on a laptop or desktop in a split workspace (plan pane and work plan pane), and on a phone or tablet with bottom tabs.
- The printed sheet is a factual part of the product: it hangs on a wall, sits on a meeting table, or goes out as a PDF.
- Sessions can be long. The screen must stay comfortable to read for long periods.
- UI languages: English, German, Traditional Chinese, Japanese.

## Capabilities and Constraints

- Static SvelteKit SPA, Tailwind CSS, vendored shadcn-svelte primitives, Source Sans 3.
- Plan files store stage colors and band tints by name (`blue`, `amber`, …). Hex values can change without a schema change. Each light stage color keeps 4.5:1 contrast or more against white, so white badge text works on it.
- The printed sheets are always light. The screen has light and dark themes.
- Every change in an element's position animates, through `motionDuration()`. Reduced motion makes changes immediate.
- No native `title` hints; hints use the project Hint component.

## Brand Commitments

- Name: Taktblatt.
- The user's binding qualities: simple, clean, white, easy on the eyes, a basic layout, a consistent style between the screen and the printed sheet, and animated changes so people can follow them.

## Product Principles

1. Paper is a first-class output. The screen and the sheet speak the same visual language.
2. Calm by default. The plan content carries the color; the chrome stays quiet.
3. Every change is visible as motion, never as a jump.
4. Local and private. Nothing leaves the browser.

## Accessibility & Inclusion

WCAG AA contrast for text and 3:1 for graphics. Keyboard access for bars, labels, and milestones. Reduced-motion support. Text alternatives for informative graphics.
