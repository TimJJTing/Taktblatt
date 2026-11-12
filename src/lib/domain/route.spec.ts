import { describe, expect, it, vi } from 'vitest';
import { indexTasks } from './derive.ts';
import { dependencyRoute, isLitEdge, effectiveDependencyGraph, routeFocusModel } from './route.ts';
import * as derive from './derive.ts';
import { dependencyLines, ganttRows } from './gantt.ts';
import type { Task } from './schema.ts';
import { makeTask } from './test-helpers.ts';

describe('dependencyRoute', () => {
	it('follows a chain and both arms of a fork, excluding unrelated tasks and the focus', () => {
		const index = indexTasks([
			makeTask({ id: 'root' }),
			makeTask({ id: 'a', dependsOn: ['root'] }),
			makeTask({ id: 'b', dependsOn: ['root'] }),
			makeTask({ id: 'focus', dependsOn: ['a', 'b'] }),
			makeTask({ id: 'c', dependsOn: ['focus'] }),
			makeTask({ id: 'd', dependsOn: ['focus'] }),
			makeTask({ id: 'tail', dependsOn: ['c'] }),
			makeTask({ id: 'unrelated' })
		]);
		expect(dependencyRoute(index, 'focus')).toEqual({
			upstream: new Set(['root', 'a', 'b']),
			downstream: new Set(['c', 'd', 'tail'])
		});
	});

	it('terminates on a cycle and keeps the focus out of both sets', () => {
		const index = indexTasks([
			makeTask({ id: 'a', dependsOn: ['c'] }),
			makeTask({ id: 'b', dependsOn: ['a'] }),
			makeTask({ id: 'c', dependsOn: ['b'] })
		]);
		expect(dependencyRoute(index, 'a')).toEqual({
			upstream: new Set(['b', 'c']),
			downstream: new Set(['b', 'c'])
		});
	});

	it('traverses inherited parent edges in both directions for a subtask (ADR 6)', () => {
		const index = indexTasks([
			makeTask({ id: 'external' }),
			makeTask({ id: 'parent', dependsOn: ['external'] }),
			makeTask({ id: 'sibling', parentId: 'parent' }),
			makeTask({ id: 'child', parentId: 'parent', dependsOn: ['sibling'] })
		]);
		expect(dependencyRoute(index, 'child')).toEqual({
			upstream: new Set(['external', 'sibling']),
			downstream: new Set()
		});
		expect(dependencyRoute(index, 'external').downstream).toEqual(
			new Set(['parent', 'sibling', 'child'])
		);
	});
});

describe('isLitEdge', () => {
	it('lights each side of the focus but excludes an upstream-to-downstream shortcut', () => {
		const index = indexTasks([
			makeTask({ id: 'a' }),
			makeTask({ id: 'b', dependsOn: ['a'] }),
			makeTask({ id: 'focus', dependsOn: ['b'] }),
			makeTask({ id: 'c', dependsOn: ['focus', 'a'] }),
			makeTask({ id: 'd', dependsOn: ['c'] }),
			makeTask({ id: 'other' })
		]);
		const route = dependencyRoute(index, 'focus');
		for (const [from, to] of [
			['a', 'b'],
			['b', 'focus'],
			['focus', 'c'],
			['c', 'd']
		]) {
			expect(isLitEdge(route, 'focus', from, to)).toBe(true);
		}
		expect(isLitEdge(route, 'focus', 'a', 'c')).toBe(false);
		expect(isLitEdge(route, 'focus', 'other', 'c')).toBe(false);
	});
});

