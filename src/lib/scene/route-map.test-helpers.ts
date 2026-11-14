import { expect } from 'vitest';
import { createExamplePlan } from '#lib/domain/example.ts';
import { makePlan, makeTask } from '#lib/domain/test-helpers.ts';
import type { Plan, Task } from '#lib/domain/schema.ts';
import {
	routeMapLayout,
	type RouteMapLayout,
	type RouteMapMetrics,
	type RouteMapPoint,
	type RouteMapBox
} from './route-map-layout.ts';
import { type RouteMapModel } from '#lib/domain/route-map.ts';
import { routeMapRoutes } from './route-map-router.ts';
import type { RouteMapRoute } from './route-map-router.ts';

export const task = (input: Partial<Task> & { id: string }) =>
	makeTask({ createdAt: '2027-01-01T00:00:00.000Z', ...input });

export const screenMetrics: RouteMapMetrics & { measureText: (text: string) => number } = {
	hitSize: 28,
	labelWidth: 96,
	labelHeight: 32,
	columnGap: 16,
	stageGap: 120,
	laneGap: 40,
	clearance: 5,
	measureText: (text: string) => Array.from(text).length * 7
};

export function adr13Plan(): Plan {
	return makePlan([
		task({ id: 'P', dependsOn: ['X'] }),
		task({ id: 'S', parentId: 'P' }),
		task({ id: 'X', dependsOn: ['S'] })
	]);
}

export function groupingPlan(): Plan {
	return makePlan([
		task({ id: 'P', dependsOn: ['Q'] }),
		task({ id: 'S', parentId: 'P' }),
		task({ id: 'Q' }),
		task({ id: 'T', parentId: 'Q', dependsOn: ['X'] }),
		task({ id: 'X', dependsOn: ['S'] })
	]);
}

export function clearancePlan(): Plan {
	return makePlan([
		task({ id: 'A', start: '2027-01-01' }),
		task({ id: 'B', start: '2027-01-02', title: 'B label fills its reserved box' }),
		task({ id: 'C', start: '2027-01-03', dependsOn: ['A'] })
	]);
}

export function largePlan(): Plan {
	const tasks: Task[] = [];
	for (let s = 0; s < 4; s++) {
		for (let i = 0; i < 30; i++) {
			const dependsOn: string[] = [];
			if (i > 0) dependsOn.push(`T${s}-${i - 1}`);
			if (i >= 2 && i <= 20) dependsOn.push(`T${s}-${i - 2}`);
			if (i === 0) dependsOn.push(`T${s}-29`, `T${(s + 3) % 4}-29`);
			tasks.push(
				task({
					id: `T${s}-${i}`,
					stageId: `s${s}`,
					start: '2027-01-01',
					end: '2027-01-02',
					dependsOn
				})
			);
		}
	}
	return makePlan(tasks, ['s0', 's1', 's2', 's3']);
}

export function shuffled(plan: Plan): Plan {
	return {
		...plan,
		tasks: [...plan.tasks.filter((_, i) => i % 2), ...plan.tasks.filter((_, i) => !(i % 2))]
			.reverse()
			.map((t) => ({ ...t, dependsOn: [...t.dependsOn].reverse() }))
	};
}

/** Test a segment against the open interior of a rectangle. Boundary contact is legal. */
function crosses(
	a: { x: number; y: number },
	b: { x: number; y: number },
	box: {
		x: number;
		y: number;
		w: number;
		h: number;
	}
): boolean {
	let low = 0;
	let high = 1;
	for (const [origin, delta, min, max] of [
		[a.x, b.x - a.x, box.x + 1e-7, box.x + box.w - 1e-7],
		[a.y, b.y - a.y, box.y + 1e-7, box.y + box.h - 1e-7]
	]) {
		if (delta === 0) {
			if (origin < min || origin > max) return false;
		} else {
			const t0 = (min - origin) / delta;
			const t1 = (max - origin) / delta;
			low = Math.max(low, Math.min(t0, t1));
			high = Math.min(high, Math.max(t0, t1));
			if (low > high) return false;
		}
	}
	return low <= high;
}

export function expectClearRoutes(
	layout: Pick<RouteMapLayout, 'stations' | 'clearance'>,
	routes: readonly RouteMapRoute[]
) {
	for (const route of routes) {
		const source = layout.stations.find((s) => s.id === route.from)!;
		const target = layout.stations.find((s) => s.id === route.to)!;
		expect(route.points.length).toBeGreaterThanOrEqual(2);
		const carrier = route as MetroRoute;
		expect(route.points[0]).toEqual(carrier.dock ? carrier.dock.point : center(source));
		expect(route.points.at(-1)).toEqual(center(target));
		expectOctilinear(route.points);
		for (const p of route.points) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
		expectPathClear(route.points, layout.stations, layout.clearance, [route.from, route.to]);
	}
}

