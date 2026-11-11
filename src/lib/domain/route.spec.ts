import { describe, expect, it } from 'vitest';
import { indexTasks } from './derive.ts';
import { dependencyRoute, isLitEdge } from './route.ts';
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
