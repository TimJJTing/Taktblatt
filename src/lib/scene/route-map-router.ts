import type { RouteMapEdge, RouteMapModel } from '#lib/domain/route-map.ts';
import type { RouteMapLayout, RouteMapPoint } from './route-map-layout.ts';

export interface RouteMapRoute extends RouteMapEdge {
	points: readonly RouteMapPoint[];
}

export function routeMapRoutes(
	model: RouteMapModel,
	layout: RouteMapLayout
): readonly RouteMapRoute[] {
	const stations = new Map(layout.stations.map((s) => [s.id, s]));
	return model.edges.flatMap((edge, i) => {
		const from = stations.get(edge.from),
			to = stations.get(edge.to);
		if (!from || !to) return [];
		const x1 = from.labelBox.x + from.labelBox.w + layout.clearance;
		const x2 = to.labelBox.x - layout.clearance;
		const y = Math.min(...layout.stations.map((s) => s.hitBox.y)) - layout.clearance - 1 - i;
		return [
			{
				...edge,
				points: [
					from.outPort,
					{ x: x1, y: from.outPort.y },
					{ x: x1, y },
					{ x: x2, y },
					{ x: x2, y: to.inPort.y },
					to.inPort
				]
			}
		];
	});
}
