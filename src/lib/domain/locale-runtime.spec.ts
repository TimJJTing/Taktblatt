import { describe, expect, it } from 'vitest';
import { locales } from '#lib/paraglide/runtime.js';
import { LOCALES } from './locale.js';

describe('supported languages', () => {
	it('are the same for the app and for Paraglide', () => {
		expect([...locales]).toEqual([...LOCALES]);
	});
});
