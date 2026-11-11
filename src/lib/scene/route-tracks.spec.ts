import { describe, expect, it } from 'vitest';
import { PRINT_ROUTE_METRICS, routeTracks, SCREEN_ROUTE_METRICS } from './route-tracks.ts';
import type { EdgeGeom, EdgeRef, Pt, Track } from './types.ts';

const metrics = SCREEN_ROUTE_METRICS(600, 40);
type XY = { x: number; y: number };

function track(id: string, row: number, start: number, end: number, m = metrics): Track {
	return {
		id,
		center: m.top + (row + 0.5) * m.rowHeight,
		half: m.barHalf,
		span: [start, end],
		inX: start + Math.min(m.dotR, (end - start) / 2),
		outX: end - Math.min(m.dotR, (end - start) / 2)
	};
}

function edge(from: string, to: string, cycle = false): EdgeRef {
	return { key: `${from}->${to}`, from, to, cycle };
}

function resolve(p: Pt, m = metrics): XY {
	return { x: p.x.f * m.width + p.x.px, y: p.y.f * 400 + p.y.px };
}

function points(e: EdgeGeom, m = metrics): XY[] {
	return e.points.map((p) => resolve(p, m));
}

function segments(ps: XY[]) {
	return ps.slice(1).map((b, i) => ({ a: ps[i], b, dx: b.x - ps[i].x, dy: b.y - ps[i].y }));
}

function validGeometry(e: EdgeGeom, m = metrics) {
	expect(e.points).toHaveLength(6);
	const nonzero = segments(points(e, m)).filter(({ dx, dy }) => dx !== 0 || dy !== 0);
	for (const [i, s] of nonzero.entries()) {
		expect(Number.isFinite(s.dx) && Number.isFinite(s.dy)).toBe(true);
		expect(s.dx === 0 || s.dy === 0 || Math.abs(s.dx) === Math.abs(s.dy)).toBe(true);
		expect(Math.hypot(s.dx, s.dy)).toBeGreaterThanOrEqual(m.minSeg);
		if (s.dx !== 0 && s.dy !== 0) expect(i).toBe(nonzero.length - 1);
		const next = nonzero[i + 1];
		if (next) expect(s.dx * next.dx + s.dy * next.dy).toBeGreaterThanOrEqual(0);
	}
}

function routed(tracks: Track[], edges: EdgeRef[], m = metrics) {
	return routeTracks(tracks, edges, m);
}

function incoming(count: number) {
	const tracks = [track('target', 7, 420, 490)];
	const edges: EdgeRef[] = [];
	for (let i = 0; i < count; i++) {
		tracks.push(track(`s${i}`, i, 20 + i * 70, 70 + i * 70));
		// Distinct complete target sets keep these incoming routes in separate trunks.
		tracks.push(track(`aux${i}`, 12 + i, 500, 570));
		edges.push(edge(`s${i}`, 'target'));
		edges.push(edge(`s${i}`, `aux${i}`));
	}
	return { tracks, edges };
}

