export {
	task,
	adr13Plan,
	groupingPlan,
	largePlan,
	shuffled,
	signsPlan,
	pinnedExamplePlan,
	longNamePlan,
	densePlan
} from './route-map-fixtures.test-helper.ts';
import { expect } from 'vitest';
import {
	type RouteMapLayout,
	type RouteMapMetrics,
	type RouteMapPoint,
	type RouteMapBox
} from './route-map-layout.ts';
import { type RouteMapModel } from '#lib/domain/route-map.ts';
import type { RouteMapRoute } from './route-map-router.ts';

export const screenMetrics: RouteMapMetrics & { measureText: (text: string) => number } = {
	hitSize: 28,
	labelWidth: 96,
	labelHeight: 32,
	columnGap: 16,
	clearance: 5,
	measureText: (text: string) => Array.from(text).length * 7
};

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
export function expectCoverage(model: RouteMapModel, routes: readonly RouteMapRoute[]) {
	expect(routes.map((r) => r.key).sort()).toEqual(model.edges.map((e) => e.key).sort());
	expect(routes.every((r) => ['line', 'walkway'].includes(r.carrier))).toBe(true);
	const identity = (edge: { taskId: string; dependencyId: string }) =>
		JSON.stringify([edge.taskId, edge.dependencyId]);
	expect(routes.flatMap((r) => r.stored.map(identity)).sort()).toEqual(
		model.edges.flatMap((e) => e.stored.map(identity)).sort()
	);
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

type PaperPoint = { x: number; y: number };

// Return the part of a segment inside the clearance capsule around another segment.
function bandIntervals(
	a: PaperPoint,
	b: PaperPoint,
	c: PaperPoint,
	d: PaperPoint,
	radius: number
): [number, number][] {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const ex = d.x - c.x;
	const ey = d.y - c.y;
	const lengthSquared = dx * dx + dy * dy;
	const otherLength = Math.hypot(ex, ey);
	if (!lengthSquared) return [];
	// A complete crossing passes through both sides of the band without turning in it.
	if (otherLength) {
		const sideA = ((a.x - c.x) * ey - (a.y - c.y) * ex) / otherLength;
		const sideB = ((b.x - c.x) * ey - (b.y - c.y) * ex) / otherLength;
		if ((sideA < -radius && sideB > radius) || (sideA > radius && sideB < -radius)) {
			const t = sideA / (sideA - sideB);
			const crossing = { x: a.x + t * dx, y: a.y + t * dy };
			const position = ((crossing.x - c.x) * ex + (crossing.y - c.y) * ey) / otherLength;
			if (position > radius && position < otherLength - radius) return [];
		}
	}
	const intervals: [number, number][] = [];
	for (const center of [c, d]) {
		const x = a.x - center.x;
		const y = a.y - center.y;
		const dot = x * dx + y * dy;
		const discriminant = dot * dot - lengthSquared * (x * x + y * y - radius * radius);
		if (discriminant < 0) continue;
		const start = Math.max(0, (-dot - Math.sqrt(discriminant)) / lengthSquared);
		const end = Math.min(1, (-dot + Math.sqrt(discriminant)) / lengthSquared);
		if (start < end) intervals.push([start, end]);
	}
	if (otherLength) {
		let low = 0;
		let high = 1;
		const clip = (value: number, delta: number, min: number, max: number) => {
			if (!delta) {
				if (value < min || value > max) high = -1;
				return;
			}
			const first = (min - value) / delta;
			const second = (max - value) / delta;
			low = Math.max(low, Math.min(first, second));
			high = Math.min(high, Math.max(first, second));
		};
		const x = a.x - c.x;
		const y = a.y - c.y;
		clip(x * ex + y * ey, dx * ex + dy * ey, 0, otherLength * otherLength);
		clip(x * ey - y * ex, dx * ey - dy * ex, -radius * otherLength, radius * otherLength);
		if (low < high) intervals.push([low, high]);
	}
	return intervals;
}

export function paperPathOverlap(
	branch: readonly [PaperPoint, PaperPoint][],
	other: readonly [PaperPoint, PaperPoint][],
	radius: number
): number {
	let total = 0;
	for (const [a, b] of branch) {
		const intervals = other
			.flatMap(([c, d]) => bandIntervals(a, b, c, d, radius))
			.sort((left, right) => left[0] - right[0]);
		let start = 0;
		let end = 0;
		let covered = 0;
		for (const [nextStart, nextEnd] of intervals) {
			if (nextStart > end) {
				covered += end - start;
				start = nextStart;
				end = nextEnd;
			} else end = Math.max(end, nextEnd);
		}
		covered += end - start;
		total += covered * Math.hypot(b.x - a.x, b.y - a.y);
	}
	return total;
}

// Shared paths may overlap within the first 16 px of a station departure.
export function outsideStations(
	points: readonly PaperPoint[],
	shared: readonly PaperPoint[]
): [PaperPoint, PaperPoint][] {
	let segments: [PaperPoint, PaperPoint][] = points.slice(1).map((point, i) => [points[i], point]);
	for (const center of shared) {
		segments = segments.flatMap(([a, b]) => {
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const lengthSquared = dx * dx + dy * dy;
			if (!lengthSquared) return [];
			const x = a.x - center.x;
			const y = a.y - center.y;
			const dot = x * dx + y * dy;
			const discriminant = dot * dot - lengthSquared * (x * x + y * y - 16 * 16);
			if (discriminant <= 0) return [[a, b]];
			const low = Math.max(0, (-dot - Math.sqrt(discriminant)) / lengthSquared);
			const high = Math.min(1, (-dot + Math.sqrt(discriminant)) / lengthSquared);
			if (low >= high) return [[a, b]];
			const at = (t: number) => ({ x: a.x + t * dx, y: a.y + t * dy });
			const outside: [PaperPoint, PaperPoint][] = [];
			if (low > 0) outside.push([a, at(low)]);
			if (high < 1) outside.push([at(high), b]);
			return outside;
		});
	}
	return segments;
}
