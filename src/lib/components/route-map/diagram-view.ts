import { VIEW_ORDER, type DiagramViewDefinition } from '#lib/components/diagram/view-contract.ts';
import { routeMapModel } from '#lib/domain/route-map.ts';
import { routeMapPaper } from '#lib/scene/route-map-paper.ts';
import { m } from '#lib/paraglide/messages.js';
import RouteMap from './RouteMap.svelte';
import PrintRouteMap from './PrintRouteMap.svelte';

export const view: DiagramViewDefinition = {
	id: 'route-map',
	order: VIEW_ORDER['route-map'],
	label: () => m.diagram_view_route_map(),
	component: RouteMap,
	paper: {
		orientation: 'landscape',
		segments: ({ plan, isExpanded }) => {
			const model = routeMapModel(
				plan,
				new Set(plan.tasks.filter((task) => isExpanded(task.id)).map((task) => task.id))
			);
			const letter = plan.paper === 'letter';
			const paper = routeMapPaper(model, {
				hitSize: 24,
				labelWidth: 144,
				labelHeight: 40,
				columnGap: 40,
				stageGap: 120,
				laneGap: 72,
				clearance: 4,
				measureText: (text) => Array.from(text).length * 7,
				sheetWidth: letter ? 1056 : (297 * 96) / 25.4,
				sheetHeight: letter ? 816 : (210 * 96) / 25.4,
				margin: 57,
				repeatedLabelWidth: 0,
				gutter: 0,
				headerHeight: 36,
				footerHeight: 54,
				lineHeight: 16
			});
			return [
				{
					...paper.segment,
					data: { stages: plan.stages, nodes: model.nodes, panels: paper.panels }
				},
				{
					kind: 'legend',
					id: 'legend-stages',
					which: 'stages',
					keep: 1,
					gap: 6,
					breakBefore: false,
					orientation: 'landscape'
				}
			];
		},
		component: PrintRouteMap
	},
	motion: { routerId: 'route-map', connectorSchema: 'route-map-v1' }
};
