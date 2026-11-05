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

	it('returns null for undo, redo, peek and drop without steps', () => {
		const h = new History<number>();
		expect(h.canUndo).toBe(false);
		expect(h.canRedo).toBe(false);
		expect(h.undo(1)).toBeNull();
		expect(h.redo(1)).toBeNull();
		expect(h.peek()).toBeNull();
		expect(h.drop()).toBeNull();
		expect(h.canRedo).toBe(false);
	});

	it('does not change the redo stack when undo has no step', () => {
		const h = new History<number>();
		h.record(1);
		h.undo(2);
		h.undo(1);
		expect(h.redo(1)).toBe(2);
		expect(h.canRedo).toBe(false);
	});

	it('keeps the redo stack within the limit after a full undo and redo', () => {
		const h = new History<number>(2);
		[1, 2, 3].forEach((n) => h.record(n));
		expect(h.undo(4)).toBe(3);
		expect(h.undo(3)).toBe(2);
		expect(h.redo(2)).toBe(3);
		expect(h.redo(3)).toBe(4);
		expect(h.canRedo).toBe(false);
		expect(h.undo(4)).toBe(3);
	});

	it('peeks the newest step without a change', () => {
		const h = new History<number>();
		h.record(1);
		h.record(2);
		expect(h.peek()).toBe(2);
		expect(h.peek()).toBe(2);
		expect(h.undo(3)).toBe(2);
	});

	it('clears both stacks', () => {
		const h = new History<number>();
		h.record(1);
		h.record(2);
		h.undo(3);
		h.clear();
		expect(h.canUndo).toBe(false);
		expect(h.canRedo).toBe(false);
	});

	it('uses a limit of 50 steps by default', () => {
		const h = new History<number>();
		for (let n = 0; n < 60; n += 1) h.record(n);
		let steps = 0;
		while (h.undo(-1) !== null) steps += 1;
		expect(steps).toBe(50);
	});
});
