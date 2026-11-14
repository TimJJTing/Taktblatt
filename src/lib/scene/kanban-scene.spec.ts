import { describe, expect, it } from 'vitest';
import { indexTasks } from '#lib/domain/derive.ts';
import { effectiveDependencyGraph, lineKey, routeFocusModel } from '#lib/domain/route.ts';
import type { Plan } from '#lib/domain/schema.ts';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { kanbanBoard, kanbanEdges } from './kanban-board.ts';
import { isolatedParent, kanbanTask, unrelatedCycle } from './kanban-fixtures.test-helper.ts';
import { kanbanScene, type KanbanCardGeometry, type KanbanRect } from './kanban-scene.ts';

const viewport: KanbanRect = { x: 0, y: 40, w: 600, h: 600 };

function scene(
	plan: Plan,
	focusId: string | null,
	geometry?: Map<string, KanbanCardGeometry>,
	clip = viewport
) {
	const index = indexTasks(plan.tasks);
	const cardIds = kanbanBoard(plan).columns.flatMap((column) =>
		column.cards.map((card) => card.id)
	);
	const edges = kanbanEdges(index, new Set(cardIds));
	const route = routeFocusModel(
		effectiveDependencyGraph(index),
		index,
		cardIds.map((id) => ({ id, isParent: false, expanded: false })),
		edges,
		focusId
	);
	const cards =
		geometry ??
		new Map(
			cardIds.map((id, i) => [
				id,
				{
					box: { x: 40 + (i % 2) * 260, y: 70 + Math.floor(i / 2) * 160, w: 180, h: 100 },
					station: { x: 40 + (i % 2) * 260, y: 90 + Math.floor(i / 2) * 160 }
				}
			])
		);
	return { route, result: kanbanScene({ edges, route, cards, viewport: clip }) };
}

describe('Kanban route visibility', () => {
	it('hides every edge at rest and hides unrelated cycle warnings during the A route', () => {
		const plan = unrelatedCycle();
		const resting = scene(plan, null).result;
		expect(resting.paths).toEqual([]);
		expect([...resting.dimmedCardIds]).toEqual([]);
		const active = scene(plan, 'A').result;
		expect(active.paths.map((path) => path.key)).toEqual([lineKey('A', 'B')]);
		expect(active.paths[0].cycle).toBe(false);
		expect([...active.litCardIds].sort()).toEqual(['A', 'B']);
		expect([...active.dimmedCardIds].sort()).toEqual(['X', 'Y']);
		const cycle = scene(plan, 'X').result;
		expect(cycle.paths.map((path) => path.key).sort()).toEqual([
			lineKey('X', 'Y'),
			lineKey('Y', 'X')
		]);
		expect(cycle.paths.every((path) => path.cycle)).toBe(true);
		expect([...cycle.litCardIds].sort()).toEqual(['X', 'Y']);
	});

	it.each([false, true])(
		'keeps isolated parent input active without a child-route union (child edge: %s)',
		(withEdge) => {
			const { route, result } = scene(isolatedParent(withEdge), 'P');
			expect(route.active).toBe(true);
			expect([...result.litCardIds]).toEqual([]);
			expect([...result.dimmedCardIds].sort()).toEqual(['C1', 'C2', 'U']);
			expect(result.paths).toEqual([]);
		}
	);

	it('excludes a shortcut joining opposite sides of a focused route', () => {
		const plan = makePlan([
			kanbanTask('up'),
			kanbanTask('focus', { dependsOn: ['up'] }),
			kanbanTask('down', { dependsOn: ['focus', 'up'] })
		]);
		expect(
			scene(plan, 'focus')
				.result.paths.map((path) => path.key)
				.sort()
		).toEqual([lineKey('focus', 'down'), lineKey('up', 'focus')]);
	});
});

