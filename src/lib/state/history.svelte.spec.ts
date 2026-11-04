import { describe, expect, it } from 'vitest';
import { History } from './history.svelte';

describe('History', () => {
	it('undoes and redoes in order', () => {
		const h = new History<number>();
		h.record(1);
		h.record(2);
		expect(h.undo(3)).toBe(2);
		expect(h.undo(2)).toBe(1);
		expect(h.undo(1)).toBeNull();
		expect(h.redo(1)).toBe(2);
		expect(h.redo(2)).toBe(3);
	});

	it('clears the redo stack on a new commit', () => {
		const h = new History<number>();
		h.record(1);
		h.undo(2);
		h.record(5);
		expect(h.canRedo).toBe(false);
	});

	it('keeps only the newest steps', () => {
		const h = new History<number>(2);
		[1, 2, 3].forEach((n) => h.record(n));
		expect(h.undo(4)).toBe(3);
		expect(h.undo(3)).toBe(2);
		expect(h.undo(2)).toBeNull();
	});

	it('clears the redo stack when it drops the newest step', () => {
		const h = new History<number>();
		h.record(1);
		h.record(2);
		h.record(3);
		expect(h.undo(4)).toBe(3);
		expect(h.canRedo).toBe(true);
		expect(h.drop()).toBe(2);
		expect(h.peek()).toBe(1);
		expect(h.canRedo).toBe(false);
		expect(h.redo(2)).toBeNull();
	});
});
