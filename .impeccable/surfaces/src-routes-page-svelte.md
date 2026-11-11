---
version: 1
slug: 'src-routes-page-svelte'
primary_target: 'src/routes/+page.svelte'
related_targets: []
---

# Workspace and printed sheets

Scope: the whole app shell, the workspace (plan pane, work plan pane, timeline), dialogs, Preview, and printed sheets. Mode: Operate.

Audience and job: a team lead for a small team or volunteer group keeps a season plan current and prints it for the wall. Constraints from the user: simple, clean, white, easy on the eyes, basic layout unchanged, the same style on the printed sheet, every change animated. Light and dark themes. Custom scrollbar: auto-hides, identical on all platforms.

## Direction contract

THESIS: Dependencies read as a metro line diagram on white paper: stage colors are lines, tasks are stations, milestones are interchanges. It refuses the category default of flat rounded bars on a gray card grid.

OWN-WORLD: White ground, ink #1A1D23, ink-2 #505663, rule #DDE0E5. Stage line colors retuned for line duty (green #23966A, amber #B47A0E, blue #2456C9, others to follow, >=3:1 on white). Humanist transit sans (Source Sans 3), tabular figures. Bars are 8px fully rounded line segments with white station dots ringed in the line color at each end; connectors 2px ink-2, bends only at 90° and 45°, joins as small interchange rings; milestones are ink interchange rings. Stage badges S1, S2 in white on line color, 4px radius. Stage rule under a work plan heading is a 4px line with a station dot at its start. Overlay scrollbar: no track, 6px rounded ink thumb at 25% while scrolling, 10px at 40% on hover, hidden at rest.

STORY: The lead sees which work is on which line and what each task waits on at a glance, edits in place, and prints a sheet that looks like the screen.

FIRST VIEWPORT: Unchanged split layout. Header bar (Taktblatt / plan switcher, undo, redo, menu). Plan pane: heading block, then the timeline as the hero with line bars, station dots, interchange milestones, the frost band behind, and a dashed today line with a dark "Today" tag. Work plan pane: stages with line badges and line rules, tables below. Signature interaction: focusing or hovering a task lights its route (upstream and downstream dependency chain) in full color and dims every other line to 30%, animated through motionDuration.

FORM: Chosen card "Linienplan", a dealt challenger (wayfinding-cartography-signage-midnight-transit-diagram) moved from midnight enamel to white because the brief pins white. Seed: seed:805965e1f6a7ba3a.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Open decisions

- The route-highlight trigger on touch, and whether print shows it (the sketch says print shows every line at full color).
- Hex values for violet, red, teal, pink and slate lines.
