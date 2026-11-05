import { afterEach, describe, expect, it } from 'vitest';
import { locales, overwriteGetLocale } from '#lib/paraglide/runtime.js';
import { uiIntl, uiLocale } from './locale';
import { LOCALES } from './schema';

describe('supported languages', () => {
	it('are the same for the plan schema and for Paraglide', () => {
		expect([...locales]).toEqual([...LOCALES]);
	});
});

describe('the UI language for display', () => {
	afterEach(() => overwriteGetLocale(() => 'en'));

	it('gives the Paraglide locale and its Intl tag', () => {
		overwriteGetLocale(() => 'de');
		expect(uiLocale()).toBe('de');
		expect(uiIntl()).toBe('de');
		overwriteGetLocale(() => 'en');
		expect(uiIntl()).toBe('en-US');
	});
});
