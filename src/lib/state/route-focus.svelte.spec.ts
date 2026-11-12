import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexTasks } from '#lib/domain/derive.ts';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { RouteFocusState } from './route-focus.svelte.ts';

describe('RouteFocusState', () => {
	let route: RouteFocusState;
	beforeEach(() => {
		vi.useFakeTimers();
		route = new RouteFocusState();
	});
	afterEach(() => {
		route.dispose();
		vi.clearAllTimers();
		vi.useRealTimers();
	});
	const tick = (ms = 120) => vi.advanceTimersByTime(ms);
	const index = indexTasks(['a', 'b', 'child'].map((id) => makeTask({ id })));

	it('accepts pointer intent at 120 ms and clears membership immediately on leave', () => {
		route.hoverEnter('a', 'bar-a');
		tick(119);
		expect(route.resolve()).toBeNull();
		tick(1);
		expect(route.resolve()).toBe('a');
		route.hoverLeave('bar-a');
		expect(route.resolve()).toBeNull();
	});

	it('cancels leave-before-intent and replaces timers without accepting stale token events', () => {
		route.hoverEnter('a', 'old');
		tick(80);
		route.hoverLeave('old');
		tick();
		expect(route.resolve()).toBeNull();
		route.hoverEnter('a', 'old');
		tick(80);
		route.hoverEnter('b', 'new');
		route.hoverLeave('old');
		tick(40);
		expect(route.resolve()).toBeNull();
		tick(80);
		expect(route.resolve()).toBe('b');
		route.hoverLeave('old');
		expect(route.resolve()).toBe('b');
	});

	it('toggles touch immediately, ignores touch leave, and replaces it with another mark', () => {
		route.hoverEnter('b', 'pending');
		route.toggleTouch('a', 'a-mark');
		route.hoverLeave('a-mark', 'touch');
		route.hoverEnter('b', 'touch-entry', 'touch');
		tick();
		expect(route.resolve()).toBe('a');
		route.toggleTouch('a', 'a-mark');
		expect(route.resolve()).toBeNull();
		route.toggleTouch('a', 'a-mark');
		route.toggleTouch('b', 'b-mark');
		expect(route.resolve()).toBe('b');
		route.clearPointer();
		expect(route.resolve()).toBeNull();
	});

	it('keeps keyboard priority over newer hover and touch while retaining valid fallback', () => {
		route.focusEnter('a', 'field-a', 'keyboard');
		route.hoverEnter('b', 'bar-b');
		tick();
		route.toggleTouch('child', 'child-mark');
		expect(route.resolve()).toBe('a');
		route.focusLeave('field-a');
		expect(route.resolve()).toBe('child');
	});

	it('lets hover override pointer row focus and restores that row on leave', () => {
		route.focusEnter('a', 'row-a', 'pointer');
		expect(route.resolve()).toBe('a');
		route.hoverEnter('b', 'bar-b');
		tick();
		expect(route.resolve()).toBe('b');
		route.hoverLeave('bar-b');
		expect(route.resolve()).toBe('a');
	});

	it('orders low-priority input when accepted rather than when a hover timer starts', () => {
		route.hoverEnter('a', 'bar-a');
		tick(60);
		route.lastPointerType = 'mouse';
		route.focusEnter('b', 'row-b', 'pointer');
		// Focus cancels the pending intent. A fresh hover can override the row.
		tick();
		expect(route.resolve()).toBe('b');
		route.hoverEnter('a', 'bar-a');
		tick();
		expect(route.resolve()).toBe('a');
		route.toggleTouch('child', 'child-mark');
		expect(route.resolve()).toBe('child');
	});

	it('updates a same-row focus cause only when a new focus input occurs', () => {
		route.focusEnter('a', 'row-a', 'pointer');
		route.lastPointerType = null;
		route.hoverEnter('b', 'bar-b');
		tick();
		expect(route.resolve()).toBe('b');
		route.focusEnter('a', 'row-a', 'keyboard');
		expect(route.resolve()).toBe('a');
		route.hoverLeave('bar-b');
		route.focusLeave('old-row');
		expect(route.resolve()).toBe('a');
	});

	it('preserves both focus causes when Esc clears hover, touch and pending intent', () => {
		for (const cause of ['pointer', 'keyboard'] as const) {
			route.focusEnter('a', 'row-a', cause);
			route.toggleTouch('b', 'b-mark');
			route.hoverEnter('child', 'pending');
			route.lastPointerType = null;
			route.clearPointer();
			tick();
			expect(route.resolve()).toBe('a');
			route.focusLeave('row-a');
			expect(route.resolve()).toBeNull();
		}
	});

	it('invalidates removed row tokens even when tasks remain, and undo does not restore them', () => {
		route.focusEnter('child', 'row-child', 'keyboard');
		expect(route.resolve()).toBe('child');
		route.reconcile(index, new Set(['a', 'b']));
		expect(route.resolve()).toBeNull();
		route.reconcile(index, new Set(['a', 'b', 'child']));
		expect(route.resolve()).toBeNull();
		route.hoverEnter('child', 'bar-child');
		route.reconcile(index, new Set(['a', 'b']));
		tick();
		expect(route.resolve()).toBeNull();
		route.toggleTouch('child', 'bar-child');
		expect(route.resolve()).toBe('child');
		route.reconcile(index, new Set(['a', 'b']));
		expect(route.resolve()).toBeNull();
	});

	it('clears removed task intent and touch, without reviving them after undo', () => {
		route.toggleTouch('a', 'bar-a');
		expect(route.resolve()).toBe('a');
		route.reconcile(indexTasks([makeTask({ id: 'b' })]), new Set(['b']));
		expect(route.resolve()).toBeNull();
		route.hoverEnter('a', 'bar-a');
		route.reconcile(indexTasks([makeTask({ id: 'b' })]), new Set(['b']));
		route.reconcile(index, new Set(['a', 'b', 'child']));
		tick();
		expect(route.resolve()).toBeNull();
	});

	it('resets all input on plan switch even when task ids are reused', () => {
		route.reset('first');
		route.focusEnter('a', 'row-a', 'keyboard');
		expect(route.resolve()).toBe('a');
		route.hoverEnter('b', 'pending');
		route.reset('second');
		tick();
		expect(route.resolve()).toBeNull();
	});

	it('disposes pending intent and active input without a late activation', () => {
		route.toggleTouch('a', 'bar-a');
		expect(route.resolve()).toBe('a');
		route.hoverEnter('b', 'pending');
		route.dispose();
		tick();
		expect(route.resolve()).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});
});
