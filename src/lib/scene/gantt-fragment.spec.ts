import { describe, expect, it } from 'vitest';
import { createGanttPaperCache, ganttFragment, type GanttPaperLayout } from './gantt-fragment.ts';
import { ganttScene } from './gantt-scene.ts';
import { PRINT_ROUTE_METRICS } from './route-tracks.ts';
import type { DependencyLine, GanttRow } from '#lib/domain/gantt.ts';
import type { Pt } from './types.ts';
import { bar, point, sceneLine, sceneRow } from './gantt-scene.test-helpers.ts';

const rows = [
	sceneRow('before', 0, bar(0.1, 0.2)),
	sceneRow('source', 1, bar(0.7, 1, false, true), { status: 'done' }),
	sceneRow('target', 2, bar(0.2, 0.4)),
	sceneRow('point', 3, point(0.6), { level: 1 }),
	sceneRow('after', 4, bar(0.8, 0.9))
];
const lines = [
	sceneLine(rows[0], rows[2]),
	sceneLine(rows[1], rows[2], true),
	sceneLine(rows[2], rows[3]),
	sceneLine(rows[3], rows[4])
];

describe('ganttFragment (3c)', () => {
	it('filters both endpoints before routing and rebases rows, line rows and source-local taps [AC10]', () => {
		const saved = structuredClone({ rows, lines });
		const f = ganttFragment(rows, lines, { from: 1, to: 4, first: false, width: 550 });
		expect(f.rows.map((r) => [r.id, r.row, r.status])).toEqual([
			['source', 0, 'done'],
			['target', 1, 'todo'],
			['point', 2, 'todo']
		]);
		expect(f.lines.map((l) => [l.key, l.row0, l.row1, l.cycle])).toEqual([
			['source->target', 0, 1, true],
			['target->point', 1, 2, false]
		]);
		expect(f.scene.geometry.edges.map((e) => e.key).sort()).toEqual([
			'source->target',
			'target->point'
		]);
		const tap = f.scene.geometry.junctions.find((j) => j.kind === 'tap')!;
		expect(tap.source).toBe('source');
		expect(tap.point.y.px).toBe(9);
		expect(tap.point.x.f * 400 + tap.point.x.px).toBeLessThan(400);
		expect({ rows, lines }).toEqual(saved);
	});

	it('uses the actual first-fragment milestone height and no later-fragment offset [AC10]', () => {
		const first = ganttFragment(rows, lines, { from: 0, to: 3, first: true, width: 550 });
		const later = ganttFragment(rows, lines, { from: 1, to: 4, first: false, width: 550 });
		expect(first.scene.tracks.map((t) => t.center)).toEqual([31, 49, 67]);
		expect(later.scene.tracks.map((t) => t.center)).toEqual([9, 27, 45]);
		expect(first.scene.breaks).toEqual([40, 58, 76]);
		expect(later.scene.breaks).toEqual([18, 36, 54]);
	});

	it('routes in measured paper date width and keeps every point inside the local body [AC9,AC10]', () => {
		for (const width of [470, 750]) {
			const f = ganttFragment(rows, lines, { from: 1, to: 4, first: false, width });
			const extent = width - 150;
			const source = f.scene.tracks.find((t) => t.id === 'source')!;
			expect(source.span).toEqual([extent * 0.7, extent]);
			for (const edge of f.scene.geometry.edges) {
				expect(edge.points).toHaveLength(6);
				for (const p of edge.points) {
					const x = p.x.f * extent + p.x.px;
					expect(x).toBeGreaterThanOrEqual(0);
					expect(x).toBeLessThanOrEqual(extent);
					expect(p.y.px).toBeGreaterThanOrEqual(0);
					expect(p.y.px).toBeLessThanOrEqual(54);
				}
			}
			const e = f.scene.geometry.edges.find((e) => e.key === 'source->target')!;
			expect(e.points[0].x.f * extent + e.points[0].x.px).toBe(extent);
			expect(e.points[5].x.f * extent + e.points[5].x.px).toBeCloseTo(extent * 0.2 + 3);
		}
	});

	it('keeps direct fragments without shared paper metadata limited to complete local edges [3d AC2]', () => {
		const crossing = [
			sceneLine(rows[0], rows[4]),
			sceneLine(rows[0], rows[2]),
			sceneLine(rows[2], rows[4])
		];
		const f = ganttFragment(rows, crossing, { from: 1, to: 4, first: false, width: 550 });
		expect(f.lines).toEqual([]);
		expect(f.scene.edges).toEqual([]);
		expect(f.scene.geometry.edges).toEqual([]);
		expect(f.scene.geometry.junctions).toEqual([]);
	});

	it('handles zero measurement width without nonfinite or out-of-body routes [AC10]', () => {
		const f = ganttFragment(rows, lines, { from: 1, to: 4, first: false, width: 0 });
		expect(f.rows.map((r) => r.id)).toEqual(['source', 'target', 'point']);
		expect(f.scene.geometry.edges).toEqual([]);
		expect(f.scene.geometry.junctions).toEqual([]);
		const checkFinite = (value: unknown): void => {
			if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
			else if (value && typeof value === 'object')
				for (const child of Object.values(value)) checkFinite(child);
		};
		checkFinite(f.scene.geometry);
		expect(f.scene.breaks).toEqual([18, 36, 54]);
	});

	it('returns an empty bounded scene for an empty fragment [AC10]', () => {
		const f = ganttFragment(rows, lines, { from: 2, to: 2, first: false, width: 550 });
		expect(f.rows).toEqual([]);
		expect(f.lines).toEqual([]);
		expect(f.scene).toMatchObject({
			nodes: [],
			edges: [],
			tracks: [],
			marks: [],
			breaks: [],
			geometry: { nodes: [], edges: [], junctions: [] }
		});
	});
});