/** Check settled direction. Backward paths retain their return corridors. */
export function expectWalkwayDirection(
	route: MetroRoute,
	source: { center: RouteMapPoint; column: number },
	target: { center: RouteMapPoint; column: number },
	crossBand: boolean,
	paper = false
) {
	const p = route.points;
	expect(p).toHaveLength(8);
	expect(p[7]).toEqual(target.center);
	expect(p[7].x - p[6].x).toBeGreaterThan(0);
	expect(p[7].y - p[6].y).toBeCloseTo(p[7].x - p[6].x);
	if (route.cycle || source.column >= target.column) {
		expect(p[0]).toEqual(source.center);
	} else if (crossBand) {
		const below = target.center.y > source.center.y;
		expect(route.dock?.hostId).toBe(route.from);
		expect(route.dock?.side).toBe(below ? 'below' : 'above');
		expect(p[0]).toEqual(route.dock?.point);
		expect(p[0].x).toBe(source.center.x);
		expect((p[0].y - source.center.y) * (below ? 1 : -1)).toBeGreaterThan(0);
		expect(p[1].y).toBe(p[0].y);
		expect(p[1].x - p[0].x).toBeGreaterThanOrEqual(52);
		expect(p[2].x - p[1].x).toBe(paper ? 5 : 8);
		expect(p[2].y - p[1].y).toBe((below ? 1 : -1) * (paper ? 5 : 8));
		expect(p[3].x).toBe(p[2].x);
		expect((p[3].y - p[2].y) * (below ? 1 : -1)).toBeGreaterThan(0);
		if (below) expect(Math.min(...p.map((point) => point.y))).toBeGreaterThanOrEqual(p[0].y);
	} else {
		expect(p[0]).toEqual(source.center);
		expect(p[1].x - p[0].x).toBeGreaterThan(0);
		expect(p[0].y - p[1].y).toBeCloseTo(p[1].x - p[0].x);
	}
	expectOctilinear(p);
}

export function expectPathClear(
	points: readonly { x: number; y: number }[],
	stations: readonly (Pick<RouteMapLayout['stations'][number], 'id' | 'hitBox' | 'labelBox'> & {
		focusBox?: RouteMapBox;
		controlBoxes?: readonly RouteMapBox[];
	})[],
	clearance: number,
	excluded: readonly string[]
) {
	for (const point of points)
		expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
	for (const station of stations) {
		for (const box of [
			station.hitBox,
			station.labelBox,
			...(station.focusBox ? [station.focusBox] : []),
			...(station.controlBoxes ?? [])
		]) {
			const c = clearance;
			const obstacle = { x: box.x - c, y: box.y - c, w: box.w + 2 * c, h: box.h + 2 * c };
			for (let i = 1; i < points.length; i++) {
				const endpointEscape =
					excluded.includes(station.id) &&
					(box === station.hitBox || box === station.focusBox) &&
					(i === 1 || i === points.length - 1);
				if (!endpointEscape)
					expect(crosses(points[i - 1], points[i], obstacle), `Path crosses ${station.id}`).toBe(
						false
					);
			}
		}
	}
}

/** D53 scene fields required by the acceptance tests. Production exports must expose these fields. */
export interface MetroLayout extends Pick<
	RouteMapLayout,
	'clearance' | 'width' | 'height' | 'stageYs' | 'loops'
> {
	stations: readonly (RouteMapLayout['stations'][number] & {
		center: RouteMapPoint;
		column: number;
		track: number;
		focusBox: RouteMapBox;
		controlBoxes: readonly RouteMapBox[];
	})[];
	columns: readonly {
		id: string;
		index: number;
		x: number;
		width: number;
		stationIds: readonly string[];
		routingOnly: boolean;
	}[];
	lines: readonly {
		key: string;
		stageId: string;
		taskIds: readonly string[];
		dependencyKeys: readonly string[];
		points: readonly RouteMapPoint[];
		width: number;
	}[];
	signs: readonly {
		kind: 'terminus' | 'interchange';
		stationId: string | null;
		stageId: string;
		center: RouteMapPoint;
		width: number;
		height: number;
		slots: number;
		outlineWidth: number;
	}[];
	familyReturns: readonly {
		parentId: string;
		points: readonly RouteMapPoint[];
		columnIds: readonly string[];
	}[];
	gutters: readonly { x: number; width: number; risers: readonly { key: string; x: number }[] }[];
	corridors: readonly {
		id: string;
		trackY: number;
		laneCount: number;
		intervals: readonly { key: string; start: number; end: number; lane: number }[];
	}[];
	junctions: readonly { point: RouteMapPoint; memberKeys: readonly string[] }[];
	stageLabels: readonly {
		stageId: string;
		hostId: string | null;
		role: 'start' | 'end' | 'both';
		box: RouteMapBox;
		titleBox?: RouteMapBox;
		progressBox?: RouteMapBox;
	}[];
}
export interface MetroRoute extends RouteMapRoute {
	carrier: 'line' | 'lead-in' | 'walkway';
	dock?: { hostId: string; side: 'above' | 'below'; point: RouteMapPoint };
	corridorId?: string;
	lane?: number;
	trunkId?: string;
}

