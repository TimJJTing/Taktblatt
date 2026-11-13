import { describe, expect, it } from 'vitest';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { routeMapModel } from '#lib/domain/route-map.ts';
import { routeMapPaper, type RouteMapPaper, type RouteMapPaperMetrics } from './route-map-paper.ts';
import {
	expectClearRoutes,
	expectPathClear,
	largePlan,
	screenMetrics,
	shuffled,
	task
} from './route-map.test-helpers.ts';

const mm = (value: number) => (value * 96) / 25.4;
const metrics = (letter = false): RouteMapPaperMetrics => ({
	...screenMetrics,
	sheetWidth: letter ? 1056 : mm(297),
	sheetHeight: letter ? 816 : mm(210),
	margin: 32,
	repeatedLabelWidth: 96,
	gutter: 24,
	headerHeight: 48,
	footerHeight: 24,
	lineHeight: 16
});
const usable = (m: RouteMapPaperMetrics) => ({
	w: m.sheetWidth - m.margin * 2 - m.repeatedLabelWidth - m.gutter * 2,
	h: m.sheetHeight - m.margin * 2 - m.headerHeight - m.footerHeight
});

function expectFits(paper: RouteMapPaper, m: RouteMapPaperMetrics) {
	const bounds = usable(m);
	for (const column of paper.columns) expect(column.width).toBeLessThanOrEqual(bounds.w);
	for (const panel of paper.panels) {
		const columns = panel.columnIds.map((id) => paper.columns.find((c) => c.id === id)!);
		expect(columns.reduce((sum, c) => sum + c.width, 0)).toBeLessThanOrEqual(bounds.w);
	}
	expect(paper.panels.flatMap((p) => p.columnIds)).toEqual(paper.columns.map((c) => c.id));
	for (const item of paper.segment.items) {
		const panel = paper.panels.find((p) => p.id === item.panelId)!;
		expect(panel).toBeDefined();
		expect(item.width).toBeGreaterThan(0);
		expect(item.height).toBeGreaterThan(0);
		expect(item.width).toBeLessThanOrEqual(bounds.w);
		expect(item.height).toBeLessThanOrEqual(bounds.h);
		for (const s of item.stations) {
			expect(panel.columnIds).toContain(s.columnId);
			expect(s.labelLines.length).toBeLessThanOrEqual(2);
			for (const box of [s.hitBox, s.labelBox]) {
				expect(box.x).toBeGreaterThanOrEqual(0);
				expect(box.y).toBeGreaterThanOrEqual(0);
				expect(box.x + box.w).toBeLessThanOrEqual(item.width);
				expect(box.y + box.h).toBeLessThanOrEqual(item.height);
			}
			for (const text of s.labelLines)
				expect(m.measureText(text)).toBeLessThanOrEqual(s.labelBox.w);
		}
		expectClearRoutes({ stations: item.stations, clearance: m.clearance }, item.edges);
		for (const c of item.continuations) {
			expect(c.points.length).toBeGreaterThanOrEqual(2);
			expectPathClear(c.points, item.stations, m.clearance, [c.from, c.to]);
		}
		expect(item.titles.length * m.lineHeight).toBeLessThanOrEqual(item.height);
		for (const e of [...item.edges, ...item.continuations]) {
			for (const p of e.points) {
				expect(p.x).toBeGreaterThanOrEqual(0);
				expect(p.y).toBeGreaterThanOrEqual(0);
				expect(p.x).toBeLessThanOrEqual(item.width);
				expect(p.y).toBeLessThanOrEqual(item.height);
			}
		}
		for (const title of item.titles) {
			expect(m.measureText(title.text)).toBeLessThanOrEqual(item.width);
		}
	}
}

function expectPairs(paper: RouteMapPaper) {
	const entries = paper.segment.items.flatMap((item) => item.continuations);
	for (const id of new Set(entries.map((c) => c.id))) {
		const pair = entries.filter((c) => c.id === id);
		expect(pair.map((c) => c.kind).sort()).toEqual(['entry', 'exit']);
		const [first, second] = pair;
		const identity = (c: typeof first) => ({
			id: c.id,
			key: c.key,
			boundary: c.boundary,
			from: c.from,
			to: c.to,
			cycle: c.cycle,
			stored: c.stored
		});
		expect(identity(first)).toEqual(identity(second));
		expect(first.boundary.length).toBeGreaterThan(0);
		expect(first.from).not.toBe(first.to);
	}
}

