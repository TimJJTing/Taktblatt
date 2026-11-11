import { describe, expect, it } from 'vitest';
import { dependencyLines, ganttRows } from '#lib/domain/gantt.ts';
import { indexTasks } from '#lib/domain/derive.ts';
import { makePlan, makeTask } from '#lib/domain/test-helpers.ts';
import { ganttScene, type GanttScene } from './gantt-scene.ts';
import type { Pt } from './types.ts';

import {
	bar,
	point,
	sceneRow,
	sceneLine,
	screenMetrics,
	paperMetrics
} from './gantt-scene.test-helpers.ts';

const xy = (p: Pt, width: number) => ({ x: p.x.f * width + p.x.px, y: p.y.px });
const markOf = (s: GanttScene, id: string) => s.marks.find((m) => m.id === id)!;
const trackOf = (s: GanttScene, id: string) => s.tracks.find((t) => t.id === id)!;
const resolveBox = (s: GanttScene, id: string, width: number) => {
	const g = s.geometry.nodes.find((n) => n.id === id)!;
	return { x: g.x.f * width + g.x.px, y: g.y.px, w: g.w.f * width + g.w.px, h: g.h.px };
};

describe('ganttScene (3c)', () => {
	it('preserves derived parent status, stage identity, merged edge identity and row breaks [AC1]', () => {
		const plan = makePlan([
			makeTask({ id: 'parent' }),
			makeTask({
				id: 'child',
				parentId: 'parent',
				start: '2027-01-01',
				end: '2027-01-02',
				status: 'done'
			}),
			makeTask({
				id: 'target',
				start: '2027-01-05',
				end: '2027-01-08',
				dependsOn: ['parent', 'child']
			})
		]);
		const index = indexTasks(plan.tasks);
		const rows = ganttRows(index, ['s1'], () => false, { start: '2027-01-01', end: '2027-01-10' });
		const lines = dependencyLines(index, rows);
		const scene = ganttScene(rows, lines, screenMetrics(600, rows.length));
		expect(scene.nodes).toEqual([
			{ id: 'parent', stageId: 's1', status: 'done' },
			{ id: 'target', stageId: 's1', status: 'todo' }
		]);
		expect(scene.edges).toEqual([
			{ key: 'parent->target', from: 'parent', to: 'target', cycle: false }
		]);
		expect(scene.breaks).toEqual([56, 84]);
		expect(resolveBox(scene, 'parent', 600)).toEqual({ x: 0, y: 38, w: 120, h: 8 });
		expect(resolveBox(scene, 'target', 600)).toEqual({ x: 240, y: 66, w: 240, h: 8 });
	});

	it('retains no-date, invalid and outside cues without inventing tracks or dependencies [AC1]', () => {
		const rows = [
			sceneRow('none', 0, { kind: 'none' }),
			sceneRow('invalid', 1, { kind: 'invalid' }),
			sceneRow('before', 2, { kind: 'outside', side: 'before' }),
			sceneRow('after', 3, { kind: 'outside', side: 'after' }),
			sceneRow('valid', 4, bar(0.2, 0.5))
		];
		const scene = ganttScene(
			rows,
			rows.slice(0, 4).map((r) => sceneLine(r, rows[4])),
			screenMetrics(600, rows.length)
		);
		expect(scene.nodes.map((n) => n.id)).toEqual(rows.map((r) => r.id));
		expect(scene.marks.map((m) => m.mark)).toEqual(rows.map((r) => r.mark));
		expect(scene.tracks.map((t) => t.id)).toEqual(['valid']);
		expect(scene.edges).toEqual([]);
		expect(scene.geometry.nodes.map((n) => n.id)).toEqual(['valid']);
	});

	for (const width of [120, 600]) {
		it(`keeps screen station extents inside date boxes and connects at ordinary dot centers at width ${width} [AC2]`, () => {
			const rows = [
				sceneRow('parent', 0, bar(0.1, 0.4)),
				sceneRow('sub', 1, bar(0.6, 0.9), { level: 1, parentId: 'parent' })
			];
			const scene = ganttScene(rows, [sceneLine(rows[0], rows[1])], screenMetrics(width, 2));
			for (const [id, r, h] of [
				['parent', 4, 8],
				['sub', 3, 6]
			] as const) {
				const m = markOf(scene, id);
				const t = trackOf(scene, id);
				expect(m.line!.height).toBe(h);
				expect(m.stations.map((s) => [s.r, s.inset])).toEqual([
					[r, 1],
					[r, 1]
				]);
				expect(m.stations.map((s) => s.x)).toEqual([t.span![0] + r, t.span![1] - r]);
				expect([t.inX, t.outX, t.inR, t.outR, t.half]).toEqual([
					t.span![0] + r,
					t.span![1] - r,
					r,
					r,
					h / 2
				]);
			}
			const path = scene.geometry.edges[0].points.map((p) => xy(p, width));
			expect(path).toHaveLength(6);
			expect(path[0]).toEqual({ x: width * 0.4 - 4, y: 42 });
			expect(path[5]).toEqual({ x: width * 0.6 + 3, y: 70 });
		});
	}

	it('keeps tiny date widths, centers one dot and uses its shrunk edge ports [AC3]', () => {
		const rows = [
			sceneRow('tiny', 0, bar(0.1, 0.106)),
			sceneRow('short', 1, bar(0.2, 0.22)),
			sceneRow('subpixel', 2, bar(0.3, 0.301))
		];
		const scene = ganttScene(rows, [sceneLine(rows[0], rows[1])], screenMetrics(600, 3));
		for (const [id, start, end, radius] of [
			['tiny', 60, 63.6, 1.8],
			['short', 120, 132, 4],
			['subpixel', 180, 180.6, 0.3]
		] as const) {
			const m = markOf(scene, id);
			const t = trackOf(scene, id);
			expect(m.line!.x0).toBeCloseTo(start);
			expect(m.line!.x1).toBeCloseTo(end);
			expect(m.stations).toHaveLength(1);
			expect(m.stations[0].x).toBeCloseTo((start + end) / 2);
			expect(m.stations[0].r).toBeCloseTo(radius);
			expect(m.stations[0].inset).toBeLessThanOrEqual(radius + 1e-9);
			expect(t.inR).toBeCloseTo(radius);
			expect(t.outR).toBeCloseTo(radius);
			expect(t.inX).toBeCloseTo((start + end) / 2 - radius);
			expect(t.outX).toBeCloseTo((start + end) / 2 + radius);
		}
	});

	it('gives clipped sides window ports and no dot even when the bar is tiny [AC3]', () => {
		const rows = [
			sceneRow('left', 0, bar(0, 0.005, true)),
			sceneRow('right', 1, bar(0.995, 1, false, true)),
			sceneRow('both', 2, bar(0, 1, true, true))
		];
		const scene = ganttScene(
			rows,
			[sceneLine(rows[0], rows[1]), sceneLine(rows[1], rows[2])],
			screenMetrics(600, 3)
		);
		expect(markOf(scene, 'both').stations).toEqual([]);
		for (const id of ['left', 'right']) {
			const m = markOf(scene, id);
			const t = trackOf(scene, id);
			expect(m.stations).toHaveLength(1);
			const s = m.stations[0];
			expect(s.x - s.r).toBeGreaterThanOrEqual(t.span![0] - 1e-9);
			expect(s.x + s.r).toBeLessThanOrEqual(t.span![1] + 1e-9);
		}
		expect([trackOf(scene, 'left').inX, trackOf(scene, 'left').inR]).toEqual([0, 0]);
		expect([trackOf(scene, 'right').outX, trackOf(scene, 'right').outR]).toEqual([600, 0]);
		expect([trackOf(scene, 'both').inX, trackOf(scene, 'both').outX]).toEqual([0, 600]);
	});

	it('uses point dot edges and keeps the complete 10 px mark inside its node box [AC2,AC3]', () => {
		const rows = [sceneRow('point', 0, point(0.2)), sceneRow('target', 1, bar(0.6, 0.9))];
		const scene = ganttScene(rows, [sceneLine(rows[0], rows[1])], screenMetrics(600, 2));
		expect(markOf(scene, 'point').line).toBeNull();
		expect(markOf(scene, 'point').stations).toEqual([{ x: 120, y: 42, r: 5, inset: 1 }]);
		expect(resolveBox(scene, 'point', 600)).toEqual({ x: 115, y: 37, w: 10, h: 10 });
		expect(trackOf(scene, 'point')).toMatchObject({ inX: 115, outX: 125, inR: 5, outR: 5 });
		expect(xy(scene.geometry.edges[0].points[0], 600)).toEqual({ x: 125, y: 42 });
	});

	it('uses resolved D27 paper sizes and encloses dots taller than their lines [AC9]', () => {
		const rows = [
			sceneRow('parent', 0, bar(0.1, 0.4)),
			sceneRow('sub', 1, bar(0.5, 0.8), { level: 1 }),
			sceneRow('point', 2, point(0.5))
		];
		const scene = ganttScene(rows, [sceneLine(rows[0], rows[1])], paperMetrics(400, 3));
		expect(markOf(scene, 'parent').line!.height).toBe(5);
		expect(markOf(scene, 'sub').line!.height).toBe(3.5);
		expect(markOf(scene, 'parent').stations.map((s) => [s.r * 2, (s.r - s.inset) * 2])).toEqual([
			[6, 4],
			[6, 4]
		]);
		expect(markOf(scene, 'sub').stations.map((s) => s.r * 2)).toEqual([4, 4]);
		expect(markOf(scene, 'point').stations[0].r * 2).toBe(4);
		expect(resolveBox(scene, 'parent', 400)).toMatchObject({ y: 28, h: 6 });
		expect(resolveBox(scene, 'sub', 400)).toMatchObject({ y: 47, h: 4 });
		expect(scene.breaks).toEqual([40, 58, 76]);
	});

	it('routes identical complete target sets together but keeps partial overlap separate [AC1,AC7]', () => {
		const rows = [
			sceneRow('a', 0, bar(0.05, 0.2)),
			sceneRow('b', 1, bar(0.05, 0.2)),
			sceneRow('c', 2, bar(0.05, 0.2)),
			sceneRow('x', 4, bar(0.65, 0.8)),
			sceneRow('y', 6, bar(0.7, 0.9))
		];
		const lines = [
			sceneLine(rows[0], rows[3]),
			sceneLine(rows[0], rows[4]),
			sceneLine(rows[1], rows[3]),
			sceneLine(rows[1], rows[4]),
			sceneLine(rows[2], rows[3], true)
		];
		const scene = ganttScene(rows, lines, screenMetrics(600, 7));
		const edges = scene.geometry.edges;
		expect(
			new Set(edges.filter((e) => e.from === 'a' || e.from === 'b').map((e) => e.trunk)).size
		).toBe(1);
		expect(edges.find((e) => e.key === 'c->x')!.trunk).not.toBe(
			edges.find((e) => e.key === 'a->x')!.trunk
		);
		expect(edges.find((e) => e.key === 'c->x')!.cycle).toBe(true);
		for (const e of edges) {
			const ps = e.points.map((p) => xy(p, 600));
			expect(ps).toHaveLength(6);
			for (let i = 1; i < ps.length; i++) {
				const dx = ps[i].x - ps[i - 1].x;
				const dy = ps[i].y - ps[i - 1].y;
				expect(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)).toBe(true);
				if (dx && dy) expect(i).toBe(5);
			}
		}
		expect(scene.geometry.junctions.some((j) => j.kind === 'junction')).toBe(true);
		for (const j of scene.geometry.junctions.filter((j) => j.kind === 'junction')) {
			const p = xy(j.point, 600);
			for (const t of scene.tracks)
				for (const [x, r] of [
					[t.inX, t.inR],
					[t.outX, t.outR]
				])
					expect(Math.hypot(p.x - x, p.y - t.center)).toBeGreaterThanOrEqual(r + 3 + 2);
		}
	});

	it('keeps clamped tap keys and source association stable across width and row changes [AC7,AC8]', () => {
		const rows = [
			sceneRow('source', 0, bar(0.7, 1, false, true)),
			sceneRow('target', 2, bar(0.2, 0.4))
		];
		const lines = [sceneLine(rows[0], rows[1])];
		const scene = ganttScene(rows, lines, screenMetrics(600, 3));
		const tap = scene.geometry.junctions.find((j) => j.kind === 'tap')!;
		expect(tap).toMatchObject({ kind: 'tap', source: 'source' });
		expect(xy(tap.point, 600).y).toBe(42);
		expect(xy(tap.point, 600).x).toBeLessThan(trackOf(scene, 'source').outX);
		const movedRows = rows.map((r) => ({ ...r, row: r.row + 1 }));
		const moved = ganttScene(
			movedRows,
			[sceneLine(movedRows[0], movedRows[1])],
			screenMetrics(400, 4)
		);
		const movedTap = moved.geometry.junctions.find((j) => j.kind === 'tap')!;
		expect(movedTap.key).toBe(tap.key);
		expect(movedTap.source).toBe('source');
		expect(xy(movedTap.point, 400).y).toBe(70);
		expect(moved.geometry.edges[0].key).toBe(scene.geometry.edges[0].key);
	});

	it('restores identical routes after a range round trip and ignores distant unrelated marks [AC8]', () => {
		const rows = [sceneRow('a', 0, bar(0.1, 0.2)), sceneRow('b', 3, bar(0.6, 0.8))];
		const lines = [sceneLine(rows[0], rows[1])];
		const before = ganttScene(rows, lines, screenMetrics(600, 4));
		const shifted = rows.map((r) => ({ ...r, mark: r.id === 'a' ? bar(0.2, 0.4) : r.mark }));
		ganttScene(shifted, [sceneLine(shifted[0], shifted[1])], screenMetrics(600, 4));
		expect(ganttScene(rows, lines, screenMetrics(600, 4)).geometry).toEqual(before.geometry);
		const unrelated = sceneRow('far', 20, bar(0.8, 0.9));
		const after = ganttScene(
			[...rows, unrelated].reverse(),
			[...lines].reverse(),
			screenMetrics(600, 21)
		);
		expect(after.geometry.edges).toEqual(before.geometry.edges);
		expect(after.geometry.junctions).toEqual(before.geometry.junctions);
	});
});
