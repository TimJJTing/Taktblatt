import { describe, expect, it } from 'vitest';
import { reconcileKeys } from './bullet-keys.ts';

describe('reconcileKeys', () => {
	it('keeps the keys when nothing changes', () => {
		expect(reconcileKeys(['a', 'b'], ['1', '2'], ['a', 'b'])).toEqual(['1', '2']);
	});

	it('keeps the key of an edited bullet', () => {
		expect(reconcileKeys(['a', 'b', 'c'], ['1', '2', '3'], ['a', 'x', 'c'])).toEqual([
			'1',
			'2',
			'3'
		]);
	});

	it('moves the keys when a bullet before them is removed', () => {
		expect(reconcileKeys(['a', 'b', 'c'], ['1', '2', '3'], ['b', 'c'])).toEqual(['2', '3']);
		expect(reconcileKeys(['a', 'b', 'c'], ['1', '2', '3'], ['a', 'c'])).toEqual(['1', '3']);
	});

	it('gives a new key to an inserted bullet', () => {
		const keys = reconcileKeys(['a', 'b'], ['1', '2'], ['a', 'x', 'b']);
		expect(keys[0]).toBe('1');
		expect(keys[2]).toBe('2');
		expect(keys[1]).not.toMatch(/^[12]$/);
		expect(new Set(keys).size).toBe(3);
	});

	it('handles an empty list', () => {
		expect(reconcileKeys([], [], [])).toEqual([]);
		expect(reconcileKeys(['a'], ['1'], [])).toEqual([]);
	});
});
