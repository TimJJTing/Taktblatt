import { VIEW_ORDER, type DiagramViewDefinition } from '#lib/components/diagram/view-contract.ts';
import { m } from '#lib/paraglide/messages.js';
import { kanbanPaperSegments } from '#lib/scene/kanban-paper.ts';
import Kanban from './Kanban.svelte';
import PrintKanban from './PrintKanban.svelte';
export const view: DiagramViewDefinition = {
	id: 'kanban',
	order: VIEW_ORDER.kanban,
	label: () => m.diagram_view_kanban(),
	component: Kanban,
	paper: { orientation: 'landscape', segments: kanbanPaperSegments, component: PrintKanban },
	motion: { routerId: 'kanban', connectorSchema: 'kanban-v1' }
};
