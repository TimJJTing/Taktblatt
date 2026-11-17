/**
 * The contract of a diagram view. Refer to docs/spec/diagram-views.md#513-diagram-views, and ADR 20.
 *
 * Each view registers through its own `src/lib/components/<folder>/diagram-view.ts` module.
 * That module exports `view`, a `DiagramViewDefinition`. The registry discovers the modules at
 * build time. This contract module and the registry are outside the discovery pattern.
 */
import type { Component } from 'svelte';
import type { DiagramOrientation, DiagramViewId } from '#lib/domain/diagram.ts';
import type { DiagramSegment, PrintModelInput, SceneSegment } from '#lib/domain/print-model.ts';
import type { Band, Milestone } from '#lib/domain/schema.ts';

export { GANTT_VIEW_ID, type DiagramOrientation, type DiagramViewId } from '#lib/domain/diagram.ts';

/** The fixed display and print order of the known views. A lower number comes first. */
export const VIEW_ORDER = { gantt: 0, 'route-map': 10, kanban: 20 } as const;

/**
 * The props of a screen renderer. The stage gives the same props to every view.
 * A view reads the plan, viewer and editing state from context. Content edits go through
 * `src/lib/state/commands.ts`, so a later view can add task commands without a contract change.
 */
export interface DiagramViewProps {
	todayDate: string;
	class?: string;
	onBand: (band: Band) => void;
	onMilestone: (milestone: Milestone) => void;
	/**
	 * Reveals a viewport rectangle in the Timeline body. Shared focus reveal requests `instant`
	 * behavior and marks app scrolling. Other view actions keep the default scroll behavior.
	 */
	onReveal: (row: { top: number; bottom: number }, behavior?: ScrollBehavior) => void;
}

/** The props of a paper renderer for a generic scene segment. */
export interface DiagramPaperProps {
	segment: SceneSegment;
	/** The items from `from` (included) to `to` (not included). */
	from: number;
	to: number;
	/** True for the first fragment. It shows the lead and extra parts. */
	first: boolean;
	/** The width of the sheet content in pixels. 0 while the paginator measures. */
	width: number;
}

/**
 * The paper adapter of a view. `segments` is pure: it reads the print input and returns the
 * diagram segments, including its legends. Segments of kind `scene` render with `component`.
 * Segments of the built-in kinds (for example `gantt` and `legend`) use the shared renderers.
 * An adapter that returns `scene` segments must have a `component`. Without one, the sheet
 * shows nothing for the segment and a development build logs an error.
 */
export interface DiagramPaperAdapter {
	/** The orientation of the diagram on the selected paper size. */
	orientation: DiagramOrientation;
	segments: (input: PrintModelInput) => DiagramSegment[];
	component?: Component<DiagramPaperProps>;
}

/**
 * Marks for the rendered nodes of a view. The stage samples these elements for motion,
 * focus transfer and scroll reveal. The value of `task`, `station`, `label` and `parent` is a
 * task id.
 * - `task`: the task box (bar, card or label-only node).
 * - `station`: inside a task box, the identity station mark (dot, glyph or status icon wrapper).
 * - `label`: the rendered label of the task.
 * - `parent`: on a task box, the parent task id. Capture it before a task disappears for focus
 *   return. Motion also uses it for emerging subtasks.
 * - `scroller`: a scroll container of the view. The Timeline keeps its scroll offset during a
 *   height transition. The value is empty.
 * - `flight`: the stage's clipped, decorative cue-copy layer. The value is empty.
 * Focus resolves to the focusable task box, else its label, else a keyboard route target.
 * Views use the layer's return-focus resolver when opening task details. The stage owns the
 * missing-target rule: captured parent id, then selected view choice. Views keep no local fallback.
 * A route target uses the route-focus attributes: `data-route-target` and
 * `data-route-focus="keyboard"` (`ROUTE_ATTR`).
 * The stage itself sets `layer` (the layer key) and `view` (the view id) on each layer.
 */
export const DIAGRAM_ATTR = {
	flight: 'data-diagram-flight',
	task: 'data-diagram-task',
	station: 'data-diagram-station',
	label: 'data-diagram-label',
	parent: 'data-diagram-parent',
	scroller: 'data-diagram-scroller',
	layer: 'data-diagram-layer',
	view: 'data-diagram-view'
} as const;

/** The route-focus attributes of a keyboard focus target. Refer to the route-focus owner. */
export const ROUTE_ATTR = {
	target: 'data-route-target',
	focus: 'data-route-focus'
} as const;

/**
 * The motion description of a view. The stage reads current geometry from the rendered DOM.
 * These fields identify the router and its connector point meanings. Every view pair fades
 * connectors, including a compatible pair. Refer to docs/spec/diagram-views.md#513-diagram-views.
 */
export interface DiagramMotionInfo {
	/** The id of the connector router. */
	routerId: string;
	/** The meaning of the connector points, for example `gantt-orthogonal-v1`. */
	connectorSchema: string;
}

export interface DiagramViewDefinition {
	id: DiagramViewId;
	/** The display and print order. Use `VIEW_ORDER` for the known views. */
	order: number;
	/** The localized visible name. */
	label: () => string;
	/** The screen renderer. */
	component: Component<DiagramViewProps>;
	paper: DiagramPaperAdapter;
	motion: DiagramMotionInfo;
}

/** A module that registers a view exports its definition as `view`. */
export interface DiagramViewModule {
	view: DiagramViewDefinition;
}
