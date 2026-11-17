import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const required: Record<string, string[]> = {
	kanban_family_row: ['count', 'parent'],
	kanban_item_context: ['context', 'parent'],
	kanban_stage_count: ['count'],
	kanban_stage_empty: [],
	kanban_stage_group: ['badge', 'stage']
};
const params = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const catalog = (locale: string): Record<string, string> =>
	JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'));

describe('Kanban locale inventory', () => {
	it('keeps complete sorted blocks after menu_this_plan with matching parameters', () => {
		const source = catalog('en');
		for (const [key, parameters] of Object.entries(required)) {
			expect(typeof source[key], key).toBe('string');
			if (typeof source[key] === 'string') expect(params(source[key]), key).toEqual(parameters);
		}
		const sourceKeys = Object.keys(source).filter((key) => key.startsWith('kanban_'));
		for (const locale of ['en', 'de', 'ja', 'zh-TW']) {
			const messages = catalog(locale);
			const order = Object.keys(messages);
			const keys = order.filter((key) => key.startsWith('kanban_'));
			expect(keys, locale).toEqual([...sourceKeys].sort());
			expect(
				order.slice(
					order.indexOf('menu_this_plan') + 1,
					order.indexOf('menu_this_plan') + 1 + keys.length
				),
				locale
			).toEqual(keys);
			for (const key of keys) {
				expect(typeof messages[key], `${locale}: ${key}`).toBe('string');
				expect(messages[key].trim(), `${locale}: ${key}`).not.toBe('');
				expect(params(messages[key]), `${locale}: ${key}`).toEqual(params(source[key]));
			}
		}
	});
});
