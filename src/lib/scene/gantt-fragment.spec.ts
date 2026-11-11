import { describe, expect, it } from 'vitest';
import { ganttFragment } from './gantt-fragment.ts';
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

	it('keeps crossing and pass-through dependencies absent until slice 3d [AC10]', () => {
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