describe('routeFocusModel', () => {
	const win = { start: '2027-01-01', end: '2027-01-31' };
	const task = (id: string, partial: Partial<Task> = {}) =>
		makeTask({ id, start: '2027-01-02', end: '2027-01-05', ...partial });
	function fixture(tasks: Task[], expanded = false) {
		const index = indexTasks(tasks);
		const graph = effectiveDependencyGraph(index);
		const rows = ganttRows(index, ['s1'], () => expanded, win);
		const lines = dependencyLines(index, rows);
		return {
			index,
			graph,
			rows,
			lines,
			model: (id: string | null) => routeFocusModel(graph, index, rows, lines, id)
		};
	}

	it('activates isolated and undated focus without drawn connectors and rejects missing focus', () => {
		const f = fixture([
			task('isolated'),
			task('undated', { start: null, end: null }),
			task('dependent', { dependsOn: ['undated'] })
		]);
		for (const id of [null, 'missing']) {
			expect(f.model(id)).toEqual({
				active: false,
				onRouteRowIds: new Set(),
				litLineKeys: new Set()
			});
		}
		expect(f.model('isolated')).toEqual({
			active: true,
			onRouteRowIds: new Set(['isolated']),
			litLineKeys: new Set()
		});
		expect(f.lines).toEqual([]);
		expect(f.model('undated')).toEqual({
			active: true,
			onRouteRowIds: new Set(['undated', 'dependent']),
			litLineKeys: new Set()
		});
	});

	it('classifies each collapsed focus before union so opposite-side shortcuts stay unlit', () => {
		const f = fixture([
			task('up'),
			task('parent', { dependsOn: ['up'] }),
			task('child', { parentId: 'parent' }),
			task('down', { dependsOn: ['parent', 'child', 'up'] }),
			task('other')
		]);
		expect(f.model('parent')).toEqual({
			active: true,
			onRouteRowIds: new Set(['up', 'parent', 'down']),
			litLineKeys: new Set(['up->parent', 'parent->down'])
		});
	});

	it('unions distinct child routes and lights a merged source line if any real pair is lit', () => {
		const f = fixture([
			task('parent'),
			task('a', { parentId: 'parent' }),
			task('b', { parentId: 'parent' }),
			task('tailA', { dependsOn: ['a'] }),
			task('tailB', { dependsOn: ['b', 'a'] })
		]);
		expect(f.model('parent')).toEqual({
			active: true,
			onRouteRowIds: new Set(['parent', 'tailA', 'tailB']),
			litLineKeys: new Set(['parent->tailA', 'parent->tailB'])
		});
		// A hidden dialog task selects its own route. Its proxy must not add its sibling.
		expect(f.model('b')).toEqual({
			active: true,
			onRouteRowIds: new Set(['parent', 'tailB']),
			litLineKeys: new Set(['parent->tailB'])
		});
	});

	it('lights an inherited proxy line while hidden but cannot borrow it after expansion', () => {
		const tasks = [
			task('external'),
			task('parent', { dependsOn: ['external'] }),
			task('child', { parentId: 'parent' }),
			task('tail', { dependsOn: ['child'] })
		];
		expect(fixture(tasks).model('child')).toEqual({
			active: true,
			onRouteRowIds: new Set(['external', 'parent', 'tail']),
			litLineKeys: new Set(['external->parent', 'parent->tail'])
		});
		const expanded = fixture(tasks, true);
		expect(expanded.model('child')).toEqual({
			active: true,
			onRouteRowIds: new Set(['external', 'child', 'tail']),
			litLineKeys: new Set(['child->tail'])
		});
	});

	it('maps hidden incoming endpoints without adding omitted hidden-target connectors', () => {
		const f = fixture([
			task('external'),
			task('parent'),
			task('child', { parentId: 'parent', dependsOn: ['external'] }),
			task('tail', { dependsOn: ['child'] })
		]);
		expect(f.model('child')).toEqual({
			active: true,
			onRouteRowIds: new Set(['external', 'parent', 'tail']),
			litLineKeys: new Set(['parent->tail'])
		});
	});

	it('reuses the effective graph across projection calls and collapsed focus tasks', () => {
		const f = fixture([
			task('external'),
			task('parent', { dependsOn: ['external'] }),
			task('a', { parentId: 'parent' }),
			task('b', { parentId: 'parent' }),
			task('tail', { dependsOn: ['b'] })
		]);
		const reads = vi.spyOn(derive, 'effectiveDependencies');
		try {
			const first = f.model('parent');
			const second = f.model('b');
			expect([first.active, second.active]).toEqual([true, true]);
			expect(reads).not.toHaveBeenCalled();
			expect(f.graph.pairs).toEqual(
				expect.arrayContaining([
					['external', 'parent'],
					['external', 'a'],
					['external', 'b'],
					['b', 'tail']
				])
			);
		} finally {
			reads.mockRestore();
		}
	});
});
