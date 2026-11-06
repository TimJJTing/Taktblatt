import { describe, expect, it } from 'vitest';
import { matchLocale } from './locale.js';

describe('matchLocale', () => {
	it('takes a supported language as it is', () => {
		expect(matchLocale(['de'])).toBe('de');
		expect(matchLocale(['zh-TW'])).toBe('zh-TW');
		expect(matchLocale(['ZH-tw'])).toBe('zh-TW');
	});

	it('matches a region variant by its base language', () => {
		expect(matchLocale(['de-AT'])).toBe('de');
		expect(matchLocale(['ja-JP'])).toBe('ja');
		expect(matchLocale(['en-GB'])).toBe('en');
	});

	it('maps Traditional Chinese tags to zh-TW', () => {
		expect(matchLocale(['zh-Hant-TW'])).toBe('zh-TW');
		expect(matchLocale(['zh-Hant'])).toBe('zh-TW');
		expect(matchLocale(['zh-HK'])).toBe('zh-TW');
		expect(matchLocale(['zh-Hant-HK'])).toBe('zh-TW');
	});

	it('does not map Simplified or unspecified Chinese to zh-TW', () => {
		expect(matchLocale(['zh-CN'])).toBeUndefined();
		expect(matchLocale(['zh-Hans'])).toBeUndefined();
		expect(matchLocale(['zh-Hans-TW'])).toBeUndefined();
		expect(matchLocale(['zh'])).toBeUndefined();
	});

	it('uses the first language in the list that is supported', () => {
		expect(matchLocale(['fr-FR', 'de-CH', 'en'])).toBe('de');
		expect(matchLocale(['zh-CN', 'ja'])).toBe('ja');
	});

	it('gives nothing when no language is supported', () => {
		expect(matchLocale(['fr-FR', 'es'])).toBeUndefined();
		expect(matchLocale([])).toBeUndefined();
		expect(matchLocale(['', '*'])).toBeUndefined();
	});
});
