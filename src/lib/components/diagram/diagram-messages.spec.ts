import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The shared diagram messages must be complete in every catalog. Refer to ADR 20. */
const LOCALES = ['de', 'ja', 'zh-TW'] as const;

const catalog = (locale: string): Record<string, unknown> =>
	JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'));

const params = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

const source = Object.entries(catalog('en')).filter(([key]) => key.startsWith('diagram_'));

describe('shared diagram messages', () => {
	it('include the view names and the shared labels in the source catalog', () => {
		const keys = source.map(([key]) => key);
		expect(keys).toEqual(
			expect.arrayContaining([
				'diagram_view_gantt',
				'diagram_view_route_map',
				'diagram_view_kanban',
				'diagram_view_switch',
				'diagram_print_group',
				'diagram_print_min'
			])
		);
	});

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
});
