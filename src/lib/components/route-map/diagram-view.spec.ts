import { describe, expect, it } from 'vitest';
import { routersCompatible } from '#lib/components/diagram/diagram-motion.ts';
import { VIEW_ORDER } from '#lib/components/diagram/view-contract.ts';
import { appViewRegistry, createViewRegistry } from '#lib/components/diagram/view-registry.ts';
import { view as gantt } from '#lib/components/timeline/diagram-view.ts';
import { view } from './diagram-view.ts';

describe('Route map registration', () => {
	it('registers after Gantt with landscape paper and an incompatible local router', () => {
		const registry = createViewRegistry([view, gantt]);
		expect(view.id).toBe('route-map');
		expect(view.order).toBe(VIEW_ORDER['route-map']);
		expect(view.paper.orientation).toBe('landscape');
		expect(view.motion).toEqual({ routerId: 'route-map', connectorSchema: 'route-map-v1' });
		expect(routersCompatible(gantt.motion, view.motion)).toBe(false);
		expect(routersCompatible(view.motion, gantt.motion)).toBe(false);
		expect(registry.ids.indexOf('route-map')).toBeGreaterThan(registry.ids.indexOf('gantt'));
		const real = appViewRegistry();
		expect(real.ids).toEqual(expect.arrayContaining(['gantt', 'route-map']));
		expect(real.ids.indexOf('route-map')).toBeGreaterThan(real.ids.indexOf('gantt'));
	});
});
