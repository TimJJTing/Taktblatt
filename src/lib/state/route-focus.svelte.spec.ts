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
	const tick = (ms = 300) => vi.advanceTimersByTime(ms);
	const index = indexTasks(['a', 'b', 'child'].map((id) => makeTask({ id })));

	it('ignores cold sweeps shorter than 300 ms and activates only after a full rest', () => {
		for (const id of ['a', 'b', 'child']) {
			route.hoverEnter(id, `bar-${id}`);
			tick(299);
			expect(route.resolve()).toBeNull();
			route.hoverLeave(`bar-${id}`);
		}
		tick(1000);
		expect(route.resolve()).toBeNull();
		route.hoverEnter('a', 'bar-a');
		tick(299);
		expect(route.resolve()).toBeNull();
		tick(1);
		expect(route.resolve()).toBe('a');
	});

	it('hands off a shown hover after 80 ms without ever clearing the resolved route', () => {
		route.hoverEnter('a', 'bar-a');
		tick();
		expect(route.resolve()).toBe('a');
		route.hoverLeave('bar-a');
		route.hoverEnter('b', 'bar-b');
		for (let ms = 0; ms < 80; ms++) {
			expect(route.resolve()).toBe('a');
			tick(1);
		}
		expect(route.resolve()).toBe('b');
		// The previous leave must not clear the accepted target later.
		tick(250);
		expect(route.resolve()).toBe('b');
	});

	it('uses a cold rest when keyboard priority hid the previous hover', () => {
		route.focusEnter('a', 'row-a', 'keyboard');
		route.hoverEnter('b', 'bar-b');
		tick();
		expect(route.resolve()).toBe('a');
		route.hoverEnter('child', 'bar-child');
		tick(80);
		route.focusLeave('row-a');
		// Releasing keyboard priority must not reveal an early warm activation.
		expect(route.resolve()).toBe('b');
		tick(219);
		expect(route.resolve()).toBe('b');
		tick(1);
		expect(route.resolve()).toBe('child');
	});

	it('keeps leave grace active over pointer row focus for 250 ms', () => {
		route.focusEnter('b', 'row-b', 'pointer');
		route.hoverEnter('a', 'bar-a');
		tick();
		route.hoverLeave('bar-a');
		expect(route.resolve()).toBe('a');
		tick(249);
		expect(route.resolve()).toBe('a');
		tick(1);
		expect(route.resolve()).toBe('b');
	});

	it('re-arms a waiting target with a full cold rest when grace expires first', () => {
		route.hoverEnter('a', 'bar-a');
		tick();
		route.hoverLeave('bar-a');
		tick(220);
		route.hoverEnter('b', 'bar-b');
		tick(29);
		expect(route.resolve()).toBe('a');
		tick(1);
		expect(route.resolve()).toBeNull();
		// The canceled warm timer would have expired 50 ms into the new rest.
		tick(299);
		expect(route.resolve()).toBeNull();
		tick(1);
		expect(route.resolve()).toBe('b');
	});

	it('cancels replaced intent without accepting stale token events', () => {
		route.hoverEnter('a', 'old');
		tick(200);
		route.hoverEnter('b', 'new');
		route.hoverLeave('old');
		tick(100);
		expect(route.resolve()).toBeNull();
		tick(199);
		expect(route.resolve()).toBeNull();
		tick(1);
		expect(route.resolve()).toBe('b');
		route.hoverLeave('old');
		tick(250);
		expect(route.resolve()).toBe('b');
	});

	it('clears grace and waiting intent at once on Esc without a late activation', () => {
		route.hoverEnter('a', 'bar-a');
		tick();
		route.hoverLeave('bar-a');
		route.hoverEnter('b', 'bar-b');
		route.clearPointer();
		expect(route.resolve()).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
		tick(1000);
		expect(route.resolve()).toBeNull();
		// Clearing must also remove warmth.
		route.hoverEnter('b', 'bar-b');
		tick(299);
		expect(route.resolve()).toBeNull();
		tick(1);
		expect(route.resolve()).toBe('b');
	});

	it('keeps running grace when focus or touch arrives, then expires it on schedule', () => {
		route.hoverEnter('a', 'bar-a');
		tick();
		route.hoverLeave('bar-a');
		tick(100);
		route.focusEnter('b', 'row-b', 'pointer');
		expect(route.resolve()).toBe('a');
		route.toggleTouch('child', 'child-mark');
		expect(route.resolve()).toBe('child');
		route.toggleTouch('child', 'child-mark');
		expect(route.resolve()).toBe('a');
		tick(149);
		expect(route.resolve()).toBe('a');
		tick(1);
		expect(route.resolve()).toBe('b');
	});

	it('clears a removed hover row and both timers without grace even when its task remains', () => {
		route.hoverEnter('child', 'bar-child');
		tick();
		expect(route.resolve()).toBe('child');
		route.hoverLeave('bar-child');
		route.hoverEnter('child', 'label-child');
		route.reconcile(index, new Set(['a', 'b']));
		expect(route.resolve()).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
		tick(1000);
		expect(route.resolve()).toBeNull();
		route.hoverEnter('b', 'bar-b');
		tick(299);
		expect(route.resolve()).toBeNull();
		tick(1);
		expect(route.resolve()).toBe('b');
	});

	it('cancels grace and pending hand-off on plan switch without restoring reused ids', () => {
		route.reset('first');
		route.hoverEnter('a', 'bar-a');
		tick();
		expect(route.resolve()).toBe('a');
		route.hoverLeave('bar-a');
		route.hoverEnter('b', 'bar-b');
		route.reset('second');
		expect(route.resolve()).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
		tick(1000);
		expect(route.resolve()).toBeNull();
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

	it('lets hover override pointer row focus and restores that row after grace', () => {
		route.focusEnter('a', 'row-a', 'pointer');
		expect(route.resolve()).toBe('a');
		route.hoverEnter('b', 'bar-b');
		tick();
		expect(route.resolve()).toBe('b');
		route.hoverLeave('bar-b');
		tick(250);
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
		tick(250);
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

	it('keeps pointer priority through a same-row edit return and repeated focus reports', () => {
		const row = document.createElement('tr');
		row.dataset.taskId = 'a';
		const field = document.createElement('input');
		const display = document.createElement('button');
		row.append(field, display);
		route.pointerInput('mouse');
		route.resolveFocus(field);
		route.keyboardInput('Escape', field);
		route.lastPointerType = null;
		route.clearPointer();
		field.remove();
		route.resolveFocus(display);
		route.resolveFocus(display);
		route.hoverEnter('b', 'bar-b');
		tick();
		expect(route.resolve()).toBe('b');
		route.hoverLeave('bar-b');
		tick(250);
		expect(route.resolve()).toBe('a');
	});

	it('promotes a same-row Tab transfer only after focus reaches another field', () => {
		const row = document.createElement('tr');
		row.dataset.taskId = 'a';
		const first = document.createElement('button');
		const second = document.createElement('input');
		row.append(first, second);
		route.pointerInput('mouse');
		route.resolveFocus(first);
		route.keyboardInput('Tab', first);
		route.lastPointerType = null;
		route.resolveFocus(first);
		route.hoverEnter('b', 'bar-b');
		tick();
		expect(route.resolve()).toBe('b');
		route.resolveFocus(second, false, first);
		route.resolveFocus(second, false, first);
		expect(route.resolve()).toBe('a');
		route.hoverLeave('bar-b');
		route.keyboardInput('Tab', second);
		route.pointerInput('mouse');
		route.resolveFocus(first, false, second);
		route.hoverEnter('b', 'bar-b');
		tick();
		expect(route.resolve()).toBe('b');
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

	it('disposes active input, leave grace and pending intent without a late activation', () => {
		route.toggleTouch('a', 'bar-a');
		expect(route.resolve()).toBe('a');
		route.hoverEnter('child', 'bar-child');
		tick();
		expect(route.resolve()).toBe('child');
		route.hoverLeave('bar-child');
		route.hoverEnter('b', 'pending');
		route.dispose();
		tick();
		expect(route.resolve()).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});
});
