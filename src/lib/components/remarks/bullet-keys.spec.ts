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

	it('reuses each key at most once when duplicate texts exist in the middle slice', () => {
		const inserted = reconcileKeys(
			['x', 'dup', 'dup', 'y'],
			['1', '2', '3', '4'],
			['a', 'dup', 'dup', 'dup', 'b']
		);
		expect(inserted[1]).toBe('2');
		expect(inserted[2]).toBe('3');
		expect(new Set(inserted).size).toBe(5);
		expect(inserted.filter((k) => ['1', '2', '3', '4'].includes(k))).toEqual(['2', '3']);

		const deleted = reconcileKeys(
			['a', 'dup', 'dup', 'b'],
			['1', '2', '3', '4'],
			['x', 'dup', 'dup']
		);
		expect(deleted[1]).toBe('2');
		expect(deleted[2]).toBe('3');
		expect(new Set(deleted).size).toBe(3);
	});
});
