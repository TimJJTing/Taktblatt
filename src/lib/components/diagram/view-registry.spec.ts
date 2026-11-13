import type { Component } from 'svelte';
import { describe, expect, it } from 'vitest';
import type { DiagramViewDefinition, DiagramViewProps } from './view-contract.ts';
import { appViewRegistry, createViewRegistry } from './view-registry.ts';

/** A small fake view. The registry does not render it. */
const fake = (id: string, order: number): DiagramViewDefinition => ({
	id,
	order,
	label: () => id,
	component: (() => {}) as unknown as Component<DiagramViewProps>,
	paper: { orientation: 'portrait', segments: () => [] },
	motion: { routerId: `${id}-router`, connectorSchema: `${id}-v1` }
});

describe('createViewRegistry', () => {
	it('orders the views by order, then by id', () => {
		const registry = createViewRegistry([
			fake('zeta', 20),
			fake('beta', 10),
			fake('gantt', 0),
			fake('alpha', 10)
		]);
		expect(registry.ids).toEqual(['gantt', 'alpha', 'beta', 'zeta']);
		expect(registry.views.map((view) => view.id)).toEqual(['gantt', 'alpha', 'beta', 'zeta']);
	});

	it('throws on a duplicate id', () => {
		expect(() =>
			createViewRegistry([fake('gantt', 0), fake('list', 10), fake('list', 20)])
		).toThrow(Error);
	});

	it('throws when no Gantt view is registered', () => {
		expect(() => createViewRegistry([fake('list', 10)])).toThrow(Error);
	});

	it('finds a registered view by id and reports unknown ids', () => {
		const list = fake('list', 10);
		const registry = createViewRegistry([fake('gantt', 0), list]);
		expect(registry.get('list')).toBe(list);
		expect(registry.get('kanban')).toBeUndefined();
		expect(registry.has('gantt')).toBe(true);
		expect(registry.has('kanban')).toBe(false);
	});
});

describe('appViewRegistry', () => {
	it('contains only the real Gantt view in a build without fixtures', () => {
		const registry = appViewRegistry();
		expect(registry.ids).toEqual(['gantt']);
		expect(registry.get('gantt')?.order).toBe(0);
		expect(registry.get('gantt')?.label()).toBe('Gantt');
		expect(appViewRegistry()).toBe(registry);
	});
});