export const metroLayout = (model: RouteMapModel, metrics = screenMetrics) =>
	routeMapLayout(model, metrics) as unknown as MetroLayout;
export const metroRoutes = (model: RouteMapModel, layout: MetroLayout) =>
	routeMapRoutes(model, layout as unknown as RouteMapLayout) as readonly MetroRoute[];
export const center = (
	station: Pick<RouteMapLayout['stations'][number], 'hitBox'>
): RouteMapPoint => ({
	x: station.hitBox.x + station.hitBox.w / 2,
	y: station.hitBox.y + station.hitBox.h / 2
});
export function expectOctilinear(points: readonly RouteMapPoint[]) {
	for (let i = 1; i < points.length; i++) {
		const dx = Math.abs(points[i].x - points[i - 1].x);
		const dy = Math.abs(points[i].y - points[i - 1].y);
		expect(Number.isFinite(dx + dy)).toBe(true);
		expect(dx < 1e-6 || dy < 1e-6 || Math.abs(dx - dy) < 1e-6, `Nonoctilinear segment ${i}`).toBe(
			true
		);
	}
}
export function expectCoverage(model: RouteMapModel, routes: readonly MetroRoute[]) {
	expect(routes.map((r) => r.key).sort()).toEqual(model.edges.map((e) => e.key).sort());
	expect(routes.every((r) => ['line', 'lead-in', 'walkway'].includes(r.carrier))).toBe(true);
	const identity = (edge: { taskId: string; dependencyId: string }) =>
		JSON.stringify([edge.taskId, edge.dependencyId]);
	expect(routes.flatMap((r) => r.stored.map(identity)).sort()).toEqual(
		model.edges.flatMap((e) => e.stored.map(identity)).sort()
	);
}

/** Half-open intervals can reuse a lane when their endpoints meet. */
export function maximumOverlap(intervals: readonly { start: number; end: number }[]) {
	const events = intervals
		.flatMap((i) => [
			[i.start, 1],
			[i.end, -1]
		])
		.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	let active = 0,
		maximum = 0;
	for (const [, delta] of events) {
		active += delta;
		maximum = Math.max(maximum, active);
	}
	return maximum;
}

/** The original six-edge sketch. This is not the application example plan. */
export function fablePlan(): Plan {
	const plan = makePlan(
		[
			task({ id: 'survey', title: 'Site survey', start: '2026-11-01', status: 'done' }),
			task({ id: 'soil', title: 'Soil preparation', start: '2026-11-02', dependsOn: ['survey'] }),
			task({
				id: 'test',
				title: 'Soil test',
				parentId: 'soil',
				start: '2026-11-02',
				status: 'done'
			}),
			task({
				id: 'compost',
				title: 'Add compost',
				parentId: 'soil',
				start: '2026-11-03',
				dependsOn: ['test'],
				status: 'in_progress'
			}),
			task({ id: 'seeds', title: 'Order seeds', start: '2026-11-04', dependsOn: ['survey'] }),
			task({ id: 'water', title: 'Watering rota', stageId: 's2', dependsOn: ['soil', 'seeds'] }),
			task({ id: 'stall', title: 'Neighbourhood stall', stageId: 's3', dependsOn: ['water'] })
		],
		['s1', 's2', 's3']
	);
	plan.stages.forEach((s, i) => {
		s.title = ['Prepare', 'Grow', 'Share'][i];
		s.color = ['green', 'amber', 'blue'][i] as typeof s.color;
	});
	return plan;
}

export function pinnedExamplePlan(): Plan {
	const plan = createExamplePlan('2026-11-14');
	const stages = new Map(plan.stages.map((stage, i) => [stage.id, `stage-${i}`]));
	const tasks = new Map(plan.tasks.map((task, i) => [task.id, `task-${i}`]));
	plan.stages = plan.stages.map((s) => ({ ...s, id: stages.get(s.id)! }));
	plan.tasks = plan.tasks.map((t, i) => ({
		...t,
		id: tasks.get(t.id)!,
		stageId: stages.get(t.stageId)!,
		parentId: t.parentId ? tasks.get(t.parentId)! : null,
		dependsOn: t.dependsOn.map((id) => tasks.get(id)!),
		note: t.note.replace(/@\[task:([^\]]+)\]/g, (_, id) => `@[task:${tasks.get(id)!}]`),
		createdAt: new Date(Date.parse('2026-11-14T00:00:00.000Z') + i).toISOString()
	}));
	return plan;
}
