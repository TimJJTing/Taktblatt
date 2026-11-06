import { afterEach, describe, expect, it } from 'vitest';
import { getLocale, overwriteGetLocale } from '#lib/paraglide/runtime.js';
import { uiIntl } from './ui-language.ts';

describe('uiIntl', () => {
	const original = getLocale;
	afterEach(() => overwriteGetLocale(original));

	it('gives the Intl tag of the Paraglide locale', () => {
		overwriteGetLocale(() => 'de');
		expect(uiIntl()).toBe('de');
		overwriteGetLocale(() => 'en');
		expect(uiIntl()).toBe('en-US');
	});
});
