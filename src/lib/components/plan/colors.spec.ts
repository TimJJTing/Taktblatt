import { describe, expect, it } from 'vitest';
import * as colors from './colors.ts';

describe('D19 opaque color selection (3c)', () => {
	it('keeps a done dot at full strength while its line and outgoing connector use 40 percent [AC4]', () => {
		expect(colors.markColorLevel('done', 'dot')).toBe(100);
		expect(colors.markColorLevel('done', 'line')).toBe(40);
		expect(colors.markColorLevel('done', 'connector')).toBe(40);
		expect(colors.markColorLevel('canceled', 'dot')).toBe(40);
		expect(colors.markColorLevel('in_progress', 'line')).toBe(100);
		expect(colors.markColorLevel('todo', 'connector')).toBe(100);
	});

	it('selects one off-route level instead of multiplying the finished level [AC4]', () => {
		for (const status of ['todo', 'done', 'canceled'] as const)
			for (const part of ['line', 'dot', 'connector'] as const)
				expect(colors.markColorLevel(status, part, true)).toBe(30);
	});

	it('ignores route dimming on paper and keeps the status levels [AC9]', () => {
		expect(colors.markColorLevel('done', 'dot', true, true)).toBe(100);
		expect(colors.markColorLevel('done', 'line', true, true)).toBe(40);
		expect(colors.markColorLevel('canceled', 'dot', true, true)).toBe(40);
		expect(colors.markColorLevel('todo', 'line', true, true)).toBe(100);
	});
});
