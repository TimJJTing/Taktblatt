import { describe, expect, it } from 'vitest';
import { PRINT_ROUTE_METRICS, routeTracks, SCREEN_ROUTE_METRICS } from './route-tracks.ts';
import type { EdgeGeom, EdgeRef, Pt, RouteMetrics, Track } from './types.ts';

const metrics = SCREEN_ROUTE_METRICS(600, 40);
type XY = { x: number; y: number };

function track(
	id: string,
	row: number,
	start: number,
	end: number,
	m = metrics,
	radius = m.dotR
): Track {
	const portR = Math.min(radius, (end - start) / 2);
	return {
		id,
		center: m.top + (row + 0.5) * m.rowHeight,
		half: m.barHalf,
		span: [start, end],
		inX: start + portR,
		outX: end - portR,
		inR: portR,
		outR: portR
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

function trunkOverlaps(edges: EdgeGeom[], m = metrics) {
	const horizontal: string[][] = [];
	const vertical: string[][] = [];
	for (const [i, first] of edges.entries()) {
		for (const second of edges.slice(i + 1)) {
			if (first.trunk === second.trunk) continue;
			const a = points(first, m);
			const b = points(second, m);
			for (const runA of segments(a).slice(1, 3)) {
				for (const runB of segments(b).slice(1, 3)) {
					if (
						runA.dy === 0 &&
						runB.dy === 0 &&
						runA.a.y === runB.a.y &&
						Math.max(Math.min(runA.a.x, runA.b.x), Math.min(runB.a.x, runB.b.x)) <
							Math.min(Math.max(runA.a.x, runA.b.x), Math.max(runB.a.x, runB.b.x))
					)
						horizontal.push([first.key, second.key]);
				}
			}
			if (
				a[1].x === b[1].x &&
				Math.max(Math.min(a[1].y, a[2].y), Math.min(b[1].y, b[2].y)) <
					Math.min(Math.max(a[1].y, a[2].y), Math.max(b[1].y, b[2].y))
			)
				vertical.push([first.key, second.key]);
		}
	}
	return { horizontal, vertical };
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

function incoming(count: number, m = metrics) {
	const tracks = [track('target', 7, 420, 490, m)];
	const edges: EdgeRef[] = [];
	for (let i = 0; i < count; i++) {
		tracks.push(track(`s${i}`, i, 20 + i * 70, 70 + i * 70, m));
		// Distinct complete target sets keep these incoming routes in separate trunks.
		tracks.push(track(`aux${i}`, 12 + i, 500, 570, m));
		edges.push(edge(`s${i}`, 'target'));
		edges.push(edge(`s${i}`, `aux${i}`));
	}
	return { tracks, edges };
}

function fanOut(m = metrics) {
	return {
		tracks: [
			track('source', 0, 20, 100, m),
			track('first', 3, 300, 370, m),
			track('last', 7, 400, 470, m)
		],
		edges: [edge('source', 'first'), edge('source', 'last')]
	};
}

function join(m = metrics) {
	return {
		tracks: [
			{ ...track('a', 0, 20, 100, m), span: null },
			{ ...track('b', 2, 20, 100, m), span: null },
			track('target', 7, 400, 470, m)
		],
		edges: [edge('a', 'target'), edge('b', 'target')]
	};
}

function clampedSource(m = metrics) {
	const end = m.width - (m.slots - 1) * m.pitch + m.dotR + 4;
	return {
		tracks: [track('source', 0, 510, end, m), track('target', 4, 300, 370, m)],
		edges: [edge('source', 'target')]
	};
}

function riserCrossesDiagonal(riser: EdgeGeom, approach: EdgeGeom, m: RouteMetrics) {
	const [, a, b] = points(riser, m);
	const diagonal = segments(points(approach, m)).find(({ dx, dy }) => dx !== 0 && dy !== 0)!;
	expect(diagonal).toBeDefined();
	const fraction = (a.x - diagonal.a.x) / diagonal.dx;
	const y = diagonal.a.y + fraction * diagonal.dy;
	return fraction > 0 && fraction < 1 && y > Math.min(a.y, b.y) && y < Math.max(a.y, b.y);
}

describe('routeTracks (Appendix A)', () => {
	it('reserves a shared boundary by its physical y position from both directions', () => {
		const tracks = [
			track('a', 0, 20, 100),
			track('b', 1, 80, 150),
			track('c', 7, 20, 100),
			track('d', 8, 80, 150),
			track('lower-a', 4, 400, 470),
			track('lower-b', 4, 400, 470),
			track('upper-c', 3, 300, 370),
			track('upper-d', 3, 300, 370)
		];
		const edges = [
			edge('a', 'lower-a'),
			edge('b', 'lower-b'),
			edge('c', 'upper-c'),
			edge('d', 'upper-d')
		];
		const result = routed(tracks, edges);
		const collisions = trunkOverlaps(result.edges).horizontal;
		expect(collisions.length).toBeGreaterThan(0);
		for (const pair of collisions) {
			expect(result.debug.some((d) => pair.includes(d.key) && d.overflow)).toBe(true);
		}
		expect(routed([...tracks].reverse(), [...edges].reverse())).toEqual(result);
		for (const e of result.edges) expect(e.points).toHaveLength(6);
	});

	it('reserves a lane for a short same-row backward hook', () => {
		const result = routed(
			[
				track('short', 4, 70, 103),
				track('long', 6, 110, 143),
				track('short-target', 4, 94, 160),
				track('long-target', 4, 94, 160)
			],
			[edge('short', 'short-target'), edge('long', 'long-target')]
		);
		expect(trunkOverlaps(result.edges).horizontal).toEqual([]);
		expect(result.debug.find((d) => d.key === 'short->short-target')).toMatchObject({
			variant: 'hook',
			lane: 0,
			overflow: false
		});
	});

	it('reserves the full drawn hook extent and the union of mixed-source branch runs', () => {
		const full = routed(
			[
				track('right', 0, 150, 200),
				track('left', 1, 40, 97),
				track('right-target', 4, 100, 170),
				track('left-target', 4, 77, 140)
			],
			[edge('right', 'right-target'), edge('left', 'left-target')]
		);
		expect.soft(trunkOverlaps(full.edges).horizontal).toEqual([]);
		const mixed = routed(
			[
				track('same-row', 4, 70, 108),
				track('below', 6, 70, 103),
				track('other', 7, 50, 97),
				track('mixed-target', 4, 100, 170),
				track('other-target', 4, 80, 140)
			],
			[
				edge('same-row', 'mixed-target'),
				edge('below', 'mixed-target'),
				edge('other', 'other-target')
			]
		);
		expect(trunkOverlaps(mixed.edges).horizontal).toEqual([]);
		expect(mixed.debug.find((d) => d.key === 'same-row->mixed-target')).toMatchObject({
			variant: 'hook',
			lane: 0,
			overflow: false
		});
		expect(mixed.debug.find((d) => d.key === 'below->mixed-target')!.variant).toBe('direct');
	});

	it('does not reserve a gutter lane for a straight same-row forward edge', () => {
		const result = routed(
			[
				track('straight', 4, 20, 100),
				track('a', 6, 150, 200),
				track('b', 7, 250, 300),
				track('straight-target', 4, 400, 470),
				track('a-target', 4, 400, 470),
				track('b-target', 4, 400, 470)
			],
			[edge('straight', 'straight-target'), edge('a', 'a-target'), edge('b', 'b-target')]
		);
		expect(result.debug.filter((d) => d.overflow)).toEqual([]);
		expect(trunkOverlaps(result.edges).horizontal).toEqual([]);
		expect(result.debug.find((d) => d.key === 'straight->straight-target')).toMatchObject({
			variant: 'direct',
			lane: 0,
			overflow: false
		});
	});

	it('reports lane zero when a boundary candidate becomes a direct route', () => {
		for (const delta of [18, -12]) {
			const target = track('short-target', 4, 420, 490);
			const tracks = [
				track('long', 0, 20, delta > 0 ? 70 : 500),
				track('short', 1, 350, 420 - delta),
				target,
				track('long-target', 4, 420, 490)
			];
			const edges = [edge('long', 'long-target'), edge('short', 'short-target')];
			const result = routed(tracks, edges);
			expect.soft(result.debug.find((d) => d.key === 'short->short-target')).toMatchObject({
				variant: 'direct',
				lane: 0,
				overflow: false
			});
			const ps = points(result.edges.find((e) => e.from === 'short')!);
			expect(ps).toHaveLength(6);
			expect(ps[2]).toEqual({ x: target.inX - delta, y: target.center - Math.abs(delta) });
			expect(ps.slice(2, 5)).toEqual([ps[2], ps[2], ps[2]]);
			expect(routed([...tracks].reverse(), [...edges].reverse())).toEqual(result);
		}
	});

	it('keeps different trunk risers apart when both source bars end at the right edge', () => {
		const result = routed(
			[
				track('a', 0, 530, 600),
				track('b', 1, 530, 600),
				track('a-target', 5, 300, 370),
				track('b-target', 6, 400, 470)
			],
			[edge('a', 'a-target'), edge('b', 'b-target')]
		);
		for (const e of result.edges) validGeometry(e);
		expect(trunkOverlaps(result.edges).vertical).toEqual([]);
		const xs = result.edges.map((e) => points(e)[1].x);
		expect(Math.abs(xs[0] - xs[1])).toBeGreaterThanOrEqual(metrics.pitch);
		for (const e of result.edges) {
			expect(e.points).toHaveLength(6);
			for (const p of points(e)) expect(p.x).toBeLessThanOrEqual(metrics.width);
		}
	});

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
			expect(Math.abs(run[0].a.y - t.center)).toBeGreaterThanOrEqual(t.half + 8);
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

	it('10: gives three overlapping runs distinct lanes without overflow', () => {
		const { tracks, edges } = incoming(3);
		const result = routed(tracks, edges);
		const mainIncoming = result.debug.filter((d) => d.key.endsWith('->target'));
		expect(mainIncoming.filter((d) => d.overflow)).toEqual([]);
		expect(mainIncoming.map((d) => d.lane)).toEqual([0, 1, 2]);
		const runs = result.edges.filter((e) => e.to === 'target').map((e) => points(e)[2].y);
		expect(new Set(runs).size).toBe(3);
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

describe('routeTracks (slice 3a)', () => {
	it.each([
		['screen', SCREEN_ROUTE_METRICS, 3],
		['paper', PRINT_ROUTE_METRICS, 2]
	] as const)(
		'AC1: applies the default %s junction radius to port clearance',
		(_name, factory, ringR) => {
			const m = { ...factory(600, 40), slots: 1 };
			const { tracks, edges } = fanOut(m);
			const branch = resolve(routed(tracks, edges, m).junctions[0].point, m);
			const probe: Track = {
				...track('probe', 1, 500, 570, m, 1),
				center: branch.y,
				span: null,
				inX: branch.x + 1 + ringR + 2 - 0.5
			};
			expect(routed([...tracks, probe], edges, m).junctions).toHaveLength(0);
			probe.inX += 0.5;
			expect(routed([...tracks, probe], edges, m).junctions).toHaveLength(1);
		}
	);

	it.each([
		['parent', 4],
		['subtask', 3],
		['point', 5],
		['shrunk', 1],
		['clipped', 0]
	] as const)(
		'R1: suppresses ordinary junctions inside actual %s port clearance',
		(_name, radius) => {
			const m = { ...metrics, slots: 1 };
			const { tracks, edges } = fanOut(m);
			const base = routed(tracks, edges, m);
			expect(base.junctions).toHaveLength(1);
			const branch = resolve(base.junctions[0].point, m);
			// Probe each port separately. A null span cannot change the slot's obstacle cost.
			for (const port of ['inX', 'outX'] as const) {
				for (const margin of [-0.5, 0, 0.5]) {
					const probe: Track = {
						...track('probe', 1, 500, 570, m, radius),
						center: branch.y,
						span: null,
						[port]: branch.x + radius + m.ringR + 2 + margin
					};
					const result = routed([...tracks, probe], edges, m);
					const ordinary = result.junctions.filter((j) => j.kind !== 'tap');
					expect
						.soft(ordinary, `${port}, clearance margin ${margin}`)
						.toHaveLength(margin < 0 ? 0 : 1);
					if (margin >= 0) expect(ordinary.map((j) => resolve(j.point, m))).toContainEqual(branch);
				}
			}
		}
	);

	it('R1: checks radial clearance to ports in neighboring rows', () => {
		const m = { ...metrics, slots: 1 };
		const { tracks, edges } = fanOut(m);
		const branch = resolve(routed(tracks, edges, m).junctions[0].point, m);
		const probe: Track = {
			...track('probe', 1, 500, 570, m, 4),
			span: null,
			inX: branch.x + 6,
			center: branch.y + 6
		};
		expect(routed([...tracks, probe], edges, m).junctions).toHaveLength(0);
		probe.center += 1;
		expect(routed([...tracks, probe], edges, m).junctions).toHaveLength(1);
	});

	it('R1: uses the supplied ring radius when suppressing an ordinary junction', () => {
		const { tracks, edges } = fanOut();
		const base = routed(tracks, edges);
		const branch = resolve(base.junctions[0].point);
		const probe: Track = {
			...track('probe', 1, 500, 570, metrics, 1),
			center: branch.y,
			span: null,
			inX: branch.x + 9
		};
		const small = routed([...tracks, probe], edges, { ...metrics, ringR: 3 });
		const large = routed([...tracks, probe], edges, { ...metrics, ringR: 8 });
		expect(small.junctions).toHaveLength(1);
		expect(large.junctions).toHaveLength(0);
	});

	it('R1: starts a shared source-row junction at slot one or higher', () => {
		const { tracks, edges } = join();
		const result = routed(tracks, edges, { ...metrics, ringR: 3 });
		expect(result.junctions).toHaveLength(1);
		for (const debug of result.debug) expect(debug.slot).toBeGreaterThanOrEqual(1);
		for (const junction of result.junctions) {
			const p = resolve(junction.point);
			for (const t of tracks) {
				for (const [x, r] of [
					[t.inX, t.inR],
					[t.outX, t.outR]
				]) {
					expect(Math.hypot(p.x - x, p.y - t.center)).toBeGreaterThanOrEqual(r + 3 + 2);
				}
			}
		}
	});

	it('R1: identifies every preserved continuing-branch ring as an ordinary junction', () => {
		const { tracks, edges } = fanOut();
		tracks.push(track('middle', 5, 350, 420));
		edges.push(edge('source', 'middle'));
		const result = routed(tracks, edges, { ...metrics, ringR: 3 });
		expect(result.junctions).toHaveLength(2);
		for (const target of ['first', 'middle']) {
			const branch = points(result.edges.find((e) => e.to === target)!)[2];
			const rings = result.junctions.filter((j) => {
				const p = resolve(j.point);
				return p.x === branch.x && p.y === branch.y;
			});
			expect(rings).toHaveLength(1);
			expect(rings[0].kind).toBe('junction');
			expect(rings[0].source).toBeUndefined();
		}
	});

	it.each(['join', 'branch'] as const)(
		'AC1: preserves an ordinary %s key when its row moves',
		(kind) => {
			const { tracks, edges } = kind === 'join' ? join() : fanOut();
			const movedId = kind === 'join' ? 'b' : 'first';
			const before = routed(tracks, edges, { ...metrics, ringR: 3 });
			const after = routed(
				tracks.map((t) => (t.id === movedId ? { ...t, center: t.center + metrics.rowHeight } : t)),
				edges,
				{ ...metrics, ringR: 3 }
			);
			expect(before.junctions).toHaveLength(1);
			expect(after.junctions).toHaveLength(1);
			expect(resolve(after.junctions[0].point).y).not.toBe(resolve(before.junctions[0].point).y);
			expect(after.junctions[0].key).toBe(before.junctions[0].key);
		}
	);

	it('AC1: preserves a branch junction key when another trunk member moves', () => {
		const m = SCREEN_ROUTE_METRICS(600, 10);
		const tracks = [
			track('a', 0, 7, 103, m, 3),
			track('b', 2, 7, 103, m, 3),
			track('x', 3, 135, 203, m, 3),
			track('z', 8, 397, 473, m, 3)
		];
		const edges = [edge('a', 'x'), edge('a', 'z'), edge('b', 'x'), edge('b', 'z')];
		const before = routed(tracks, edges, m);
		const after = routed(
			tracks.map((t) => (t.id === 'b' ? { ...t, center: m.top + 4.5 * m.rowHeight } : t)),
			edges,
			m
		);
		expect(after.edges.find((e) => e.key === 'a->x')).toEqual(
			before.edges.find((e) => e.key === 'a->x')
		);
		const beforeRing = before.junctions.find((j) => resolve(j.point, m).y === 116)!;
		const afterRing = after.junctions.find((j) => resolve(j.point, m).y === 116)!;
		expect(resolve(beforeRing.point, m)).toEqual({ x: 110, y: 116 });
		expect(resolve(afterRing.point, m)).toEqual({ x: 110, y: 116 });
		expect(afterRing.key).toBe(beforeRing.key);
	});

	it('AC1: keeps junction keys unique for mixed straight and direct entries', () => {
		const m = SCREEN_ROUTE_METRICS(600, 12);
		const tracks: Track[] = [
			track('above', 0, 7, 103, m, 3),
			track('same', 4, 7, 103, m, 3),
			track('below', 6, 7, 103, m, 3),
			track('target', 4, 117, 153, m, 3),
			track('far', 10, 397, 473, m, 3)
		].map((t) => ({ ...t, span: null }));
		tracks.push(track('obstacle', 2, 122, 134, m, 3));
		const edges = ['above', 'same', 'below'].flatMap((source) => [
			edge(source, 'target'),
			edge(source, 'far')
		]);
		const result = routed(tracks, edges, m);
		const ringPoints = result.junctions.map((j) => resolve(j.point, m));
		expect(ringPoints).toContainEqual({ x: 110, y: 154 });
		expect(ringPoints).toContainEqual({ x: 110, y: 164 });
		expect(new Set(result.junctions.map((j) => j.key)).size).toBe(result.junctions.length);
	});

	it('R2: overflows only the fourth overlapping run onto the near lane', () => {
		const { tracks, edges } = incoming(4);
		const result = routed(tracks, edges);
		const main = result.debug.filter((d) => d.key.endsWith('->target'));
		expect(main.filter((d) => d.overflow).map((d) => d.key)).toEqual(['s3->target']);
		expect(main.find((d) => d.overflow)!.lane).toBe(0);
		const target = tracks.find((t) => t.id === 'target')!;
		const overflow = result.edges.find((e) => e.key === 's3->target')!;
		expect(points(overflow)[2].y).toBe(target.center - 10);
	});

	it('D29: prioritizes parallel conflicts over accumulated approach hits', () => {
		const m = SCREEN_ROUTE_METRICS(600, 32);
		const tracks = [
			track('long', 0, 85, 105, m, 5),
			track('far', 30, 495, 515, m, 5),
			track('fixed', 2, 109, 129, m, 5),
			track('fixed-target', 3, 395, 415, m, 5),
			track('feeder', 4, 15, 35, m, 5),
			...Array.from({ length: 11 }, (_, i) => track(`approach${i}`, i + 5, 123, 143, m, 5))
		].map((t) => ({ ...t, span: null }));
		const edges = [
			edge('long', 'far'),
			edge('fixed', 'fixed-target'),
			...Array.from({ length: 11 }, (_, i) => edge('feeder', `approach${i}`))
		];
		const result = routed(tracks, edges, m);
		const main = result.edges.filter((e) => e.from === 'long' || e.from === 'fixed');
		expect(
			points(
				main.find((e) => e.from === 'fixed')!,
				m
			)[1].x
		).toBe(130);
		expect(
			points(
				main.find((e) => e.from === 'long')!,
				m
			)[1].x
		).toBe(106);
		expect(trunkOverlaps(main, m).vertical).toEqual([]);
		for (const e of main) {
			expect(result.debug.find((d) => d.key === e.key)!.overflow).toBe(false);
		}
	});

	it.each([
		['screen', SCREEN_ROUTE_METRICS, 18, 6],
		['paper', PRINT_ROUTE_METRICS, 12, 3.5]
	] as const)(
		'R2: uses the %s far lane inside the neighboring row band with bar clearance',
		(_name, factory, distance, clearance) => {
			const m = factory(600, 40);
			const { tracks, edges } = incoming(3, m);
			const neighbor = track('neighbor', 6, 0, 600, m);
			const result = routed([...tracks, neighbor], edges, m);
			const target = tracks.find((t) => t.id === 'target')!;
			const far = result.edges.find((e) => e.key === 's2->target')!;
			const laneY = points(far, m)[2].y;
			expect(target.center - laneY).toBe(distance);
			expect(Math.abs(laneY - neighbor.center)).toBeLessThan(m.rowHeight / 2);
			expect(Math.abs(laneY - neighbor.center) - neighbor.half).toBe(clearance);
			expect(clearance).toBeGreaterThanOrEqual(m.clearance);
			expect(result.debug.filter((d) => d.overflow)).toEqual([]);
		}
	);

	it.each([
		['screen', SCREEN_ROUTE_METRICS, 14, 8],
		['paper', PRINT_ROUTE_METRICS, 9, 5]
	] as const)(
		'R3: takes the free %s boundary lane for a hook',
		(_name, factory, distance, extra) => {
			const m = factory(600, 8);
			const tracks = [
				track('source', 0, 250, 330, m),
				track('neighbor', 2, 0, 500, m),
				track('target', 3, 60, 150, m)
			];
			const result = routed(tracks, [edge('source', 'target')], m);
			const laneY = points(result.edges[0], m)[2].y;
			expect(tracks[2].center - laneY).toBe(distance);
			expect(result.debug[0]).toMatchObject({ variant: 'hook', lane: 1, overflow: false });
			for (const t of tracks)
				expect(Math.abs(laneY - t.center)).toBeGreaterThanOrEqual(t.half + extra);
		}
	);

	it.each([
		['screen', SCREEN_ROUTE_METRICS, 108],
		['paper', PRINT_ROUTE_METRICS, 106]
	] as const)(
		'R4: avoids a %s incoming diagonal when another slot is free',
		(_name, factory, inX) => {
			const m = factory(600, 10);
			const tracks = [
				track('long', 0, 20, 100, m),
				track('short', 1, 20, 63, m),
				track('far', 7, 400, 470, m),
				{ ...track('approach', 3, inX, inX + 10, m, 5), span: null, inX }
			];
			const edges = [edge('long', 'far'), edge('short', 'approach')];
			const control = routed(tracks, [edges[0]], m);
			expect(control.debug[0].slot).toBe(0);
			const result = routed(tracks, edges, m);
			const long = result.edges.find((e) => e.from === 'long')!;
			const approach = result.edges.find((e) => e.to === 'approach')!;
			expect(riserCrossesDiagonal(long, approach, m)).toBe(false);
			const x = points(long, m)[1].x;
			const farDistance = m.rowHeight / 2 + m.pitch;
			expect(x < inX - farDistance - m.pitch || x > inX).toBe(true);
			expect(result.debug.find((d) => d.key === 'long->far')!.slot).toBeGreaterThan(0);
			expect(routed([...tracks].reverse(), [...edges].reverse(), m)).toEqual(result);
		}
	);

	it.each([
		['screen', SCREEN_ROUTE_METRICS],
		['paper', PRINT_ROUTE_METRICS]
	] as const)(
		'R2/R3: reserves all three %s lanes across opposite target sides',
		(_name, factory) => {
			const m = factory(600, 12);
			const tracks = [
				track('a', 0, 20, 100, m),
				track('b', 1, 50, 130, m),
				track('c', 2, 80, 160, m),
				track('d', 8, 150, 220, m),
				track('lower-a', 4, 400, 470, m),
				track('lower-b', 4, 400, 470, m),
				track('lower-c', 4, 400, 470, m),
				track('upper-d', 3, 300, 370, m)
			];
			const edges = [
				edge('a', 'lower-a'),
				edge('b', 'lower-b'),
				edge('c', 'lower-c'),
				edge('d', 'upper-d')
			];
			const result = routed(tracks, edges, m);
			expect(result.debug.filter((d) => d.overflow).map((d) => d.key)).toEqual(['d->upper-d']);
			expect(result.debug.map((d) => d.lane)).toEqual([0, 1, 2, 0]);
			const lowerYs = result.edges
				.filter((e) => e.to.startsWith('lower'))
				.map((e) => points(e, m)[2].y);
			expect(new Set(lowerYs).size).toBe(3);
			const upperY = points(
				result.edges.find((e) => e.to === 'upper-d')!,
				m
			)[2].y;
			expect(upperY).toBe(lowerYs[2]);
			const collisions = trunkOverlaps(result.edges, m).horizontal;
			expect(collisions).toHaveLength(1);
			for (const pair of collisions) expect(pair).toContain('d->upper-d');
			expect(routed([...tracks].reverse(), [...edges].reverse(), m)).toEqual(result);
		}
	);

	it.each([
		['screen', SCREEN_ROUTE_METRICS],
		['paper', PRINT_ROUTE_METRICS]
	] as const)(
		'R6: returns a %s source-row tap even inside ordinary port clearance',
		(_name, factory) => {
			const m = factory(600, 8);
			const { tracks, edges } = clampedSource(m);
			const result = routed(tracks, edges, m);
			const source = tracks[0];
			const x = points(result.edges[0], m)[1].x;
			expect(x).toBeLessThan(source.outX);
			expect(source.outX - x).toBeLessThan(source.outR + m.ringR + 2);
			const taps = result.junctions.filter((j) => j.kind === 'tap');
			expect(taps).toHaveLength(1);
			expect(resolve(taps[0].point, m)).toEqual({ x, y: source.center });
			expect(taps[0]).toMatchObject({
				kind: 'tap',
				source: source.id,
				trunk: result.edges[0].trunk
			});
		}
	);

	it('R6: keeps the tap key when its source row moves', () => {
		const { tracks, edges } = clampedSource();
		const before = routed(tracks, edges);
		const after = routed(
			tracks.map((t) => (t.id === 'source' ? { ...t, center: t.center + metrics.rowHeight } : t)),
			edges
		);
		const tapsBefore = before.junctions.filter((j) => j.kind === 'tap');
		const tapsAfter = after.junctions.filter((j) => j.kind === 'tap');
		expect(tapsBefore).toHaveLength(1);
		expect(tapsAfter).toHaveLength(1);
		expect(resolve(tapsAfter[0].point).y - resolve(tapsBefore[0].point).y).toBe(metrics.rowHeight);
		expect(tapsAfter[0].key).toBe(tapsBefore[0].key);
		expect(tapsBefore[0].source).toBe('source');
		expect(tapsAfter[0].source).toBe('source');
		expect(routed([...tracks].reverse(), [...edges].reverse())).toEqual(before);
	});

	it('R6: associates each bundled tap with its own source identity', () => {
		const { tracks, edges } = clampedSource();
		tracks[0] = { ...track('source', 0, 510, 600), outX: 600, outR: 0 };
		const second = {
			...tracks[0],
			id: 'second-source',
			center: tracks[0].center + metrics.rowHeight
		};
		tracks.push(second);
		edges.push(edge(second.id, 'target'));
		tracks.push(track('last', 7, 400, 470));
		edges.push(edge('source', 'last'), edge(second.id, 'last'));
		const result = routed(tracks, edges);
		const taps = result.junctions.filter((j) => j.kind === 'tap');
		expect(taps).toHaveLength(2);
		expect(new Set(taps.map((j) => j.key)).size).toBe(2);
		for (const source of [tracks[0], second]) {
			const owned = taps.filter((j) => j.source === source.id);
			expect(owned).toHaveLength(1);
			const route = result.edges.find((e) => e.from === source.id)!;
			expect(owned[0].trunk).toBe(route.trunk);
			expect(resolve(owned[0].point)).toEqual(points(route)[1]);
		}
	});

	it('R6: emits taps only when the riser is strictly left of the source out port', () => {
		const { tracks, edges } = clampedSource();
		const clamped = routed(tracks, edges);
		const x = points(clamped.edges[0])[1].x;
		expect(clamped.junctions.filter((j) => j.kind === 'tap')).toHaveLength(1);
		for (const outX of [x, x - 1]) {
			const result = routed(
				tracks.map((t) => (t.id === 'source' ? { ...t, outX } : t)),
				edges
			);
			expect(points(result.edges[0])[1].x).toBeGreaterThanOrEqual(outX);
			expect(result.junctions.filter((j) => j.kind === 'tap')).toEqual([]);
		}
	});

	it('AC7: routes 300 tracks and 400 edges with repeatable geometry and reports timing', () => {
		const m = SCREEN_ROUTE_METRICS(1200, 300);
		const tracks = Array.from({ length: 300 }, (_, i) =>
			track(`task-${i}`, i, 20 + (i % 10) * 80, 70 + (i % 10) * 80, m)
		);
		const edges = Array.from({ length: 400 }, (_, i) =>
			edge(`task-${i % 200}`, `task-${200 + ((i + Math.floor(i / 200)) % 100)}`)
		);
		const before = structuredClone({ tracks, edges });
		// Warm the router before sampling. Timing has no machine-specific pass threshold.
		for (let i = 0; i < 3; i++) routed(tracks, edges, m);
		const expected = routed(tracks, edges, m);
		const timings = Array.from({ length: 15 }, () => {
			const start = performance.now();
			const result = routed(tracks, edges, m);
			const elapsed = performance.now() - start;
			expect(result).toEqual(expected);
			return elapsed;
		}).sort((a, b) => a - b);
		console.info(
			`routeTracks 300 tracks/400 edges: median=${timings[7].toFixed(3)}ms p95=${timings[14].toFixed(3)}ms (15 samples)`
		);
		expect(expected.edges).toHaveLength(400);
		expect(expected.debug).toHaveLength(400);
		expect(new Set(expected.edges.map((e) => e.key)).size).toBe(400);
		expect(routed([...tracks].reverse(), [...edges].reverse(), m)).toEqual(expected);
		for (const e of expected.edges) {
			expect(e.points).toHaveLength(6);
			const source = tracks.find((t) => t.id === e.from)!;
			const target = tracks.find((t) => t.id === e.to)!;
			const ps = points(e, m);
			expect(ps[0]).toEqual({ x: source.outX, y: source.center });
			expect(ps.at(-1)).toEqual({ x: target.inX, y: target.center });
			for (const p of ps) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
		}
		expect({ tracks, edges }).toEqual(before);
	}, 60_000);
});
