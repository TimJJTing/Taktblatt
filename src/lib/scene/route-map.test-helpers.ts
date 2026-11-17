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
		expect(route.points[0]).toEqual(center(source));
		expect(route.points.at(-1)).toEqual(center(target));
		expectOctilinear(route.points);
		for (const p of route.points) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
		expectPathClear(route.points, layout.stations, layout.clearance, [route.from, route.to]);
	}
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
					(box === station.hitBox || box === station.focusBox) &&
					((i === 1 && station.id === excluded[0]) ||
						(i === points.length - 1 && station.id === excluded[excluded.length - 1]));
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
		kind: 'empty-stage' | 'interchange';
		stationId: string | null;
		stageId: string;
		center: RouteMapPoint;
		width: number;
		height: number;
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
		box: RouteMapBox;
	}[];
}
export interface MetroRoute extends RouteMapRoute {
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
	expect(routes.every((r) => ['line', 'walkway'].includes(r.carrier))).toBe(true);
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

export function longNamePlan(): Plan {
	const plan = pinnedExamplePlan();
	const title = 'Garden tasks need careful planning for every growing season!';
	return { ...plan, tasks: plan.tasks.map((item) => ({ ...item, title })) };
}

export function densePlan(): Plan {
	const tasks: Task[] = [];
	for (let i = 0; i < 3; i++) {
		const stageId = `s${i}`;
		const id = (suffix: string) => `${i}${suffix}`;
		tasks.push(
			task({ id: id('A'), stageId, dependsOn: i === 0 ? ['2E'] : [] }),
			task({ id: id('B'), stageId, dependsOn: [id('A'), ...(i === 1 ? ['0x'] : [])] }),
			task({ id: id('C'), stageId, dependsOn: [id('A'), ...(i === 2 ? ['1B'] : [])] }),
			task({ id: id('D'), stageId, dependsOn: [id('B'), id('C'), ...(i === 1 ? ['0B'] : [])] }),
			task({ id: id('E'), stageId, dependsOn: i === 2 ? ['0A'] : [] })
		);
	}
	tasks.push(
		task({ id: 'parent', stageId: 's0' }),
		task({ id: '0x', stageId: 's0', parentId: 'parent', dependsOn: ['2B'] }),
		task({ id: '0y', stageId: 's0', parentId: 'parent', dependsOn: ['0x', '1C'] }),
		task({ id: '0z', stageId: 's0', parentId: 'parent' })
	);
	return makePlan(tasks, ['s0', 's1', 's2']);
}

export function expectReservations(layout: RouteMapLayout, routes: readonly RouteMapRoute[]) {
	const boxes: { box: RouteMapBox; owner: string | null }[] = layout.stations.flatMap((s) =>
		[s.labelBox, ...s.controlBoxes].map((box) => ({ box, owner: s.id }))
	);
	boxes.push(...layout.stageLabels.map((label) => ({ box: label.box, owner: null })));
	for (let i = 0; i < boxes.length; i++) {
		for (let j = i + 1; j < boxes.length; j++) {
			if (boxes[i].owner !== null && boxes[i].owner === boxes[j].owner) continue;
			const a = boxes[i].box,
				b = boxes[j].box;
			expect(
				a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h,
				`label boxes ${i} and ${j}`
			).toBe(false);
		}
	}
	for (const s of layout.stations) {
		expect(Math.abs(s.labelBox.x + s.labelBox.w / 2 - s.center.x)).toBeLessThanOrEqual(1);
		expect(s.labelBox.y).toBeGreaterThan(s.center.y);
	}
	for (const path of [
		...layout.lines.map((line) => ({ points: line.points, ends: line.taskIds, width: line.width })),
		...routes
			.filter((route) => route.carrier === 'walkway')
			.flatMap((route) => [
				{ points: route.points, ends: [route.from, route.to], width: route.cycle ? 4 : 2 },
				...(route.chevron ? [{ points: route.chevron, ends: [] as string[], width: 2 }] : [])
			])
	]) {
		const radius = path.width / 2;
		expectPathClear(path.points, layout.stations, radius, path.ends);
		for (const badge of layout.stageLabels)
			for (let i = 1; i < path.points.length; i++)
				expect(
					crosses(path.points[i - 1], path.points[i], {
						x: badge.box.x - radius,
						y: badge.box.y - radius,
						w: badge.box.w + 2 * radius,
						h: badge.box.h + 2 * radius
					}),
					`path crosses badge ${badge.stageId}`
				).toBe(false);
	}
}

function collinearRuns(points: readonly RouteMapPoint[]): [RouteMapPoint, RouteMapPoint][] {
	const runs: [RouteMapPoint, RouteMapPoint][] = [];
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1],
			b = points[i];
		const dx = b.x - a.x,
			dy = b.y - a.y;
		const length = Math.hypot(dx, dy);
		if (!length) continue;
		const last = runs.at(-1);
		if (last) {
			const ex = last[1].x - last[0].x,
				ey = last[1].y - last[0].y;
			const existing = Math.hypot(ex, ey);
			const cross = (p: RouteMapPoint) => Math.abs(ex * (p.y - last[0].y) - ey * (p.x - last[0].x));
			if (Math.abs(dx * ey - dy * ex) <= 1e-6 * length * existing && cross(a) <= 1e-6 * existing) {
				const project = (p: RouteMapPoint) =>
					((p.x - last[0].x) * ex + (p.y - last[0].y) * ey) / existing;
				const t = project(b),
					origin = last[0];
				if (t < 0)
					last[0] = { x: origin.x + (t * ex) / existing, y: origin.y + (t * ey) / existing };
				if (t > existing)
					last[1] = { x: origin.x + (t * ex) / existing, y: origin.y + (t * ey) / existing };
				continue;
			}
		}
		runs.push([a, b]);
	}
	return runs;
}

