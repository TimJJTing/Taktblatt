import { m } from '#lib/paraglide/messages.js';
import { describe, expect, it } from 'vitest';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { indexTasks } from '#lib/domain/derive.ts';
import { routeMapModel } from '#lib/domain/route-map.ts';
import { routeMapLayout } from './route-map-layout.ts';
import {
	routeMapPaper,
	routeMapPaperHeaderHeight,
	type RouteMapPaper,
	type RouteMapPaperMetrics
} from './route-map-paper.ts';
import {
	expectClearRoutes,
	pinnedExamplePlan,
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
const exampleMetrics = (letter = false): RouteMapPaperMetrics => ({
	...metrics(letter),
	clearance: 4,
	margin: 57,
	headerHeight: 36,
	footerHeight: 54,
	repeatedLabelWidth: 0,
	gutter: 0
});

const usable = (m: RouteMapPaperMetrics) => ({
	w: m.sheetWidth - m.margin * 2 - m.repeatedLabelWidth - m.gutter * 2,
	h: m.sheetHeight - m.margin * 2 - m.headerHeight - m.footerHeight
});
function expectFits(paper: RouteMapPaper, m: RouteMapPaperMetrics) {
	const bounds = usable(m);
	for (const item of paper.segment.items) {
		expect(item.width).toBeGreaterThan(0);
		expect(item.width).toBeLessThanOrEqual(bounds.w);
		expect(item.height).toBeGreaterThan(0);
		expect(item.height).toBeLessThanOrEqual(bounds.h);
		for (const s of item.stations) {
			for (const box of [s.hitBox, s.labelBox]) {
				expect(box.x).toBeGreaterThanOrEqual(0);
				expect(box.y).toBeGreaterThanOrEqual(0);
				expect(box.x + box.w).toBeLessThanOrEqual(item.width);
				expect(box.y + box.h).toBeLessThanOrEqual(item.height);
			}
			expect(s.labelLines.length).toBeLessThanOrEqual(2);
			for (const text of s.labelLines)
				expect(m.measureText(text)).toBeLessThanOrEqual(s.labelBox.w);
		}
		expectClearRoutes({ stations: item.stations, clearance: m.clearance }, item.edges);
		for (const edge of [...item.edges, ...item.continuations])
			for (const point of edge.points) {
				expect(point.x).toBeGreaterThanOrEqual(0);
				expect(point.y).toBeGreaterThanOrEqual(0);
				expect(point.x).toBeLessThanOrEqual(item.width);
				expect(point.y).toBeLessThanOrEqual(item.height);
			}
	}
}
function expectPairs(paper: RouteMapPaper) {
	const entries = paper.segment.items.flatMap((item) => item.continuations);
	for (const id of new Set(entries.map((entry) => entry.id))) {
		const pair = entries.filter((entry) => entry.id === id);
		expect(pair.map((entry) => entry.kind).sort()).toEqual(['entry', 'exit']);
		expect(pair[0].key).toBe(pair[1].key);
		expect(pair[0].from).toBe(pair[1].from);
		expect(pair[0].to).toBe(pair[1].to);
		expect(pair[0].stored).toEqual(pair[1].stored);
	}
}

function expectEmptyStage(paper: RouteMapPaper, stageId: string) {
	const signs = paper.segment.items.flatMap((item) =>
		item.signs
			.filter((sign) => sign.kind === 'empty-stage' && sign.stageId === stageId)
			.map((sign) => ({ item, sign }))
	);
	const labels = paper.segment.items.flatMap((item) =>
		item.stageLabels
			.filter((label) => label.stageId === stageId && label.hostId === null)
			.map((label) => ({ item, label }))
	);
	expect(signs).toHaveLength(1);
	expect(labels).toHaveLength(1);
	const { item, sign } = signs[0];
	expect(sign.stationId).toBeNull();
	expect(labels[0].item).toBe(item);
	const box = labels[0].label.box;
	for (const value of [
		item.width,
		item.height,
		sign.center.x,
		sign.center.y,
		sign.width,
		sign.height,
		box.x,
		box.y,
		box.w,
		box.h
	])
		expect(Number.isFinite(value)).toBe(true);
	expect(sign.center.x - sign.width / 2).toBeGreaterThanOrEqual(0);
	expect(sign.center.y - sign.height / 2).toBeGreaterThanOrEqual(0);
	expect(sign.center.x + sign.width / 2).toBeLessThanOrEqual(item.width);
	expect(sign.center.y + sign.height / 2).toBeLessThanOrEqual(item.height);
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.y).toBeGreaterThanOrEqual(0);
	expect(box.x + box.w).toBeLessThanOrEqual(item.width);
	expect(box.y + box.h).toBeLessThanOrEqual(item.height);
}

