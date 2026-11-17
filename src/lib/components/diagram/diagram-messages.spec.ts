import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The shared diagram messages must be complete in every catalog. Refer to ADR 20.
 * Paraglide falls back to English for a missing translation, so a type check cannot find it.
 */
const LOCALES = ['de', 'ja', 'zh-TW'] as const;

const catalog = (locale: string): Record<string, unknown> =>
	JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'));

const params = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

const source = Object.entries(catalog('en')).filter(([key]) => key.startsWith('diagram_'));

describe('shared diagram messages', () => {
	it('exist with the same parameters in every catalog', () => {
		for (const locale of LOCALES) {
			const messages = catalog(locale);
			for (const [key, text] of source) {
				const translated = messages[key];
				expect(typeof translated, key).toBe('string');
				expect((translated as string).trim(), key).not.toBe('');
				expect(params(translated as string), key).toEqual(params(text as string));
			}
		}
	});
	it('keeps a sorted diagram block at the end of each catalog with all slice 3 keys', () => {
		const required = [
			'diagram_family_blocked',
			'diagram_family_canceled',
			'diagram_family_done',
			'diagram_family_in_progress',
			'diagram_family_ready',
			'diagram_status_key',
			'diagram_status_key_readiness'
		];
		for (const locale of ['en', ...LOCALES]) {
			const messages = catalog(locale);
			const keys = Object.keys(messages);
			const diagramKeys = keys.filter((key) => key.startsWith('diagram_'));
			expect(diagramKeys, locale).toEqual([...diagramKeys].sort());
			expect(keys.slice(-diagramKeys.length), locale).toEqual(diagramKeys);
			for (const key of required) expect(typeof messages[key], `${locale}: ${key}`).toBe('string');
		}
	});
});
