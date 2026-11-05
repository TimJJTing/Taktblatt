import { describe, expect, it } from 'vitest';
import { losesWork } from './language-reload.svelte';

const none = { canUndo: false, canRedo: false, editingText: false, dialogOpen: false };

describe('losesWork', () => {
	it('is false when nothing would be dropped', () => {
		expect(losesWork(none)).toBe(false);
	});

	it.each(['canUndo', 'canRedo', 'editingText', 'dialogOpen'] as const)('is true for %s', (key) => {
		expect(losesWork({ ...none, [key]: true })).toBe(true);
	});
});