describe('routeTracks (Appendix A)', () => {
	it('keeps same-row routes inside the body with exact ports and legal bends', () => {
		const m = SCREEN_ROUTE_METRICS(600, 2);
		const tracks = [track('a', 0, 20, 103, m), track('b', 0, 118, 180, m)];
		const result = routed(tracks, [edge('a', 'b'), edge('b', 'a')], m);
		for (const e of result.edges) {
			const source = tracks.find((t) => t.id === e.from)!;
			const target = tracks.find((t) => t.id === e.to)!;
			const ps = points(e, m);
			expect(ps[0]).toEqual({ x: source.outX, y: source.center });
			expect(ps.at(-1)).toEqual({ x: target.inX, y: target.center });
			for (const p of ps) {
				expect(p.y).toBeGreaterThanOrEqual(m.top);
				expect(p.y).toBeLessThanOrEqual(m.top + m.rows * m.rowHeight);
			}
			validGeometry(e, m);
		}
	});

	it('keeps a backward route to a clipped left port inside the chart', () => {
		const m = SCREEN_ROUTE_METRICS(600, 2);
		const source = track('a', 0, 250, 330, m);
		const target = { ...track('b', 1, 0, 80, m), inX: 0 };
		const result = routed([source, target], [edge('a', 'b')], m);
		const e = result.edges[0];
		const ps = points(e, m);
		expect(ps[0]).toEqual({ x: source.outX, y: source.center });
		expect(ps.at(-1)).toEqual({ x: target.inX, y: target.center });
		for (const p of ps) {
			expect(p.x).toBeGreaterThanOrEqual(0);
			expect(p.x).toBeLessThanOrEqual(m.width);
		}
		validGeometry(e, m);
	});

	it('1: routes a finish-to-start chain directly between its aligned ports', () => {
		const result = routed([track('a', 0, 20, 100), track('b', 2, 100, 180)], [edge('a', 'b')]);
		expect(result.debug[0].variant).toBe('direct');
		const ps = points(result.edges[0]);
		expect(ps[0]).toEqual({ x: 97, y: metrics.top + 0.5 * metrics.rowHeight });
		expect(ps.at(-1)).toEqual({ x: 103, y: metrics.top + 2.5 * metrics.rowHeight });
		const last = segments(ps)
			.filter(({ dx, dy }) => dx !== 0 || dy !== 0)
			.at(-1)!;
		expect(last.dx).toBe(0);
		expect(last.dy).toBeGreaterThan(0);
	});

	it('2: routes a far target forward and enters at exactly 45 degrees', () => {
		const result = routed([track('a', 0, 20, 100), track('b', 3, 300, 390)], [edge('a', 'b')]);
		expect(result.debug[0].variant).toBe('forward');
		const last = segments(points(result.edges[0]))
			.filter(({ dx, dy }) => dx !== 0 || dy !== 0)
			.at(-1)!;
		expect(Math.abs(last.dx)).toBeGreaterThan(0);
		expect(Math.abs(last.dx)).toBe(Math.abs(last.dy));
	});

	it('3: puts the backward hook run in a gutter, clear of intervening bars', () => {
		const tracks = [track('a', 0, 250, 330), track('middle', 1, 30, 380), track('b', 3, 60, 150)];
		const result = routed(tracks, [edge('a', 'b')]);
		expect(result.debug[0].variant).toBe('hook');
		// The port stubs must touch their rows. Check the interior lane run.
		const run = segments(points(result.edges[0]))
			.slice(1, -1)
			.filter(({ dx, dy }) => dx !== 0 && dy === 0);
		expect(run).toHaveLength(1);
		for (const t of tracks)
			expect(Math.abs(run[0].a.y - t.center)).toBeGreaterThanOrEqual(t.half + 3);
		validGeometry(result.edges[0]);
	});

	it('4: keeps six tween points, legal bends and minimum nonzero segment lengths', () => {
		const tracks = [track('a', 0, 20, 100), track('b', 3, 300, 380), track('c', 6, 100, 180)];
		const result = routed(tracks, [edge('a', 'b'), edge('a', 'c'), edge('b', 'c')]);
		expect(result.edges).toHaveLength(3);
		for (const e of result.edges) validGeometry(e);
	});

	it('5: separates same-day sources with different targets into different risers', () => {
		const tracks = [
			track('a', 0, 20, 100),
			track('b', 1, 20, 100),
			track('c', 5, 300, 360),
			track('d', 6, 380, 450)
		];
		const result = routed(tracks, [edge('a', 'c'), edge('b', 'd')]);
		expect(new Set(result.debug.map((d) => d.slot)).size).toBe(2);
		const risers = result.edges.map((e) => points(e)[1].x);
		expect(risers[0]).not.toBe(risers[1]);
	});

	it('6: bundles identical target sets with a join ring but separates partly shared targets', () => {
		const tracks = [
			track('a', 0, 20, 100),
			track('b', 1, 20, 100),
			track('c', 5, 300, 360),
			track('d', 7, 380, 450)
		];
		const same = routed(tracks, [edge('a', 'c'), edge('b', 'c')]);
		expect(same.edges[0].trunk).toBe(same.edges[1].trunk);
		expect(same.junctions).toHaveLength(1);
		expect(resolve(same.junctions[0].point)).toEqual(
			points(same.edges.find((e) => e.from === 'b')!)[1]
		);
		const partial = routed(tracks, [edge('a', 'c'), edge('a', 'd'), edge('b', 'c')]);
		expect(partial.edges.find((e) => e.from === 'a')!.trunk).not.toBe(
			partial.edges.find((e) => e.from === 'b')!.trunk
		);
	});

	it('7: shares one fan-out riser and marks each continuing branch with one ring', () => {
		const tracks = [
			track('a', 0, 20, 100),
			track('b', 2, 300, 360),
			track('c', 4, 300, 360),
			track('d', 6, 300, 360)
		];
		const result = routed(tracks, [edge('a', 'b'), edge('a', 'c'), edge('a', 'd')]);
		expect(new Set(result.edges.map((e) => e.trunk)).size).toBe(1);
		expect(new Set(result.edges.map((e) => points(e)[1].x)).size).toBe(1);
		expect(result.junctions).toHaveLength(2);
		for (const to of ['b', 'c']) {
			const branch = points(result.edges.find((e) => e.to === to)!)[2];
			expect(result.junctions.map((j) => resolve(j.point))).toContainEqual(branch);
		}
	});

	it('8: avoids a bar end zone in an intervening row when another slot is free', () => {
		const source = track('a', 0, 20, 100);
		const baseRiser = source.outX + metrics.stub;
		const obstacle = track('obstacle', 2, baseRiser, 220);
		const result = routed([source, obstacle, track('b', 5, 350, 430)], [edge('a', 'b')]);
		const x = points(result.edges[0])[1].x;
		for (const end of obstacle.span!) expect(Math.abs(x - end)).toBeGreaterThanOrEqual(6);
	});

	it('9: assigns the near lane to the longer nested run without crossings', () => {
		const { tracks, edges } = incoming(2);
		const result = routed(tracks, edges);
		expect(result.debug.find((d) => d.key === 's0->target')!.lane).toBe(0);
		expect(result.debug.find((d) => d.key === 's1->target')!.lane).toBe(1);
		const [long, short] = ['s0', 's1'].map((id) =>
			points(result.edges.find((e) => e.from === id && e.to === 'target')!)
		);
		// A nested run must not cross the shorter route's vertical riser.
		const run = segments(long).find(
			({ dx, dy }) => dx !== 0 && dy === 0 && Math.abs(dx) > metrics.stub
		)!;
		const riser = segments(short).find(({ dx, dy }) => dx === 0 && dy !== 0)!;
		const crosses =
			riser.a.x > Math.min(run.a.x, run.b.x) &&
			riser.a.x < Math.max(run.a.x, run.b.x) &&
			run.a.y > Math.min(riser.a.y, riser.b.y) &&
			run.a.y < Math.max(riser.a.y, riser.b.y);
		expect(crosses).toBe(false);
	});

	it('10: flags the third overlapping run as overflow on the near lane', () => {
		const { tracks, edges } = incoming(3);
		const result = routed(tracks, edges);
		const mainIncoming = result.debug.filter((d) => d.key.endsWith('->target'));
		expect(mainIncoming.filter((d) => d.overflow).map((d) => d.key)).toEqual(['s2->target']);
		expect(mainIncoming.find((d) => d.overflow)!.lane).toBe(0);
	});

	it('11: leaves existing geometry unchanged after a distant unrelated edge is added', () => {
		const { tracks, edges } = incoming(2);
		const before = routed(tracks, edges);
		const after = routed(
			[...tracks, track('x', 20, 20, 100), track('y', 23, 300, 400)],
			[...edges, edge('x', 'y')]
		);
		const keys = new Set(edges.map((e) => e.key));
		expect(after.edges.filter((e) => keys.has(e.key))).toEqual(before.edges);
		expect(after.debug.filter((d) => keys.has(d.key))).toEqual(before.debug);
		expect(after.junctions.filter((j) => before.edges.some((e) => e.trunk === j.trunk))).toEqual(
			before.junctions
		);
	});

	it('12: returns identical sorted output for permuted inputs without mutating them', () => {
		const { tracks, edges } = incoming(3);
		const snapshot = structuredClone({ tracks, edges });
		const result = routed(tracks, edges);
		expect(routed([...tracks].reverse(), [...edges].reverse())).toEqual(result);
		expect(routed(tracks, edges)).toEqual(result);
		expect({ tracks, edges }).toEqual(snapshot);
		for (const list of [result.edges, result.junctions, result.debug]) {
			expect(list.map((item) => item.key)).toEqual(list.map((item) => item.key).sort());
		}
	});

	it('13: keeps routes below the header and preserves screen and print bar clearances', () => {
		for (const m of [metrics, PRINT_ROUTE_METRICS(600, 40)]) {
			const tracks = [
				track('a', 0, 240, 320, m),
				track('middle', 1, 30, 400, m),
				track('b', 3, 60, 150, m)
			];
			const result = routed(tracks, [edge('a', 'b')], m);
			validGeometry(result.edges[0], m);
			const ps = points(result.edges[0], m);
			for (const p of ps) {
				expect(p.y).toBeGreaterThanOrEqual(m.top);
				expect(p.y).toBeLessThanOrEqual(m.top + tracks.length * m.rowHeight + m.rowHeight);
			}
			const lane = segments(ps)
				.slice(1, -1)
				.find(({ dx, dy }) => dx !== 0 && dy === 0)!;
			for (const t of tracks)
				expect(Math.abs(lane.a.y - t.center) - t.half).toBeGreaterThanOrEqual(m.clearance);
		}
	});

	// Appendix A case 14 is in route-path.spec.ts.
	it('15: routes both directions of a two-task cycle without losing cycle metadata', () => {
		const result = routed(
			[track('a', 0, 20, 100), track('b', 4, 300, 400)],
			[edge('a', 'b', true), edge('b', 'a', true)]
		);
		expect(result.edges.map(({ key, cycle }) => ({ key, cycle }))).toEqual([
			{ key: 'a->b', cycle: true },
			{ key: 'b->a', cycle: true }
		]);
		for (const e of result.edges) validGeometry(e);
	});
});
