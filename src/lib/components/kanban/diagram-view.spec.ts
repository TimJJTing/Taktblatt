import { describe, expect, it } from 'vitest';
import { VIEW_ORDER } from '#lib/components/diagram/view-contract.ts';
import { appViewRegistry } from '#lib/components/diagram/view-registry.ts';
import { view } from './diagram-view.ts';

describe('Kanban self-registration', () => {
	it('discovers Kanban after Gantt without constraining other registered views', () => {
		const registry = appViewRegistry();
		expect(registry.ids).toContain('gantt');
		expect(registry.ids).toContain('kanban');
		expect(registry.ids.indexOf('kanban')).toBeGreaterThan(registry.ids.indexOf('gantt'));
		expect(registry.get('kanban')).toBe(view);
		expect(view.order).toBe(VIEW_ORDER.kanban);
		expect(view.paper.orientation).toBe('landscape');
		expect(view.paper.component).toBeDefined();
		expect(view.motion).toEqual({ routerId: 'kanban', connectorSchema: 'kanban-v1' });
	});
});