function paperLayout(
	rows: readonly GanttRow[],
	lines: readonly DependencyLine[],
	width = 550
): GanttPaperLayout {
	return {
		width,
		scene: ganttScene(rows, lines, {
			...PRINT_ROUTE_METRICS(Math.max(0, width - 150), rows.length),
			top: 22,
			media: 'paper'
		})
	};
}

const xy = (point: Pt, width = 400) => ({
	x: point.x.f * width + point.x.px,
	y: point.y.px
});
const distance = (points: readonly Pt[]) => {
	const a = xy(points[0]),
		b = xy(points[1]);
	return Math.hypot(a.x - b.x, a.y - b.y);
};
function crossingFixture() {
	const rows = [
		sceneRow('a', 0, bar(0.1, 0.3), { status: 'done' }),
		sceneRow('b', 1, bar(0.1, 0.3)),
		sceneRow('middle-a', 2, bar(0.7, 0.85)),
		sceneRow('middle-b', 3, bar(0.7, 0.85)),
		sceneRow('ta', 4, bar(0.7, 0.85)),
		sceneRow('tb', 5, bar(0.7, 0.85))
	];
	return { rows, lines: [sceneLine(rows[0], rows[4]), sceneLine(rows[1], rows[5])] };
}

describe('paper sheet-break continuations (3d)', () => {
	it('keeps the selected whole-segment riser across exit, pass-through and entry [AC1,AC3,AC4]', () => {
		const { rows, lines } = crossingFixture();
		const paper = paperLayout(rows, lines);
		const whole = paper.scene.geometry.edges.find((edge) => edge.key === 'a->ta')!;
		const source = paper.scene.tracks.find((track) => track.id === 'a')!;
		expect(xy(whole.points[1]).x).toBe(124);
		expect(xy(whole.points[1]).x).not.toBe(source.outX + 4);
		for (const [i, kind] of ['exit', 'pass-through', 'entry'].entries()) {
			const fragment = ganttFragment(rows, lines, {
				from: i * 2,
				to: i * 2 + 2,
				first: i === 0,
				width: 550,
				paper
			});
			const edge = fragment.continuations.find((edge) => edge.key === whole.key)!;
			expect(edge, `Missing ${kind} for a->ta`).toBeDefined();
			expect(edge).toMatchObject({
				key: whole.key,
				from: 'a',
				to: 'ta',
				trunk: whole.trunk,
				cycle: false,
				kind,
				riserX: 124
			});
			expect(fragment.scene.geometry.edges).toEqual([]);
			expect(fragment.scene.nodes.map((node) => node.id)).toEqual(
				rows.slice(i * 2, i * 2 + 2).map((row) => row.id)
			);
			expect(edge.stubs).toHaveLength(kind === 'pass-through' ? 2 : 1);
			expect(edge.ticks).toHaveLength(edge.stubs.length);
		}
	});

	it('keeps complete paths fragment-local instead of clipping the whole routing result [AC2]', () => {
		const rows = [
			sceneRow('b', 0, bar(0.1, 0.2625)),
			sceneRow('a', 1, point(0.25)),
			sceneRow('middle-a', 2, bar(0.7, 0.85)),
			sceneRow('tb', 3, bar(0.7, 0.85)),
			sceneRow('middle-b', 4, bar(0.7, 0.85)),
			sceneRow('ta', 5, bar(0.7, 0.85))
		];
		const lines = [sceneLine(rows[1], rows[5]), sceneLine(rows[0], rows[3])];
		const saved = structuredClone({ rows, lines });
		const paper = paperLayout(rows, lines);
		const fragment = ganttFragment(rows, lines, {
			from: 1,
			to: 6,
			first: false,
			width: 550,
			paper
		});
		const local = fragment.scene.geometry.edges.find((edge) => edge.key === 'a->ta')!;
		expect(xy(local.points[1]).x).toBe(106);
		expect(xy(paper.scene.geometry.edges.find((edge) => edge.key === local.key)!.points[1]).x).toBe(
			109
		);
		expect(fragment.continuations.map((edge) => edge.key)).toEqual(['b->tb']);
		expect(fragment.scene.edges.map((edge) => edge.key)).toEqual(['a->ta']);
		for (let i = 0; i < 3; i++) {
			const split = ganttFragment(rows, lines, {
				from: i * 2,
				to: i * 2 + 2,
				first: i === 0,
				width: 550,
				paper
			});
			expect(split.continuations.find((edge) => edge.key === 'a->ta')!.riserX).toBe(109);
		}
		expect({ rows, lines }).toEqual(saved);
	});

	it('uses exact solid-stub and tick geometry for clamped risers and cycles in both directions [AC3,AC4]', () => {
		const { rows } = crossingFixture();
		rows[5] = sceneRow('tb', 5, bar(0.8, 1, false, true));
		const lines = [sceneLine(rows[0], rows[5], true), sceneLine(rows[5], rows[0], true)];
		const paper = paperLayout(rows, lines);
		const back = paper.scene.geometry.edges.find((edge) => edge.key === 'tb->a')!;
		const backX = xy(back.points[1]).x;
		expect(backX).toBeLessThan(paper.scene.tracks.find((track) => track.id === 'tb')!.outX);
		for (let i = 0; i < 3; i++) {
			const top = i === 0 ? 22 : 0,
				bottom = top + 36;
			const fragment = ganttFragment(rows, lines, {
				from: i * 2,
				to: i * 2 + 2,
				first: i === 0,
				width: 550,
				paper
			});
			expect(fragment.continuations).toHaveLength(2);
			for (const edge of fragment.continuations) {
				expect(edge.cycle).toBe(true);
				const expectedX = xy(
					paper.scene.geometry.edges.find((item) => item.key === edge.key)!.points[1]
				).x;
				expect(edge.riserX).toBe(expectedX);
				for (const stub of edge.stubs) {
					expect(stub).toHaveLength(2);
					expect(distance(stub)).toBe(4);
					expect(stub.every((point) => xy(point).x === expectedX)).toBe(true);
					expect(stub.some((point) => xy(point).y === top || xy(point).y === bottom)).toBe(true);
				}
				for (const tick of edge.ticks) {
					expect(tick).toHaveLength(2);
					expect(distance(tick)).toBe(2);
					expect((xy(tick[0]).x + xy(tick[1]).x) / 2).toBe(expectedX);
					expect(xy(tick[0]).y).toBe(xy(tick[1]).y);
				}
				for (const point of [...edge.points, ...edge.stubs.flat(), ...edge.ticks.flat()]) {
					const p = xy(point);
					expect(p.x).toBeGreaterThanOrEqual(0);
					expect(p.x).toBeLessThanOrEqual(400);
					expect(p.y).toBeGreaterThanOrEqual(top);
					expect(p.y).toBeLessThanOrEqual(bottom);
				}
				if (i !== 1) {
					const boundary = i === 0 ? bottom : top;
					expect(edge.kind).toBe(
						edge.key === 'tb->a' ? (i === 0 ? 'entry' : 'exit') : i === 0 ? 'exit' : 'entry'
					);
					expect(edge.stubs[0].some((point) => xy(point).y === boundary)).toBe(true);
				}
			}
		}
	});

	it('keeps backward entry hooks orthogonal and allows diagonals only at final forward entries [AC2,AC3]', () => {
		for (const variant of ['hook', 'forward', 'aligned']) {
			const { rows } = crossingFixture();
			rows[0] = sceneRow('a', 0, variant === 'hook' ? bar(0.8, 1, false, true) : point(0.25));
			rows[5] = sceneRow(
				'tb',
				5,
				variant === 'hook' ? bar(0.1, 0.3) : variant === 'aligned' ? point(0.315) : bar(0.7, 0.85)
			);
			const lines = [sceneLine(rows[0], rows[5])];
			const paper = paperLayout(rows, lines);
			if (variant === 'aligned') {
				const whole = paper.scene.geometry.edges[0];
				const target = paper.scene.tracks.find((track) => track.id === 'tb')!;
				expect(xy(whole.points[1]).x).toBe(target.inX);
			}
			const fragment = ganttFragment(rows, lines, {
				from: 4,
				to: 6,
				first: false,
				width: 550,
				paper
			});
			const edge = fragment.continuations[0];
			expect(edge).toBeDefined();
			expect(edge.kind).toBe('entry');
			expect(edge.points).toHaveLength(6);
			const target = fragment.scene.tracks.find((track) => track.id === 'tb')!;
			expect(xy(edge.points.at(-1)!)).toEqual({ x: target.inX, y: target.center });
			const segments = edge.points
				.slice(1)
				.map((point, i) => {
					const a = xy(edge.points[i]),
						b = xy(point);
					return { dx: b.x - a.x, dy: b.y - a.y };
				})
				.filter(({ dx, dy }) => Math.abs(dx) + Math.abs(dy) > 1e-8);
			for (const [i, segment] of segments.entries()) {
				const axis = Math.abs(segment.dx) < 1e-8 || Math.abs(segment.dy) < 1e-8;
				expect(
					axis ||
						(i === segments.length - 1 &&
							Math.abs(Math.abs(segment.dx) - Math.abs(segment.dy)) < 1e-8)
				).toBe(true);
			}
			const last = segments.at(-1)!;
			if (variant === 'hook') expect(last).toEqual({ dx: 4, dy: 0 });
			if (variant === 'forward') {
				expect(Math.abs(last.dx)).toBe(Math.abs(last.dy));
				expect(last.dx).toBeGreaterThan(0);
			}
			if (variant === 'aligned') expect(last.dx).toBe(0);
		}
	});

	it('keeps a clamped crossing source tap local and deduplicates a coincident internal tap [D24,AC2]', () => {
		const { rows } = crossingFixture();
		rows[5] = sceneRow('tb', 5, bar(0.8, 1, false, true));
		for (const includeInternal of [false, true]) {
			const lines = [
				sceneLine(rows[5], rows[0]),
				...(includeInternal ? [sceneLine(rows[5], rows[4])] : [])
			];
			const paper = paperLayout(rows, lines);
			const fragment = ganttFragment(rows, lines, {
				from: 4,
				to: 6,
				first: false,
				width: 550,
				paper
			});
			const edge = fragment.continuations.find((edge) => edge.key === 'tb->a')!;
			expect(edge).toBeDefined();
			const taps = fragment.scene.geometry.junctions.filter(
				(junction) => junction.kind === 'tap' && junction.source === 'tb'
			);
			expect(taps).toHaveLength(1);
			expect(xy(taps[0].point)).toEqual({ x: edge.riserX, y: 27 });
			expect(edge.riserX).toBeLessThan(
				fragment.scene.tracks.find((track) => track.id === 'tb')!.outX
			);
			expect(fragment.scene.geometry.edges.map((edge) => edge.key)).toEqual(
				includeInternal ? ['tb->ta'] : []
			);
		}
	});

	it('does not represent edges that lie wholly before or after the fragment [AC2,AC5]', () => {
		const { rows } = crossingFixture();
		const lines = [sceneLine(rows[0], rows[1]), sceneLine(rows[4], rows[5])];
		const fragment = ganttFragment(rows, lines, {
			from: 2,
			to: 4,
			first: false,
			width: 550,
			paper: paperLayout(rows, lines)
		});
		expect(fragment.scene.edges).toEqual([]);
		expect(fragment.continuations).toEqual([]);
		expect(fragment.rows.map((row) => row.id)).toEqual(['middle-a', 'middle-b']);
	});

	it('keeps width-zero and empty fragments safe with shared continuation metadata [AC6]', () => {
		const { rows, lines } = crossingFixture();
		const zero = ganttFragment(rows, lines, {
			from: 0,
			to: 2,
			first: true,
			width: 0,
			paper: paperLayout(rows, lines, 0)
		});
		const empty = ganttFragment(rows, lines, {
			from: 2,
			to: 2,
			first: false,
			width: 550,
			paper: paperLayout(rows, lines)
		});
		expect(zero.continuations).toEqual([]);
		expect(zero.scene.geometry.edges).toEqual([]);
		expect(empty.continuations).toEqual([]);
		expect(empty.scene.nodes).toEqual([]);
	});

	it('shares one whole-segment computation and rebuilds deterministically for width, range and expansion [AC1,AC6]', () => {
		const { rows, lines } = crossingFixture();
		const cache = createGanttPaperCache();
		const first = cache.get(rows, lines, 550);
		expect(cache.get(rows, lines, 550)).toBe(first);
		const fragments = [0, 2, 4].map((from) =>
			ganttFragment(rows, lines, {
				from,
				to: from + 2,
				first: from === 0,
				width: 550,
				paper: first
			})
		);
		expect(
			fragments.map(
				(fragment) => fragment.continuations.find((edge) => edge.key === 'a->ta')!.riserX
			)
		).toEqual([124, 124, 124]);
		const wide = cache.get(rows, lines, 750);
		expect(wide).not.toBe(first);
		expect(wide.scene.tracks.find((track) => track.id === 'a')!.span).toEqual([60, 180]);
		const ranged = rows.map((row) => (row.id === 'a' ? { ...row, mark: bar(0.1, 0.4) } : row));
		const shifted = cache.get(ranged, lines, 550);
		expect(shifted).not.toBe(first);
		expect(shifted.scene.tracks.find((track) => track.id === 'a')!.span).toEqual([40, 160]);
		const expanded = rows.flatMap((row) =>
			row.id === 'a'
				? [row, sceneRow('child', 1, bar(0.1, 0.3), { level: 1, parentId: 'a' })]
				: [{ ...row, row: row.row + 1 }]
		);
		const expandedLines = [
			sceneLine(expanded[0], expanded[5]),
			sceneLine(expanded[2], expanded[6])
		];
		const expansion = cache.get(expanded, expandedLines, 550);
		expect(expansion.scene.nodes.map((node) => node.id)).toContain('child');
		expect(expansion.scene.tracks.find((track) => track.id === 'ta')!.center).toBe(121);
		expect(cache.get(rows, lines, 550).scene).toEqual(first.scene);
		expect(cache.get(rows, [...lines].reverse(), 550).scene.geometry).toEqual(first.scene.geometry);
	});
});