describe('Kanban connector geometry', () => {
	it('attaches orthogonal paths to station points and routes outside opaque card interiors', () => {
		const plan = makePlan([
			kanbanTask('A'),
			kanbanTask('B', { dependsOn: ['A'] }),
			kanbanTask('U')
		]);
		const cards = new Map<string, KanbanCardGeometry>([
			['A', { box: { x: 40, y: 70, w: 180, h: 100 }, station: { x: 40, y: 90 } }],
			['B', { box: { x: 300, y: 250, w: 180, h: 100 }, station: { x: 300, y: 270 } }],
			['U', { box: { x: 40, y: 250, w: 180, h: 100 }, station: { x: 40, y: 270 } }]
		]);
		const path = scene(plan, 'A', cards).result.paths[0];
		expect(path).toMatchObject({ key: lineKey('A', 'B'), from: 'A', to: 'B' });
		expect(path.points[0]).toEqual(cards.get('A')!.station);
		expect(path.points.at(-1)).toEqual(cards.get('B')!.station);
		expect(path.points.length).toBeGreaterThanOrEqual(2);
		for (let i = 1; i < path.points.length; i++) {
			const a = path.points[i - 1],
				b = path.points[i];
			expect(a.x === b.x || a.y === b.y).toBe(true);
			expect([a.x, a.y, b.x, b.y].every(Number.isFinite)).toBe(true);
			for (const { box } of cards.values()) {
				const crosses =
					a.x === b.x
						? a.x > box.x &&
							a.x < box.x + box.w &&
							Math.max(a.y, b.y) > box.y &&
							Math.min(a.y, b.y) < box.y + box.h
						: a.y > box.y &&
							a.y < box.y + box.h &&
							Math.max(a.x, b.x) > box.x &&
							Math.min(a.x, b.x) < box.x + box.w;
				expect(crosses, `segment ${i} enters a card`).toBe(false);
			}
		}
	});

	it.each([
		{ x: 40, y: -120, w: 180, h: 100 },
		{ x: 40, y: 650, w: 180, h: 100 },
		{ x: -200, y: 70, w: 180, h: 100 },
		{ x: 610, y: 70, w: 180, h: 100 }
	])('suppresses an edge when an endpoint is wholly outside the viewport: %o', (box) => {
		const plan = makePlan([kanbanTask('A'), kanbanTask('B', { dependsOn: ['A'] })]);
		const cards = new Map<string, KanbanCardGeometry>([
			['A', { box, station: { x: box.x, y: box.y + 20 } }],
			['B', { box: { x: 300, y: 70, w: 180, h: 100 }, station: { x: 300, y: 90 } }]
		]);
		const result = scene(plan, 'A', cards).result;
		expect(result.paths).toEqual([]);
		expect([...result.litCardIds].sort()).toEqual(['A', 'B']);
	});

	it('keeps a partially visible endpoint eligible instead of treating it as wholly offscreen', () => {
		const plan = makePlan([kanbanTask('A'), kanbanTask('B', { dependsOn: ['A'] })]);
		const cards = new Map<string, KanbanCardGeometry>([
			['A', { box: { x: -20, y: 70, w: 180, h: 100 }, station: { x: -20, y: 90 } }],
			['B', { box: { x: 300, y: 70, w: 180, h: 100 }, station: { x: 300, y: 90 } }]
		]);
		expect(scene(plan, 'A', cards).result.paths.map((path) => path.key)).toEqual([
			lineKey('A', 'B')
		]);
	});

	it('recomputes paths from scrolled geometry, retaining edge identity when it returns', () => {
		const plan = makePlan([kanbanTask('A'), kanbanTask('B', { dependsOn: ['A'] })]);
		const initial = scene(plan, 'A').result.paths[0];
		const clipped = scene(plan, 'A', undefined, { x: 0, y: 300, w: 600, h: 200 });
		expect(clipped.result.paths).toEqual([]);
		const returned = scene(plan, 'A').result.paths[0];
		expect(returned.key).toBe(initial.key);
		expect(returned.points).toEqual(initial.points);
	});
});
