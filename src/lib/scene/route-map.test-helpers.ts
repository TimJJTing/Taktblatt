import { expect } from 'vitest';
import { makePlan, makeTask } from '#lib/domain/test-helpers.ts';
import type { Plan, Task } from '#lib/domain/schema.ts';
import type { RouteMapLayout, RouteMapMetrics } from './route-map-layout.ts';
import type { RouteMapRoute } from './route-map-router.ts';

export const task = (input: Partial<Task> & { id: string }) =>
	makeTask({ createdAt: '2027-01-01T00:00:00.000Z', ...input });

export const screenMetrics: RouteMapMetrics = {
	stationSize: 12,
	hitSize: 24,
	labelWidth: 144,
	labelHeight: 40,
	columnGap: 40,
	stageGap: 120,
	laneGap: 72,
	clearance: 4,
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
		expect(route.points[0]).toEqual(source.outPort);
		expect(route.points.at(-1)).toEqual(target.inPort);
		for (const p of route.points) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
		expectPathClear(route.points, layout.stations, layout.clearance, [route.from, route.to]);
	}
}

export function expectPathClear(
	points: readonly { x: number; y: number }[],
	stations: readonly Pick<RouteMapLayout['stations'][number], 'id' | 'hitBox' | 'labelBox'>[],
	clearance: number,
	excluded: readonly string[]
) {
	for (const point of points)
		expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
	for (const station of stations) {
		if (excluded.includes(station.id)) continue;
		for (const box of [station.hitBox, station.labelBox]) {
			const c = clearance;
			const obstacle = { x: box.x - c, y: box.y - c, w: box.w + 2 * c, h: box.h + 2 * c };
			for (let i = 1; i < points.length; i++) {
				expect(crosses(points[i - 1], points[i], obstacle), `Path crosses ${station.id}`).toBe(
					false
				);
			}
		}
	}
}
