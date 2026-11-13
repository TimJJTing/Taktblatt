import { describe, expect, it } from 'vitest';
import { radioGroupIndex } from './keyboard.ts';

const key = (name: string, isComposing = false) =>
	({ key: name, isComposing, keyCode: 0 }) as KeyboardEvent;

describe('radioGroupIndex', () => {
	it('wraps the arrows and goes to the ends with Home and End', () => {
		expect(radioGroupIndex(key('ArrowRight'), 2, 3)).toBe(0);
		expect(radioGroupIndex(key('ArrowDown'), 0, 3)).toBe(1);
		expect(radioGroupIndex(key('ArrowLeft'), 0, 3)).toBe(2);
		expect(radioGroupIndex(key('ArrowUp'), 2, 3)).toBe(1);
		expect(radioGroupIndex(key('Home'), 2, 3)).toBe(0);
		expect(radioGroupIndex(key('End'), 0, 3)).toBe(2);
	});

	it('ignores other keys and keys during text composition', () => {
		expect(radioGroupIndex(key('Enter'), 1, 3)).toBeNull();
		expect(radioGroupIndex(key('ArrowRight', true), 1, 3)).toBeNull();
	});
});