describe('Route map paper', () => {
	it('cuts measured whole columns on landscape A4 and Letter and keeps stable panel ids', () => {
		const plan = makePlan(
			Array.from({ length: 18 }, (_, i) =>
				task({
					id: `task-${i}`,
					title: 'Measured label '.repeat((i % 4) + 1)
				})
			)
		);
		for (const m of [metrics(), metrics(true)]) {
			const paper = routeMapPaper(routeMapModel(plan, new Set()), m);
			expect(paper.panels.length).toBeGreaterThan(1);
			expect(paper.segment.kind).toBe('scene');
			expect(paper.segment.diagram).toBe('route-map');
			expectFits(paper, m);
			expect(routeMapPaper(routeMapModel(shuffled(plan), new Set()), m)).toEqual(paper);
			const stations = paper.segment.items.flatMap((i) => i.stations.map((s) => s.id));
			expect(stations.sort()).toEqual(plan.tasks.map((t) => t.id).sort());
		}
	});

	it('caps unequal measured columns before assignment, including equal-rank independent tasks', () => {
		const plan = makePlan([
			task({ id: 'short', title: 'A' }),
			task({ id: 'wide', title: 'Wide label with several words' }),
			task({ id: 'oversize', title: 'W'.repeat(2000) })
		]);
		const m = { ...metrics(), sheetWidth: 420 };
		const paper = routeMapPaper(routeMapModel(plan, new Set()), m);
		expect(paper.columns).toHaveLength(3);
		expect(new Set(paper.columns.map((c) => c.width)).size).toBeGreaterThan(1);
		expect(new Set(paper.columns.map((c) => c.id)).size).toBe(3);
		expectFits(paper, m);
		expect(
			paper.segment.items
				.flatMap((i) => i.stations)
				.map((s) => s.id)
				.sort()
		).toEqual(['oversize', 'short', 'wide']);
	});

	it('preserves every oversized-title character in referenced legal continuation lines', () => {
		const titles = [
			'A very long title with spaces, punctuation and 漢字. '.repeat(240),
			'Unbroken漢字'.repeat(700)
		];
		const plan = makePlan(titles.map((title, i) => task({ id: `long-${i}`, title })));
		const m = metrics();
		const paper = routeMapPaper(routeMapModel(plan, new Set()), m);
		expectFits(paper, m);
		for (const [i, title] of titles.entries()) {
			const id = `long-${i}`;
			const stations = paper.segment.items
				.flatMap((item) => item.stations)
				.filter((s) => s.id === id);
			expect(stations).toHaveLength(1);
			const station = stations[0];
			expect(station.reference.length).toBeGreaterThan(0);
			const parts = paper.segment.items
				.flatMap((item) => item.titles)
				.filter((t) => t.taskId === id);
			expect(parts.map((p) => p.text).join('')).toBe(title);
			expect(parts.every((p) => p.reference === station.reference)).toBe(true);
			expect(parts.length * m.lineHeight).toBeGreaterThan(usable(m).h);
		}
		expect(paper.segment.items.length).toBeGreaterThan(2);
	});

	it('keeps explicit title breaks in separate physical rows', () => {
		const title = 'First line\n\n' + 'Long line '.repeat(40);
		const paper = routeMapPaper(
			routeMapModel(makePlan([task({ id: 'multiline', title })]), new Set()),
			metrics()
		);
		const rows = paper.segment.items
			.flatMap((item) => item.titles)
			.filter((row) => row.taskId === 'multiline');
		expect(rows.slice(0, 2).map((row) => row.text)).toEqual(['First line', '']);
		expect(rows.every((row) => !row.text.includes('\n'))).toBe(true);
	});

	it('places each stage on its own line and expanded children on a branch', () => {
		const plan = makePlan(
			[
				task({ id: 'parent', stageId: 's1' }),
				task({ id: 'child', stageId: 's1', parentId: 'parent' }),
				task({ id: 'other', stageId: 's2' })
			],
			['s1', 's2']
		);
		const paper = routeMapPaper(routeMapModel(plan, new Set(['parent'])), metrics());
		for (const item of paper.segment.items.filter((item) => item.lineY !== undefined)) {
			for (const station of item.stations) {
				const node = plan.tasks.find((task) => task.id === station.id)!;
				expect(node.stageId).toBe(item.stageId);
				if (node.parentId) expect(station.inPort.y).toBeGreaterThan(item.lineY!);
				else expect(station.inPort.y).toBe(item.lineY);
			}
		}
	});

	it('splits a large expanded family into legal cells and prints whole-stage progress once', () => {
		const plan = makePlan(
			[
				task({ id: 'P' }),
				...Array.from({ length: 45 }, (_, i) => task({ id: `child-${i}`, parentId: 'P' }))
			],
			['s1', 'empty']
		);
		const paper = routeMapPaper(routeMapModel(plan, new Set(['P'])), metrics());
		expectFits(paper, metrics());
		expect(paper.segment.items.length).toBeGreaterThan(1);
		const ids = paper.segment.items.flatMap((i) => i.stations.map((s) => s.id));
		expect(ids.sort()).toEqual(plan.tasks.map((t) => t.id).sort());
		const lastStationItem = paper.segment.items.findLastIndex((i) => i.stations.length > 0);
		expect(
			paper.segment.items.findIndex((i) => i.termini.some((t) => t.stageId === 's1'))
		).toBeGreaterThanOrEqual(lastStationItem);
		expect(paper.segment.items.flatMap((i) => i.termini)).toEqual([
			{ stageId: 's1', toGo: 1 },
			{ stageId: 'empty', toGo: 0 }
		]);
	});

	it('pairs directed cycle continuations across column panels and vertical item boundaries', () => {
		const plan = makePlan(
			Array.from({ length: 16 }, (_, i) =>
				task({
					id: `T${i}`,
					dependsOn: i ? [`T${i - 1}`] : ['T15']
				})
			)
		);
		const m = { ...metrics(), sheetWidth: 480, sheetHeight: 300 };
		const paper = routeMapPaper(routeMapModel(plan, new Set()), m);
		expectFits(paper, m);
		expectPairs(paper);
		const continuations = paper.segment.items.flatMap((i) => i.continuations);
		expect(continuations.length).toBeGreaterThan(0);
		expect(continuations.every((c) => c.cycle)).toBe(true);
		for (const t of plan.tasks) {
			const fromItem = paper.segment.items.find((i) =>
				i.stations.some((s) => s.id === t.dependsOn[0])
			)!;
			const toItem = paper.segment.items.find((i) => i.stations.some((s) => s.id === t.id))!;
			if (fromItem.id !== toItem.id) {
				expect(continuations.some((c) => c.from === t.dependsOn[0] && c.to === t.id)).toBe(true);
			}
		}
	});

	it('covers all 120 stations and 200 stored edges on measured paper without input-order changes', () => {
		const plan = largePlan();
		const m = metrics();
		const paper = routeMapPaper(routeMapModel(plan, new Set()), m);
		expectFits(paper, m);
		expectPairs(paper);
		const ids = paper.segment.items.flatMap((i) => i.stations.map((s) => s.id));
		expect(ids).toHaveLength(120);
		expect(new Set(ids).size).toBe(120);
		const represented = new Set(
			paper.segment.items
				.flatMap((i) => [...i.edges, ...i.continuations])
				.flatMap((e) => e.stored.map((s) => `${s.taskId}:${s.dependencyId}`))
		);
		expect([...represented].sort()).toEqual(
			plan.tasks.flatMap((t) => t.dependsOn.map((id) => `${t.id}:${id}`)).sort()
		);
		expect(represented.size).toBe(200);
		expect(routeMapPaper(routeMapModel(shuffled(plan), new Set()), m)).toEqual(paper);
	}, 20000);
});
