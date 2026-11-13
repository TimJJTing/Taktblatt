import type { RouteMapModel } from '#lib/domain/route-map.ts';
import type { RouteMapLayout } from './route-map-layout.ts';
import type { RouteMapRoute } from './route-map-router.ts';
import type { Scene } from './types.ts';

const len = (px: number) => ({ f: 0, px });
export function routeMapScene(
	model: RouteMapModel,
	layout: RouteMapLayout,
	routes: readonly RouteMapRoute[]
): Scene {
	return {
		view: 'route-map',
		nodes: model.nodes.map(({ id, stageId, status }) => ({ id, stageId, status })),
		edges: routes.map(({ key, from, to, cycle }) => ({ key, from, to, cycle })),
		geometry: {
			nodes: layout.stations.map((s) => ({
				id: s.id,
				x: len(s.hitBox.x),
				y: len(s.hitBox.y),
				w: len(s.hitBox.w),
				h: len(s.hitBox.h),
				radius: s.hitBox.w / 2
			})),
			edges: routes.map((r) => ({
				key: r.key,
				from: r.from,
				to: r.to,
				cycle: r.cycle,
				trunk: r.key,
				points: r.points.map((p) => ({ x: len(p.x), y: len(p.y) }))
			})),
			junctions: []
		},
		breaks: []
	};
}
