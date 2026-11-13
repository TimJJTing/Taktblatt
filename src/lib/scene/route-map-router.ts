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
	return model.edges.flatMap((edge) => {
		const from = stations.get(edge.from);
		const to = stations.get(edge.to);
		if (!from || !to) return [];
		const track = layout.routing.get(edge.key);
		const points = track
			? [
					from.outPort,
					{ x: track.fromX, y: from.outPort.y },
					{ x: track.fromX, y: track.channelY },
					{ x: track.toX, y: track.channelY },
					{ x: track.toX, y: to.inPort.y },
					to.inPort
				]
			: [from.outPort, from.outPort, from.outPort, to.inPort, to.inPort, to.inPort];
		return [{ ...edge, points }];
	});
}
