import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditingState, FLASH_MS } from './editing.svelte.ts';

describe('EditingState', () => {
	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it('starts with empty transient state and runs a single flash lifecycle', () => {
		vi.useFakeTimers();
		const editing = new EditingState();
		expect(editing.newTaskId).toBeNull();
		expect(editing.newRemarkSectionId).toBeNull();
		expect(editing.highlightId).toBeNull();
		expect(editing.routeId).toBeNull();
		expect(editing.flashId).toBeNull();

		editing.flash('t1');
		expect(editing.flashId).toBeNull();

		vi.advanceTimersByTime(40);
		expect(editing.flashId).toBe('t1');

		vi.advanceTimersByTime(FLASH_MS + 50);
		expect(editing.flashId).toBeNull();
	});

	it('opens task details and records the return-focus element', () => {
		const editing = new EditingState();
		const trigger = {} as HTMLElement;
		editing.openDetails('t1', trigger);
		expect(editing.detailsTaskId).toBe('t1');
		expect(editing.detailsReturnFocus).toBe(trigger);

		editing.openDetails('t2', null);
		expect(editing.detailsTaskId).toBe('t2');
		expect(editing.detailsReturnFocus).toBeNull();
	});

	it('cancels an earlier flash when a new flash starts before or during the timeout', () => {
		vi.useFakeTimers();
		const editing = new EditingState();

		// Rapid call before the next frames complete: only the second flash activates.
		editing.flash('t1');
		editing.flash('t2');
		expect(editing.flashId).toBeNull();

		vi.advanceTimersByTime(40);
		expect(editing.flashId).toBe('t2');

		// Start a new flash while 't2' is active partway through its timer.
		vi.advanceTimersByTime(500);
		expect(editing.flashId).toBe('t2');

		editing.flash('t3');
		expect(editing.flashId).toBeNull();

		vi.advanceTimersByTime(40);
		expect(editing.flashId).toBe('t3');

		// Passing the time when 't2' would have expired must not clear 't3'.
		vi.advanceTimersByTime(800);
		expect(editing.flashId).toBe('t3');

		// Completing the full duration for 't3' clears flashId.
		vi.advanceTimersByTime(FLASH_MS);
		expect(editing.flashId).toBeNull();
	});
});

describe('EditingState route ownership', () => {
	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it('gives the dialog priority, clears pointer fallback and ignores pointer input while open', () => {
		vi.useFakeTimers();
		const editing = new EditingState();
		editing.routeFocus.focusEnter('field', 'row-field', 'keyboard');
		editing.routeFocus.toggleTouch('touch', 'touch-mark');
		editing.routeFocus.hoverEnter('pending', 'pending-mark');
		editing.openDetails('dialog', null);
		expect(editing.routeId).toBe('dialog');
		editing.routeFocus.hoverEnter('other', 'other-mark');
		editing.routeFocus.toggleTouch('other', 'other-mark');
		vi.advanceTimersByTime(300);
		expect(editing.routeId).toBe('dialog');
		editing.detailsTaskId = null;
		expect(editing.routeId).toBe('field');
		editing.routeFocus.focusLeave('row-field');
		expect(editing.routeId).toBeNull();
	});

	it('cancels an unopened hover intent so closing details cannot activate it later', () => {
		vi.useFakeTimers();
		const editing = new EditingState();
		editing.routeFocus.hoverEnter('pending', 'pending-mark');
		vi.advanceTimersByTime(299);
		editing.openDetails('dialog', null);
		expect(editing.routeId).toBe('dialog');
		editing.detailsTaskId = null;
		vi.advanceTimersByTime(500);
		expect(editing.routeId).toBeNull();
	});

	it('clears shown hover, leave grace and a pending hand-off when details open', () => {
		vi.useFakeTimers();
		const editing = new EditingState();
		editing.routeFocus.hoverEnter('shown', 'bar-shown');
		vi.advanceTimersByTime(300);
		expect(editing.routeId).toBe('shown');
		editing.routeFocus.hoverLeave('bar-shown');
		editing.routeFocus.hoverEnter('waiting', 'bar-waiting');
		editing.openDetails('dialog', null);
		expect(editing.routeId).toBe('dialog');
		expect(vi.getTimerCount()).toBe(0);
		editing.detailsTaskId = null;
		expect(editing.routeId).toBeNull();
		vi.advanceTimersByTime(1000);
		expect(editing.routeId).toBeNull();
		editing.routeFocus.hoverEnter('waiting', 'bar-waiting');
		vi.advanceTimersByTime(299);
		expect(editing.routeId).toBeNull();
		vi.advanceTimersByTime(1);
		expect(editing.routeId).toBe('waiting');
	});

	it('resolves route input independently of the immediate linked highlight', () => {
		vi.useFakeTimers();
		const editing = new EditingState();
		editing.highlightId = 'linked';
		editing.routeFocus.hoverEnter('route', 'bar-route');
		expect(editing.highlightId).toBe('linked');
		vi.advanceTimersByTime(300);
		expect(editing.routeId).toBe('route');
		expect(editing.highlightId).toBe('linked');
		editing.routeFocus.clearPointer();
		expect(editing.routeId).toBeNull();
		expect(editing.highlightId).toBe('linked');
	});
});
