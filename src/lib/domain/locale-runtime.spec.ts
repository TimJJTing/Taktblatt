import { describe, expect, it } from 'vitest';
import { locales } from '#lib/paraglide/runtime.js';
import { LOCALES } from './schema';

describe('supported languages', () => {
	it('are the same for the plan schema and for Paraglide', () => {
		expect([...locales]).toEqual([...LOCALES]);
	});
});
