---
name: Taktblatt
description: One plan, drawn as a transit line diagram on white paper, the same on screen and on the printed sheet.
colors:
  paper-white: '#FFFFFF'
  timetable-ink: '#1A1D23'
  platform-gray: '#505663'
  timetable-gray: '#5A6070'
  caption-gray: '#767676'
  track-rule: '#C9CDD4'
  platform-rule: '#DDE0E5'
  faint-rule: '#F0F1F3'
  concourse-fill: '#EEF0F3'
  control-fill: '#F3F4F6'
  signal-red: '#C8352D'
  ready-green: '#2E9D5B'
  night-ground: '#13161A'
  night-ink: '#E7E9EC'
  night-platform-gray: '#9BA3AF'
  night-rule: '#2B3037'
  night-control-fill: '#1D2126'
  night-signal-red: '#F07A70'
  harbour-line-blue: '#2456C9'
  signal-line-amber: '#A0690A'
  garden-line-green: '#1B835A'
  twilight-line-violet: '#6A4BC4'
  brick-line-red: '#C8352D'
  canal-line-teal: '#167A8A'
  blossom-line-pink: '#B4337E'
  slate-line-gray: '#5A6478'
  harbour-line-blue-night: '#6E97EC'
  signal-line-amber-night: '#E6A940'
  garden-line-green-night: '#4FC495'
  twilight-line-violet-night: '#A68CF0'
  brick-line-red-night: '#F07A70'
  canal-line-teal-night: '#4DBCCB'
  blossom-line-pink-night: '#EB7FBE'
  slate-line-gray-night: '#9BA5B8'
  frost-band-gray: '#EEF0F3'
  frost-band-blue: '#E5EDFA'
  frost-band-amber: '#FAF0DC'
  frost-band-green: '#E2F2EA'
typography:
  display:
    fontFamily: "'Source Sans 3 Variable', 'Source Sans 3', system-ui, sans-serif"
    fontSize: '1.875rem'
    fontWeight: 600
    lineHeight: 1.2
  headline:
    fontFamily: "'Source Sans 3 Variable', 'Source Sans 3', system-ui, sans-serif"
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: 1.55
  title:
    fontFamily: "'Source Sans 3 Variable', 'Source Sans 3', system-ui, sans-serif"
    fontSize: '1rem'
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "'Source Sans 3 Variable', 'Source Sans 3', system-ui, sans-serif"
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "'Source Sans 3 Variable', 'Source Sans 3', system-ui, sans-serif"
    fontSize: '0.875rem'
    fontWeight: 600
    lineHeight: 1.43
    letterSpacing: '0.025em'
  caption:
    fontFamily: "'Source Sans 3 Variable', 'Source Sans 3', system-ui, sans-serif"
    fontSize: '0.75rem'
    fontWeight: 500
    lineHeight: 1.33
    fontFeature: "'tnum'"
  paper-label:
    fontFamily: "'Source Sans 3 Variable', 'Source Sans 3', system-ui, sans-serif"
    fontSize: '10px'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '0.05em'
  paper-caption:
    fontFamily: "'Source Sans 3 Variable', 'Source Sans 3', system-ui, sans-serif"
    fontSize: '9px'
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: '0.025em'
    fontFeature: "'tnum'"
rounded:
  badge: '4px'
  control: '6px'
  frame: '8px'
  line: '9999px'
spacing:
  hairline: '4px'
  tight: '8px'
  base: '16px'
  section: '24px'
  row: '28px'
  header: '48px'
components:
  button-primary:
    backgroundColor: '{colors.timetable-ink}'
    textColor: '{colors.paper-white}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    height: '36px'
    padding: '0 10px'
  button-outline:
    backgroundColor: '{colors.paper-white}'
    textColor: '{colors.timetable-ink}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    height: '36px'
    padding: '0 10px'
  button-outline-hover:
    backgroundColor: '{colors.control-fill}'
    textColor: '{colors.timetable-ink}'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.timetable-ink}'
    rounded: '{rounded.control}'
    size: '32px'
  button-ghost-hover:
    backgroundColor: '{colors.control-fill}'
  input:
    backgroundColor: 'transparent'
    textColor: '{colors.timetable-ink}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    height: '36px'
    padding: '4px 10px'
  stage-badge:
    backgroundColor: '{colors.garden-line-green}'
    textColor: '{colors.paper-white}'
    typography: '{typography.caption}'
    rounded: '{rounded.badge}'
    padding: '0 6px'
    height: '20px'
  owner-chip:
    backgroundColor: '{colors.control-fill}'
    textColor: '{colors.platform-gray}'
    typography: '{typography.caption}'
    rounded: '{rounded.line}'
    height: '20px'
    padding: '2px 8px'
  stage-card:
    backgroundColor: '{colors.paper-white}'
    textColor: '{colors.timetable-ink}'
    rounded: '{rounded.frame}'
    padding: '16px'
  today-tag:
    backgroundColor: '{colors.timetable-ink}'
    textColor: '{colors.paper-white}'
    typography: '{typography.paper-caption}'
    rounded: '{rounded.badge}'
    padding: '0 4px'