export function expectRailClearance(layout: RouteMapLayout, routes: readonly RouteMapRoute[]) {
	for (const route of routes.filter((r) => r.carrier === 'walkway')) {
		for (const [a, b] of collinearRuns(route.points)) {
			const dx = b.x - a.x,
				dy = b.y - a.y,
				length = Math.hypot(dx, dy);
			if (!length) continue;
			for (const rail of layout.lines)
				for (const [c, d] of collinearRuns(rail.points)) {
					const ex = d.x - c.x,
						ey = d.y - c.y,
						otherLength = Math.hypot(ex, ey);
					if (!otherLength || Math.abs(dx * ey - dy * ex) > 1e-6 * length * otherLength) continue;
					const distance = Math.abs(dx * (c.y - a.y) - dy * (c.x - a.x)) / length;
					const width = rail.form === 'double' || rail.kind === 'family' ? 6 : 8;
					if (distance > width / 2 + 1) continue;
					const project = (p: RouteMapPoint) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / length;
					const t0 = project(c),
						t1 = project(d);
					const overlap = Math.max(
						0,
						Math.min(length, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1))
					);
					expect(overlap, `${route.key} overlaps ${rail.key}`).toBeLessThanOrEqual(width + 1e-6);
				}
		}
	}
}

export function expectWalkwaysClear(routes: readonly RouteMapRoute[]) {
	const walkways = routes.filter((route) => route.carrier === 'walkway');
	for (let i = 0; i < walkways.length; i++) {
		const first = walkways[i],
			firstRuns = collinearRuns(first.points);
		for (let j = i + 1; j < walkways.length; j++) {
			const second = walkways[j],
				secondRuns = collinearRuns(second.points);
			for (let a = 0; a < firstRuns.length; a++) {
				const [start, end] = firstRuns[a];
				const dx = end.x - start.x,
					dy = end.y - start.y,
					length = Math.hypot(dx, dy);
				for (let b = 0; b < secondRuns.length; b++) {
					const [otherStart, otherEnd] = secondRuns[b];
					const ex = otherEnd.x - otherStart.x,
						ey = otherEnd.y - otherStart.y;
					const otherLength = Math.hypot(ex, ey);
					if (Math.abs(dx * ey - dy * ex) > 1e-6 * length * otherLength) continue;
					const distance =
						Math.abs(dx * (otherStart.y - start.y) - dy * (otherStart.x - start.x)) / length;
					if (distance > 2) continue;
					const sharedExit = first.from === second.from && a === 0 && b === 0;
					const sharedApproach =
						first.to === second.to && a === firstRuns.length - 1 && b === secondRuns.length - 1;
					if (sharedExit || sharedApproach) continue;
					const project = (point: RouteMapPoint) =>
						((point.x - start.x) * dx + (point.y - start.y) * dy) / length;
					const t0 = project(otherStart),
						t1 = project(otherEnd);
					const overlap = Math.max(
						0,
						Math.min(length, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1))
					);
					expect(overlap, `${first.key} overlaps ${second.key}`).toBeLessThanOrEqual(8 + 1e-6);
				}
			}
		}
	}
}
