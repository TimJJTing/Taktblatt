import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const required = [
	'route_map_continuation',
	'route_map_empty',
	'route_map_hide_subtasks',
	'route_map_panel',
	'route_map_predecessors',
	'route_map_show_subtasks',
	'route_map_station_name',
	'route_map_subtask_count',
	'route_map_successors',
	'route_map_task_reference',
	'route_map_title_continuation',
	'route_map_to_go',
	'route_map_untitled_task'
];

const parameters: Record<string, string[]> = {
	route_map_continuation: ['direction', 'reference'],
	route_map_empty: [],
	route_map_hide_subtasks: ['task'],
	route_map_panel: ['position', 'reference'],
	route_map_predecessors: ['tasks'],
	route_map_show_subtasks: ['task'],
	route_map_station_name: ['stage', 'status', 'task'],
	route_map_subtask_count: ['count'],
	route_map_successors: ['tasks'],
	route_map_task_reference: ['reference'],
	route_map_title_continuation: ['reference', 'title'],
	route_map_to_go: ['count'],
	route_map_untitled_task: []
};
const params = (text: unknown) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('Route map locale inventory', () => {
	it('has complete nonempty owned blocks at the agreed anchor without shared-name aliases', () => {
		const catalogs = ['en', 'de', 'ja', 'zh-TW'].map(
			(locale) =>
				JSON.parse(
					readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8')
				) as Record<string, unknown>
		);
		const owned = (catalog: Record<string, unknown>) =>
			Object.keys(catalog).filter((k) => k.startsWith('route_map_'));
		const source = owned(catalogs[0]);
		expect(source).toEqual(expect.arrayContaining(required));
		for (const key of required) expect(params(catalogs[0][key])).toEqual(parameters[key]);
		for (const catalog of catalogs) {
			const keys = owned(catalog);
			expect([...keys].sort()).toEqual([...source].sort());
			expect(keys).toEqual([...keys].sort());
			const order = Object.keys(catalog);
			const anchor = order.indexOf('$schema');
			expect(order.slice(anchor + 1, anchor + 1 + keys.length)).toEqual(keys);
			expect(order[anchor + 1 + keys.length]).toBe('app_name');
			for (const key of keys) {
				expect(typeof catalog[key]).toBe('string');
				expect(String(catalog[key]).trim().length).toBeGreaterThan(0);
				expect(key).not.toMatch(/^route_map_(?:view|region|announcement)(?:_|$)/);
				expect(key).not.toBe('route_map_name');
				expect(catalog).not.toHaveProperty(key.replace(/^route_map_/, 'diagram_'));

				expect(params(catalog[key])).toEqual(params(catalogs[0][key]));
			}
		}
	});
});
