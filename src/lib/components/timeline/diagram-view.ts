/**
 * The Gantt registration (ADR 20). Gantt is always registered and comes first.
 * Its paper adapter returns the existing Gantt segment and legends. The shared sheet renderer
 * draws them with PrintGantt and PrintLegend, so the Gantt paper cache and routing stay the same.
 */
import { VIEW_ORDER, type DiagramViewDefinition } from '#lib/components/diagram/view-contract.ts';
import { ganttPrintSegments } from '#lib/domain/print-model.ts';
import { m } from '#lib/paraglide/messages.js';
import Gantt from './Gantt.svelte';

export const view: DiagramViewDefinition = {
	id: 'gantt',
	order: VIEW_ORDER.gantt,
	label: () => m.diagram_view_gantt(),
	component: Gantt,
	paper: { orientation: 'portrait', segments: ganttPrintSegments },
	motion: { routerId: 'gantt-orthogonal', connectorSchema: 'gantt-orthogonal-v1' }
};
