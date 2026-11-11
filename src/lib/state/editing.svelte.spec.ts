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
