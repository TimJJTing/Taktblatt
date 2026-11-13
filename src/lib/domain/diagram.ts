/**
 * Shared identifiers of the diagram views. Refer to ADR 20.
 * The domain, state and component layers all read these values, so they live in the domain layer.
 */

/** A stable view id. The known ids are `gantt`, `route-map` and `kanban`. */
export type DiagramViewId = string;

/** Gantt is always registered. It is the fallback for an unavailable view. */
export const GANTT_VIEW_ID: DiagramViewId = 'gantt';

/** The orientation of a sheet. Shared plan content is always portrait. */
export type DiagramOrientation = 'portrait' | 'landscape';
