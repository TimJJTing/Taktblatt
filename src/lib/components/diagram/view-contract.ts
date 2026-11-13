/**
 * The contract of a diagram view. Refer to docs/spec.md, section 5.13, and ADR 20.
 *
 * Each view registers through its own `src/lib/components/<folder>/diagram-view.ts` module.
 * That module exports `view`, a `DiagramViewDefinition`. The registry discovers the modules at
 * build time. This contract module and the registry are outside the discovery pattern.
 */
import type { Component } from 'svelte';
import type {
	DiagramOrientation,
	PrintModelInput,
	SceneSegment,
	Segment
} from '#lib/domain/print-model.ts';
import type { Band, Milestone } from '#lib/domain/schema.ts';

/** A stable view id. The known ids are `gantt`, `route-map` and `kanban`. */
export type DiagramViewId = string;

/** The fixed display and print order of the known views. A lower number comes first. */
export const VIEW_ORDER = { gantt: 0, 'route-map': 10, kanban: 20 } as const;

/** Gantt is always registered. It is the fallback for an unavailable view. */
export const GANTT_VIEW_ID = 'gantt';

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
	/** Scrolls the Timeline body to show a rectangle in viewport coordinates. */
	onReveal: (row: { top: number; bottom: number }) => void;
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
 */
export interface DiagramPaperAdapter {
	/** The orientation of the diagram on the selected paper size. */
	orientation: DiagramOrientation;
	segments: (input: PrintModelInput) => Segment[];
	component?: Component<DiagramPaperProps>;
}

/**
 * Marks for the rendered task nodes of a view. The stage samples these elements for motion,
 * focus transfer and scroll reveal. The attribute value is the task id.
 * - `data-diagram-task`: the task box (bar, card or label-only node).
 * - `data-diagram-station`: the identity station dot, if the task has one.
 * - `data-diagram-label`: the rendered label of the task.
 * - `data-diagram-parent`: on a task box, the id of the parent task, for emerging subtasks.
 * A focus target uses the route-focus attributes: `data-route-target` and
 * `data-route-focus="keyboard"`.
 */
export const DIAGRAM_ATTR = {
	task: 'data-diagram-task',
	station: 'data-diagram-station',
	label: 'data-diagram-label',
	parent: 'data-diagram-parent'
} as const;

/** The motion description of a view. The stage reads current geometry from the rendered DOM. */
export interface DiagramMotionInfo {
	/** The id of the connector router. Views with the same router can tween connector points. */
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