---

# Design System: Taktblatt

## Overview

**Creative North Star: "The Linienplan"**

Taktblatt draws a plan the way a transit authority draws its network map. Each stage is a line with its own color. Each task is a station on that line. Dependencies are connectors that bend only at right angles and 45°. Milestones are interchange rings. The ground is white paper, and the ink is a cool near-black. Everything else stays quiet so that the lines carry the plan.

The mood is precise and civic, like public wayfinding signage. Labels are exact, figures are tabular, and every mark means one thing. The system is also alive in motion. Every change in position moves through `motionDuration()`, so a reader can follow a task to its new place. When reduced motion is on, the change is immediate.

Screen and paper speak one language. The printed sheet is not an export of the screen. It is the same diagram at a smaller scale, always on white, with every route at full strength. Dark mode exists for the screen only. It moves the ground to night (#13161A) and lifts each line color so that it stays legible.

**Key Characteristics:**

- White ground, cool ink, hairline rules; color belongs to the plan content.
- Stage lines in eight curated colors, each at 4.5:1 or more against white.
- Fully rounded task lines with station dots at each end.
- Connectors without arrowheads, with right-angle and 45° bends.
- Source Sans 3 everywhere, with tabular figures for dates, counts and targets.
- Flat surfaces. Only layers that really float carry shadow or blur.
- Every position change animates. Reduced motion makes it immediate.

## Colors

A neutral paper-and-ink base, with all chroma reserved for the eight stage lines and a few signal colors.

### Primary

- **Timetable Ink** (`timetable-ink`): main text, the primary button fill, focus rings, the Today tag, and the default milestone ring. It is the only "accent" of the chrome.

### Secondary

The stage lines. A plan file stores the line by name (`blue`, `amber`, …), so the hex values can change without a schema change. Each line has a light value for white ground and paper, and a `-night` value for the dark screen theme with 6:1 or more against Night Ground.

- **Harbour Line Blue** (`harbour-line-blue`), **Signal Line Amber** (`signal-line-amber`), **Garden Line Green** (`garden-line-green`), **Twilight Line Violet** (`twilight-line-violet`), **Brick Line Red** (`brick-line-red`), **Canal Line Teal** (`canal-line-teal`), **Blossom Line Pink** (`blossom-line-pink`), **Slate Line Gray** (`slate-line-gray`): task lines, station dots, stage badges, the 4px stage rule under a work plan heading, and the top border of a stage card. A new stage takes the first line that no stage uses.

### Tertiary

- **Frost Band tints** (`frost-band-gray`, `-blue`, `-amber`, `-green`): bands behind task lines that mark a time range, such as frost risk. On the dark screen, a band uses its line's night value at 14% opacity, and gray uses white at 7%.
- **Signal Red** (`signal-red`): dotted cycle connectors on paper, and destructive actions on screen. It has the same value as Brick Line Red. The dotted pattern, not the hue, marks a cycle.
- **Ready Green** (`ready-green`): the ready light in the task label slot. It never colors a task line.

### Neutral

- **Paper White** (`paper-white`): the ground of the screen, the dialogs and every printed sheet.
- **Platform Gray** (`platform-gray`): secondary text, column headings, and dependency connectors.
- **Timetable Gray** (`timetable-gray`) and **Caption Gray** (`caption-gray`): small captions and eyebrow labels on paper.
- **Track Rule** (`track-rule`), **Platform Rule** (`platform-rule`), **Faint Rule** (`faint-rule`): the three weights of hairline. Platform Rule is the screen border and input stroke.
- **Concourse Fill** (`concourse-fill`) and **Control Fill** (`control-fill`): neutral fills for the gray band, hovered controls and owner chips.
- **Night Ground**, **Night Ink**, **Night Platform Gray**, **Night Rule**, **Night Control Fill**: the same roles in the dark screen theme.

### Named Rules

**The Lines Carry the Color Rule.** Only plan content is colored: stage lines, bands and status signals. Chrome stays ink on white. Never use a stage color for a button, link or menu.

**The Paper Is Always White Rule.** Preview and print use light line values on Paper White in every screen theme. They show all routes at full strength, with no hover or focus dimming.

**The Mix, Never Fade Rule.** Dim a diagram mark by mixing its color with the ground, never by reducing element opacity. Task lines and station dots stay opaque over connectors. Apply one dim level at a time.

## Typography

**Display Font:** Source Sans 3 Variable (self-hosted, with system-ui and sans-serif fallback)
**Body Font:** Source Sans 3 Variable
**Label/Mono Font:** Source Sans 3 Variable with tabular figures; no monospace face.

**Character:** a humanist transit sans. It reads like station signage: open, even and plain. One family carries every role. Weight, size and capitals make the hierarchy.

### Hierarchy

- **Display** (600, 1.875rem, 1.2): the plan heading. Use it once per plan.
- **Headline** (600, 1.125rem, 1.55): stage card titles.
- **Title** (600, 1rem, 1.5): stage headings in the work plan.
- **Body** (400, 0.875rem, 1.43): table cells, fields, menus and dialogs. Most of the screen is body text.
- **Label** (600, 0.875rem, 0.025em, uppercase): section eyebrows such as TIMELINE and WORK PLAN.
- **Caption** (500, 0.75rem, tabular figures): progress counts, stage card labels and owner chips.
- **Paper Label** (600, 10px, 0.05em, uppercase) and **Paper Caption** (500, 9px, tabular figures): section labels and Gantt captions on the printed sheet.

### Named Rules

**The Tabular Figures Rule.** Dates, counts, targets and stage numbers use tabular figures, so the columns align like a timetable.

**The One Family Rule.** Do not add a second typeface. Make hierarchy with weight, size and uppercase tracking.

## Layout

On a screen 1024px wide or more, the workspace is split into two panes. The plan pane shows the heading, the timeline, the stage overview and the remarks. The work plan pane shows the stage tables. Each pane scrolls on its own, and a draggable divider sets the widths. On a narrower screen, a floating bottom tab bar switches between Overview and Work plan. The timeline stays pinned at the top and collapses to a 4px stage edge when the content scrolls.

The header is a 48px bar. Gantt rows, the header row and the milestone row are each 28px. The timeline needs at least 640px and scrolls horizontally below that. The stage overview grid has 1, 2 or 3 columns at container widths of 480px and 720px. Spacing follows a 4px base: 8px within a group, 16px inside cards and between controls, and 24px or more between sections.

Paper has its own fixed density. Paper Gantt rows are 18px. Top-level task lines are 5px with 1px connectors, and subtask lines are 3.5px with 0.75px connectors. Paper does not change with the screen layout.

**The Basic Layout Rule.** Keep the split workspace and the bottom tabs. New work fits into the existing panes; it does not add a sidebar, a dashboard grid or a card wall.

## Elevation & Depth

The system is flat. The workspace and paper use hairline rules and white space for structure, not shadows. Depth appears only on layers that really sit above the page. The 48px header blurs the content that scrolls under it (90% ground, then 75% with backdrop-filter). The mobile tab bar is frosted glass: 55% ground, a 20px blur, an inner highlight and a soft drop shadow. Popovers, menus and dialogs use the standard small-to-large shadows of the vendored controls. Paper never has shadows.

### Shadow Vocabulary

- **Control lift** (`shadow-xs`): outline buttons and inputs only.
- **Floating panel** (`shadow-md`): popovers, menus and tooltips.
- **Dialog** (`shadow-xl`): modal dialogs and the bottom sheet.
- **Glass tab bar** (`0 8px 24px -6px rgb(0 0 0 / 0.25), 0 2px 6px rgb(0 0 0 / 0.08)` plus inner highlights): the floating mobile tabs. In dark mode it is stronger (0.5 and 0.2).

### Named Rules

**The Float Only What Floats Rule.** A surface gets shadow or blur only if it is above the page: the header, the tab bar, popovers and dialogs. Panes, tables, cards and the chart frame stay flat.

## Shapes

The form language is the transit map. Task lines are fully rounded segments: 8px thick for top-level tasks and 6px for subtasks on screen. A white station dot, ringed in the line color, marks each unclipped end. Connectors are 2px Platform Gray strokes. They bend only at 90° and 45° and join at small interchange rings. Milestones are ink interchange rings or one of the other milestone symbols.

Corners are small and consistent. Stage badges and the Today tag have a 4px corner (`rounded.badge`). Buttons and inputs have 6px (`rounded.control`). The chart frame and stage cards have 8px (`rounded.frame`). Lines, owner chips, the tab bar and scrollbar thumbs are fully rounded (`rounded.line`).

Status signs are circles only: a ring (Todo), half filled (In progress), a check (Done), and a slash (Canceled). The overlay scrollbar has no track: a 6px rounded thumb at 25% ink shows while the pane scrolls, grows to 10px at 40% on hover, and hides at rest.

**The No Squares Rule.** Do not use square status signs or square subtask signs in any view.

## Components

The vendored shadcn-svelte controls are quiet supporting chrome: neutral, ink on white, and out of the way. The signature components are the diagram signs, and they share one meaning across the Gantt, Route map, Kanban and Work plan.

### Buttons

- **Shape:** gently rounded (6px), 36px tall by default; 32px and 24px compact sizes for icon buttons in tight rows.
- **Primary:** Timetable Ink fill with white text. Use it for the one main action in a surface, such as Print.
- **Hover / Focus:** hover blends the fill to 80%, or adds Control Fill on outline and ghost buttons. Focus shows a 3px ring at 50% ink. A press moves the button down by 1px.
- **Outline / Ghost:** outline is white with a Platform Rule border and a small lift (Fit to tasks, Legends). Ghost has no fill until hover, and it is the default for icon actions such as undo, redo and the stage menu.

### Chips

- **Owner chip:** a fully rounded Control Fill pill with Platform Gray caption text.
- **Legend chip:** on the narrow layout, legends are one swipeable line of chips below the chart.

### Cards / Containers

- **Stage card:** on screen, 8px corners, a 1px Platform Rule border whose top edge takes the stage's line color, and 16px padding. On paper, square corners, a 3px top edge in the light line color, and 10px padding. Contents are a caption label, a headline, a short description and a bullet list of deliverables.
- **Chart frame:** 8px corners and a Platform Rule border around the Gantt, flat.

### Inputs / Fields

- **Style:** transparent fill, a Platform Rule stroke, a control lift, 6px corners and 36px tall. Text is 16px on small screens, which stops iOS zoom, and body size from 768px up.
- **Focus:** the border shifts to ink with a 3px ring at 50% ink.
- **Error:** the border and ring use Signal Red.

### Navigation

- **Header:** a sticky 48px bar with the app name, a slash, the plan switcher, then undo, redo and the menu at the right. It has a bottom rule and a blurred translucent ground.
- **View switch:** a compact segmented control (Gantt, Route map, Kanban) that fits in the 24px Timeline heading row. The selected segment is an ink fill with white text.
- **Bottom tabs:** on a narrow screen, a frosted pill with two icon tabs and a sliding indicator. The tabs get smaller while content scrolls.

### Stage Badge and Stage Rule

The stage label (S1, S2, …) on the line color, with a 4px corner and caption-weight text. Text is white on light fills and Night Ground on dark fills, at 4.5:1 or more. Under each work plan stage heading, a 4px rule in the line color runs the width of the table. On paper, badges always use the light line value and have no transitions.

### Task Line and Station Dot

The Gantt's signature mark. A top-level line is 8px thick, and a subtask line is 6px in a 55% mix of the line color. Each unclipped end has a station dot whose fill gives the effective status. A ring is Todo, half filled is In progress, solid is Done, and a ring with a slash is Canceled. Done and canceled lines use a 40% mix of the line color with the ground. A done dot stays solid at full strength.

### Route Highlight

Hover or focus on a task lights its dependency route. The route's lines and connectors stay at full strength, and every other mark mixes toward the ground. The first hover route waits 300ms, and a switch to another row waits 120ms. When the pointer leaves, the route stays for 250ms. Keyboard focus shows the route at once. On a touch screen, a tap toggles it. Paper never dims.

### Today Line and Tag

A dashed ink line at today's date, with a small Timetable Ink tag that reads "Today" in white.

## Do's and Don'ts

### Do:

- **Do** route every motion duration through `motionDuration(ms)`. Use 240ms for geometry changes inside a diagram, 300ms for a switch between diagrams, and 180ms for the timeline collapse.
- **Do** keep each light line color at 4.5:1 or more against white and each night value at 6:1 or more against Night Ground.
- **Do** give every status sign a shape difference, so that it reads in grayscale print and forced colors.
- **Do** use tabular figures for dates, counts and targets.
- **Do** show hints with the project Hint component, and keep the text alternative in `aria-label`.
- **Do** make the printed sheet the same diagram as the screen: the same signs, light line values, white ground, and no dimming.

### Don't:

- **Don't** put arrowheads on dependency connectors.
- **Don't** dim a mark with element opacity; mix its color with the ground.
- **Don't** use a stage line color for chrome such as buttons, links or menus.
- **Don't** add shadows or blur to panes, tables, cards, the chart frame or paper.
- **Don't** use square status signs, a `details` disclosure triangle or a text arrow for expansion.
- **Don't** use the native `title` attribute for hints.
- **Don't** let any element jump to a new position without a transition, except when reduced motion is on.
