import { VIEW_ORDER, type DiagramViewDefinition } from '#lib/components/diagram/view-contract.ts';
import { familySummaryText } from '#lib/components/diagram/family-summary.ts';
import { taskStatusLabel } from '#lib/components/task/task-status.ts';
import { familySummary } from '#lib/domain/derive.ts';
import { TASK_STATUSES } from '#lib/domain/schema.ts';
import { routeMapModel } from '#lib/domain/route-map.ts';
import {
	boundedHeading,
	ROUTE_MAP_HEADING_LIMIT,
	routeMapPaper,
	routeMapPaperHeaderHeight,
	routeMapPaperMeasureText
} from '#lib/scene/route-map-paper.ts';
import { joinList } from '#lib/domain/format.ts';
import { uiIntl } from '#lib/ui-language.ts';
import { m } from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';
import RouteMap from './RouteMap.svelte';
import PrintRouteMap from './PrintRouteMap.svelte';
import { routeMapKeyEntries } from './route-map-key.ts';

export const view: DiagramViewDefinition = {
	id: 'route-map',
	order: VIEW_ORDER['route-map'],
	label: () => m.diagram_view_route_map(),
	component: RouteMap,
	paper: {
		orientation: 'landscape',
		segments: ({ plan, index, showSubtasks }) => {
			const model = routeMapModel(
				plan,
				new Set(plan.tasks.filter((task) => showSubtasks(task.id)).map((task) => task.id)),
				index
			);
			const letter = plan.paper === 'letter';
			const sheetWidth = letter ? 1056 : (297 * 96) / 25.4;
			const measureText = routeMapPaperMeasureText;
			// Use maximum-width characters for all bounded lists, independent of the plan size.
			const headingField = boundedHeading('Ｗ'.repeat(ROUTE_MAP_HEADING_LIMIT));
			const headerHeight = routeMapPaperHeaderHeight(
				{
					heading: m.route_map_print_header_parents({
						panels: headingField,
						stages: headingField,
						parents: headingField
					}),
					keyEntries: routeMapKeyEntries().map((entry) => entry.label),
					statusEntries: TASK_STATUSES.map(taskStatusLabel),
					readiness: m.diagram_status_key_readiness()
				},
				sheetWidth - 114,
				measureText
			);
			const paper = routeMapPaper(model, {
				hitSize: 28,
				labelWidth: 96,
				labelHeight: 32,
				columnGap: 16,
				stageGap: 120,
				laneGap: 40,
				clearance: 4,
				measureText,
				sheetWidth,
				sheetHeight: letter ? 816 : (210 * 96) / 25.4,
				margin: 57,
				repeatedLabelWidth: 0,
				gutter: 0,
				headerHeight,
				footerHeight: 54,
				lineHeight: 16,
				summaryText: (id) => familySummaryText(familySummary(index, id), getLocale()),
				formatTargets: (targets) =>
					joinList(
						targets.map((t) => `${t.reference} ${t.title}`),
						uiIntl()
					)
			});
			return [
				{
					...paper.segment,
					data: { stages: plan.stages, nodes: model.nodes, panels: paper.panels, headerHeight }
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
	motion: { routerId: 'route-map', connectorSchema: 'route-map-v4' }
};