describe('Workflow Route map paper', () => {
	it('reserves heading and key rows and grows when the keys wrap', () => {
		const header = {
			heading: m.route_map_print_header_parents({
				panels: '9'.repeat(39) + '…',
				stages: 'W'.repeat(39) + '…',
				parents: 'W'.repeat(39) + '…'
			}),
			keyEntries: [
				'Stage journey',
				'Subtask route',
				'Station',
				'Transfer',
				'Cross-stage dependency',
				'Dependency cycle'
			],
			statusEntries: ['Todo', 'In progress', 'Done', 'Canceled'],
			readiness: 'Ready: all dependencies are finished. Blocked: a dependency is not finished.'
		};
		const measure = (text: string) => text.length * 7;
		const wide = routeMapPaperHeaderHeight(header, 900, measure);
		const narrow = routeMapPaperHeaderHeight(header, 180, measure);
		expect(wide).toBeGreaterThan(0);
		expect(narrow).toBeGreaterThan(wide);
	});

	it('uses the reserved header height for the panel body', () => {
		const plan = pinnedExamplePlan();
		const m = { ...exampleMetrics(), headerHeight: 130 };
		const paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), m);
		expect(paper.panels[0].id.endsWith(`:${usable(m).w}:${usable(m).h}`)).toBe(true);
	});

	it('wraps parent summaries and reserves their label and item height in both detail states', () => {
		const plan = pinnedExamplePlan();
		const text = '1 in progress and 1 done';
		for (const expanded of [false, true]) {
			const model = routeMapModel(
				plan,
				new Set(expanded ? ['task-1', 'task-8'] : []),
				indexTasks(plan.tasks)
			);
			const base = routeMapPaper(model, exampleMetrics());
			const withSummary = routeMapPaper(model, {
				...exampleMetrics(),
				summaryText: (id) => (id === 'task-1' ? text : '')
			});
			const item = withSummary.segment.items.find((entry) =>
				entry.stations.some((station) => station.id === 'task-1')
			)!;
			const station = item.stations.find((entry) => entry.id === 'task-1')!;
			const oldItem = base.segment.items.find((entry) =>
				entry.stations.some((station) => station.id === 'task-1')
			)!;
			const oldStation = oldItem.stations.find((entry) => entry.id === 'task-1')!;
			expect(station.summaryLines?.join(' ')).toBe(text);
			expect(station.summaryLines!.length).toBeGreaterThan(1);
			for (const line of station.summaryLines!)
				expect(exampleMetrics().measureText(line)).toBeLessThanOrEqual(station.labelBox.w);
			expect(station.labelBox.h).toBeGreaterThan(oldStation.labelBox.h);
			expect(item.height).toBeGreaterThanOrEqual(station.labelBox.y + station.labelBox.h);
		}
	});

	it('fits the garden with the computed header on A4 and Letter', () => {
		const plan = pinnedExamplePlan();
		const header = {
			heading: 'Route map',
			keyEntries: [
				'Stage journey',
				'Subtask route',
				'Station',
				'Transfer',
				'Cross-stage dependency',
				'Dependency cycle'
			],
			statusEntries: ['Todo', 'In progress', 'Done', 'Canceled'],
			readiness: 'Ready: all dependencies are finished. Blocked: a dependency is not finished.'
		};
		for (const letter of [false, true])
			for (const expanded of [false, true]) {
				const m = {
					...exampleMetrics(letter),
					headerHeight: routeMapPaperHeaderHeight(
						header,
						(letter ? 1056 : mm(297)) - 114,
						screenMetrics.measureText
					)
				};
				expect(m.headerHeight).toBeGreaterThan(66);
				const model = routeMapModel(
					plan,
					new Set(expanded ? ['task-1', 'task-8'] : []),
					indexTasks(plan.tasks)
				);
				const paper = routeMapPaper(model, {
					...m,
					summaryText: (id) =>
						id === 'task-1' ? '1 in progress and 1 done' : '1 ready and 1 blocked'
				});
				if (!expanded) expect(paper.segment.items).toHaveLength(1);
				const ids = paper.segment.items.flatMap((item) =>
					item.stations.map((station) => station.id)
				);
				expect(ids.sort()).toEqual(
					plan.tasks
						.filter((task) => expanded || !task.parentId)
						.map((task) => task.id)
						.sort()
				);
				if (expanded) expect(ids).toHaveLength(11);
				expectFits(paper, m);
			}
	});

	it('keeps an empty stage with its badge on a fitting panel', () => {
		const plan = makePlan(
			[task({ id: 'a' }), task({ id: 'b', dependsOn: ['a'] })],
			['s1', 'empty']
		);
		const paper = routeMapPaper(
			routeMapModel(plan, new Set(), indexTasks(plan.tasks)),
			exampleMetrics()
		);
		expect(paper.segment.items).toHaveLength(1);
		expectEmptyStage(paper, 'empty');
		expect(
			paper.segment.items.flatMap((item) => item.stations.map((station) => station.id)).sort()
		).toEqual(plan.tasks.map((task) => task.id).sort());
	});

	it('keeps an empty stage with its badge when an expanded family fragments', () => {
		const plan = makePlan(
			[
				task({ id: 'p' }),
				...Array.from({ length: 30 }, (_, i) => task({ id: `child-${i}`, parentId: 'p' }))
			],
			['s1', 'empty']
		);
		const m = { ...exampleMetrics(), sheetWidth: 420, sheetHeight: 380 };
		const paper = routeMapPaper(routeMapModel(plan, new Set(['p']), indexTasks(plan.tasks)), m);
		expect(paper.segment.items.some((item) => item.id.startsWith('row:'))).toBe(true);
		expectEmptyStage(paper, 'empty');
		expect(
			paper.segment.items.flatMap((item) => item.stations.map((station) => station.id)).sort()
		).toEqual(plan.tasks.map((task) => task.id).sort());
	});

	it('prints one placeholder and badge per stage when all stages are empty', () => {
		const plan = makePlan([], ['s1', 's2', 's3']);
		const paper = routeMapPaper(
			routeMapModel(plan, new Set(), indexTasks(plan.tasks)),
			exampleMetrics()
		);
		for (const stage of plan.stages) expectEmptyStage(paper, stage.id);
		expect(paper.segment.items.flatMap((item) => item.signs)).toHaveLength(3);
		expect(paper.segment.items.flatMap((item) => item.stageLabels)).toHaveLength(3);
		expect(paper.segment.items.flatMap((item) => item.stations)).toHaveLength(0);
	});

	it('prints equal empty transfer capsules for a child and a top-level task without termini', () => {
		const plan = makePlan(
			[
				task({ id: 'parent' }),
				task({ id: 'child', parentId: 'parent' }),
				task({ id: 'external', stageId: 's2', dependsOn: ['child'] })
			],
			['s1', 's2']
		);
		const paper = routeMapPaper(
			routeMapModel(plan, new Set(['parent']), indexTasks(plan.tasks)),
			metrics()
		);
		const signs = paper.segment.items.flatMap((item) => item.signs);
		expect(signs.map((sign) => sign.kind)).not.toContain('terminus');
		for (const id of ['child', 'external']) {
			const sign = signs.find((sign) => sign.stationId === id && sign.kind === 'interchange')!;
			expect([sign.width, sign.height]).toEqual([10, 20]);
			expect(sign).not.toHaveProperty('docks');
		}
	});

	it('groups four-by-four continuations into one marker per station and side', () => {
		const plan = makePlan(
			[
				...Array.from({ length: 4 }, (_, i) => task({ id: `a${i}`, title: 'A', stageId: 's1' })),
				...Array.from({ length: 4 }, (_, i) =>
					task({ id: `b${i}`, title: 'B', stageId: 's2', dependsOn: ['a0', 'a1', 'a2', 'a3'] })
				)
			],
			['s1', 's2']
		);
		const m = { ...metrics(), sheetWidth: 320 };
		const paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), m);
		expectFits(paper, m);
		expectPairs(paper);
		const items = paper.segment.items;
		const markers = items
			.flatMap((item) => item.markers ?? [])
			.filter((marker) => (marker as { relation?: string }).relation !== 'workflow');
		expect(markers).toHaveLength(8);
		expect(new Set(markers.map((m) => `${m.stationId}:${m.kind}`)).size).toBe(8);
		for (const marker of markers) {
			expect(marker.targets).toHaveLength(4);
			expect(marker.pairs).toHaveLength(4);
			for (const target of marker.targets) {
				expect(target.reference).toMatch(/^R\d+$/);
				expect(target.title).toBe(plan.tasks.find((t) => t.id === target.taskId)!.title);
			}
		}
		for (const c of items
			.flatMap((i) => i.continuations)
			.filter((c) => (c as { relation?: string }).relation !== 'workflow')) {
			expect(items.some((i) => i.stations.some((s) => s.id === c.stationId))).toBe(true);
			expect(
				markers.some(
					(m) =>
						m.stationId === c.stationId &&
						m.kind === c.kind &&
						m.pairs.some((p) => p.id === c.id && p.boundary === c.boundary && p.key === c.key)
				)
			).toBe(true);
		}
		for (const item of paper.segment.items) {
			if (item.markers?.length)
				expect(item.height).toBeGreaterThanOrEqual((item.markerY ?? 0) + item.markers.length * 10);
		}
	});

	it('keeps tall shared columns in one panel and splits track lanes without clamping', () => {
		const stages = Array.from({ length: 18 }, (_, i) => `stage-${i}`);
		const plan = makePlan(
			stages.map((stageId) => task({ id: stageId, stageId })),
			stages
		);
		const m = { ...metrics(), sheetHeight: 330 };
		const paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), m);
		expectFits(paper, m);
		expectPairs(paper);
		const stations = paper.segment.items.flatMap((i) => i.stations);
		const groups = Map.groupBy(stations, (s) => s.columnId);
		expect([...groups.values()].some((g) => g.length > 6)).toBe(true);
		for (const [columnId, members] of groups) {
			expect(paper.panels.filter((p) => p.columnIds.includes(columnId))).toHaveLength(1);
			expect(new Set(members.map((s) => s.id)).size).toBe(members.length);
		}
		expect(paper.segment.items.filter((i) => i.stations.length).length).toBeGreaterThan(1);
		expect(stations.map((s) => s.id).sort()).toEqual(plan.tasks.map((t) => t.id).sort());
	});

	it('preserves every oversized-title character in referenced legal continuation lines', () => {
		const titles = [
			'A very long title with spaces, punctuation and 漢字. '.repeat(240),
			'Unbroken漢字'.repeat(700)
		];
		const plan = makePlan(titles.map((title, i) => task({ id: `long-${i}`, title })));
		const m = metrics();
		const paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), m);
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
		const plan = makePlan([task({ id: 'multiline', title })]);
		const paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), metrics());
		const rows = paper.segment.items
			.flatMap((item) => item.titles)
			.filter((row) => row.taskId === 'multiline');
		expect(rows.slice(0, 2).map((row) => row.text)).toEqual(['First line', '']);
		expect(rows.every((row) => !row.text.includes('\n'))).toBe(true);
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
		const paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), m);
		expectFits(paper, m);
		expectPairs(paper);
		const continuations = paper.segment.items
			.flatMap((i) => i.continuations)
			.filter((c) => (c as { relation?: string }).relation !== 'workflow');
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
		const paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), m);
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
		const shuffledPlan = shuffled(plan);
		expect(
			routeMapPaper(routeMapModel(shuffledPlan, new Set(), indexTasks(shuffledPlan.tasks)), m)
		).toEqual(paper);
	}, 20000);
	it('wraps station labels between words when each word fits the label', () => {
		const plan = makePlan([task({ id: 'soil', title: 'Soil preparation' })]);
		const m = exampleMetrics();
		const paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), m);
		const station = paper.segment.items
			.flatMap((item) => item.stations)
			.find((s) => s.id === 'soil')!;
		expect(m.measureText('Soil preparation')).toBeGreaterThan(station.labelBox.w);
		expect(m.measureText('preparation')).toBeLessThanOrEqual(station.labelBox.w);
		expect(station.labelLines).toEqual(['Soil', 'preparation']);
	});

	it('breaks an overwide word within the label and preserves its full title in continuation rows', () => {
		const word = 'Supercalifragilisticexpialidocious';
		const title = word;
		const m = exampleMetrics();
		const plan = makePlan([task({ id: 'long-word', title })]);
		const paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), m);
		const station = paper.segment.items.flatMap((item) => item.stations)[0];
		expect(m.measureText(word)).toBeGreaterThan(station.labelBox.w);
		const capacity = Math.floor(station.labelBox.w / 7);
		const firstCapacity = Math.floor(
			(station.labelBox.w - m.measureText(station.reference) - 3 - 15) / 7
		);
		expect(station.labelLines).toEqual([
			word.slice(0, firstCapacity),
			word.slice(firstCapacity, firstCapacity + capacity)
		]);
		for (const line of station.labelLines)
			expect(m.measureText(line)).toBeLessThanOrEqual(station.labelBox.w);
		expect(
			paper.segment.items
				.flatMap((item) => item.titles)
				.map((row) => row.text)
				.join('')
		).toBe(title);
	});

	it('uses one named continuation for a dependency cut between whole panels', () => {
		const plan = makePlan(
			Array.from({ length: 6 }, (_, i) =>
				task({ id: `t${i}`, title: 'abcdefghijklm', dependsOn: i ? [`t${i - 1}`] : [] })
			)
		);
		const m = { ...exampleMetrics(), sheetWidth: 364 };
		const paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), m);
		expect(paper.panels).toHaveLength(3);
		const items = paper.segment.items.filter((item) => item.stations.length);
		expect(items.every((item) => item.id.startsWith('whole:'))).toBe(true);
		for (const item of items) {
			const local = new Set(item.stations.map((s) => s.id));
			for (const line of item.lines.filter((line) => line.dependencyKeys.length))
				expect(line.taskIds.every((id) => local.has(id))).toBe(true);
		}
		expectPairs(paper);
		expect(items.flatMap((item) => item.continuations)).toHaveLength(4);
	});

	it('reserves the reference code and its gap on the first label row', () => {
		const m = exampleMetrics();
		const plan = makePlan([task({ id: 'bounded', title: 'ABCDEFGHIJKLM' })]);
		const paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), m);
		const station = paper.segment.items.flatMap((item) => item.stations)[0];
		expect(
			m.measureText(station.reference) + 3 + 15 + m.measureText(station.labelLines[0])
		).toBeLessThanOrEqual(station.labelBox.w);
		expect(station.labelLines.join('')).toBe('ABCDEFGHIJKLM');
	});

	it('starts the second row with the next word when the first row is exactly full', () => {
		const m = exampleMetrics();
		const plan = makePlan([task({ id: 'exact', title: 'ABCDEFGHI preparation' })]);
		const paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), m);
		const station = paper.segment.items.flatMap((item) => item.stations)[0];
		expect(station.labelLines).toEqual(['ABCDEFGHI', 'preparation']);
	});

	it('preserves whitespace-only titles in the continuation rows without an empty loop', () => {
		const title = ' '.repeat(80);
		const m = exampleMetrics();
		const plan = makePlan([task({ id: 'spaces', title })]);
		const paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), m);
		expectFits(paper, m);
		expect(
			paper.segment.items
				.flatMap((item) => item.titles)
				.map((row) => row.text)
				.join('')
		).toBe(title);
	});

	it.each([
		['A4', false],
		['Letter', true]
	] as const)('keeps the workflow real example whole on %s', (_, letter) => {
		const plan = pinnedExamplePlan();
		const m = exampleMetrics(letter),
			paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), m);
		expect(paper.segment.items).toHaveLength(1);
		expect(paper.panels).toHaveLength(1);
		expectFits(paper, m);
		expect(paper.segment.items[0].stations).toHaveLength(7);
		expect(paper.segment.items[0].continuations).toEqual([]);
		expect(paper.segment.items[0].stageLabels).toHaveLength(3);
	});
	it('cuts a long dependency chain between whole columns without losing nodes or stored edges', () => {
		const plan = makePlan(
			Array.from({ length: 18 }, (_, i) => task({ id: `t${i}`, dependsOn: i ? [`t${i - 1}`] : [] }))
		);
		const m = { ...metrics(), sheetWidth: 440 },
			model = routeMapModel(plan, new Set(), indexTasks(plan.tasks)),
			paper = routeMapPaper(model, m);
		expect(paper.panels.length).toBeGreaterThan(1);
		expectFits(paper, m);
		expectPairs(paper);
		expect(paper.segment.items.flatMap((item) => item.stations.map((s) => s.id)).sort()).toEqual(
			plan.tasks.map((t) => t.id).sort()
		);
		for (const edge of model.edges) {
			const from = paper.segment.items.find((item) =>
				item.stations.some((s) => s.id === edge.from)
			)!;
			const to = paper.segment.items.find((item) => item.stations.some((s) => s.id === edge.to))!;
			expect(
				paper.segment.items.flatMap((item) => item.continuations).filter((c) => c.key === edge.key)
			).toHaveLength(from === to ? 0 : 2);
			if (from === to) expect(from.edges.filter((e) => e.key === edge.key)).toHaveLength(1);
		}
	});
	it('splits an over-height mixed-stage rank into legal row fragments rather than stage bands', () => {
		const plan = makePlan(
			[
				task({ id: 'source-root', stageId: 's1' }),
				task({ id: 'target-root', stageId: 's2', dependsOn: ['source-root'] }),
				...Array.from({ length: 10 }, (_, i) => [
					task({ id: `source-${i}`, stageId: 's1', dependsOn: ['source-root'] }),
					task({ id: `target-${i}`, stageId: 's2', dependsOn: [`source-${i}`, 'target-root'] })
				]).flat()
			],
			['s1', 's2']
		);
		const m = { ...exampleMetrics(), sheetHeight: 330 },
			paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), m);
		expect(
			routeMapLayout(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), { ...m, paper: true })
				.height
		).toBeGreaterThan(usable(m).h);
		expect(paper.segment.items.length).toBeGreaterThan(1);
		expectFits(paper, m);
		const nodes = paper.segment.items.flatMap((item) => item.stations);
		expect(nodes.map((s) => s.id).sort()).toEqual(plan.tasks.map((t) => t.id).sort());
		expect(
			paper.segment.items.some(
				(item) =>
					new Set(item.stations.map((s) => plan.tasks.find((t) => t.id === s.id)!.stageId)).size ===
					2
			)
		).toBe(true);
	});
	it('keeps workflow and dependency stubs with their own marker when both leave one station', () => {
		const plan = makePlan(
			[
				task({ id: 'A', start: '2027-01-01' }),
				task({ id: 'B', start: '2027-01-02' }),
				task({ id: 'X', stageId: 's2', dependsOn: ['A'] })
			],
			['s1', 's2']
		);
		const paper = routeMapPaper(routeMapModel(plan, new Set(), indexTasks(plan.tasks)), {
			...exampleMetrics(),
			sheetWidth: 214
		});
		const source = paper.segment.items.find((item) =>
			item.stations.some((station) => station.id === 'A')
		)!;
		const exits = (source.markers ?? []).filter(
			(marker) => marker.stationId === 'A' && marker.kind === 'exit'
		);
		expect(exits).toHaveLength(2);
		expect(new Set(exits.map((marker) => (marker as { relation?: string }).relation)).size).toBe(2);
		for (const item of paper.segment.items) {
			const keys = (item.markers ?? []).flatMap((marker) =>
				(marker.stubs ?? []).map((stub) => `${stub.id}:${stub.kind}`)
			);
			expect(new Set(keys).size).toBe(keys.length);
			for (const marker of item.markers ?? []) {
				expect((marker.stubs ?? []).map((stub) => stub.id).sort()).toEqual(
					marker.pairs.map((pair) => pair.id).sort()
				);
			}
		}
	});
	it('renders uncut workflow rails and pairs cut workflow stubs separately from dependency identities', () => {
		const plan = makePlan([
				task({ id: 'a', start: '2027-01-01' }),
				task({ id: 'b', start: '2027-01-02' }),
				task({ id: 'c', start: '2027-01-03' })
			]),
			model = routeMapModel(plan, new Set(), indexTasks(plan.tasks));
		const fitting = routeMapPaper(model, exampleMetrics());
		expect(fitting.segment.items).toHaveLength(1);
		expect(
			fitting.segment.items[0].lines
				.filter((line) => line.kind !== 'family')
				.map((line) => line.taskIds)
		).toEqual([
			['a', 'b'],
			['b', 'c']
		]);
		const cut = routeMapPaper(model, { ...metrics(), sheetWidth: 380 });
		expect(cut.panels.length).toBeGreaterThan(1);
		expectPairs(cut);
		const continuations = cut.segment.items.flatMap((item) => item.continuations);
		const itemFor = (id: string) =>
			cut.segment.items.find((item) => item.stations.some((station) => station.id === id))!.id;
		const cuts = [
			['a', 'b'],
			['b', 'c']
		].filter(([from, to]) => itemFor(from) !== itemFor(to));
		expect(cuts.length).toBeGreaterThan(0);
		expect(continuations).toHaveLength(cuts.length * 2);
		for (const continuation of continuations) {
			expect((continuation as { relation?: string }).relation).toBe('workflow');
			expect(continuation.stored).toEqual([]);
			expect(continuation.cycle).toBe(false);
		}
		expect(
			cut.segment.items
				.flatMap((item) => item.markers ?? [])
				.every((marker) => (marker as { relation?: string }).relation === 'workflow')
		).toBe(true);
	});
	it('keeps expanded family links distinct from dependency continuations and prints every child once', () => {
		const plan = makePlan([
			task({ id: 'p' }),
			...Array.from({ length: 30 }, (_, i) => task({ id: `child-${i}`, parentId: 'p' }))
		]);
		const m = { ...exampleMetrics(), sheetWidth: 420, sheetHeight: 380 },
			paper = routeMapPaper(routeMapModel(plan, new Set(['p']), indexTasks(plan.tasks)), m);
		expectFits(paper, m);
		expect(paper.segment.items.flatMap((item) => item.stations.map((s) => s.id)).sort()).toEqual(
			plan.tasks.map((t) => t.id).sort()
		);
		expect(paper.segment.items.flatMap((item) => item.edges)).toEqual([]);
		expect(
			paper.segment.items
				.flatMap((item) => item.continuations)
				.filter((c) => (c as { relation?: string }).relation !== 'workflow')
		).toEqual([]);
		const families = paper.segment.items
			.flatMap((item) => item.lines)
			.filter((line) => line.kind === 'family');
		expect(families.length).toBeGreaterThan(0);
		for (const line of families) {
			expect(line.width).toBe(3.5);
			expect(line.dependencyKeys).toEqual([]);
		}
	});
});
