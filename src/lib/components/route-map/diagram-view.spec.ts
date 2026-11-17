import { indexTasks } from '#lib/domain/derive.ts';
import { makePlan, makeTask } from '#lib/domain/test-helpers.ts';
import { pinnedExamplePlan } from '#lib/scene/route-map.test-helpers.ts';
import type { Plan } from '#lib/domain/schema.ts';
import type { RouteMapPaperItem } from '#lib/scene/route-map-paper.ts';
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
		expect(view.motion).toEqual({ routerId: 'route-map', connectorSchema: 'route-map-v4' });
		expect(routersCompatible(gantt.motion, view.motion)).toBe(false);
		expect(routersCompatible(view.motion, gantt.motion)).toBe(false);
		expect(registry.ids.indexOf('route-map')).toBeGreaterThan(registry.ids.indexOf('gantt'));
		const real = appViewRegistry();
		expect(real.ids).toEqual(expect.arrayContaining(['gantt', 'route-map']));
		expect(real.ids.indexOf('route-map')).toBeGreaterThan(real.ids.indexOf('gantt'));
	});
});

describe('Route map paper adapter', () => {
	it('bounds header reservation and keeps items inside the body for a large plan', () => {
		const example = pinnedExamplePlan();
		const large = makePlan(
			Array.from({ length: 300 }, (_, i) => makeTask({ id: `t${i}`, title: 'Task' }))
		);
		const scene = (plan: Plan) => {
			const segment = view.paper.segments({
				plan,
				index: indexTasks(plan.tasks),
				showSubtasks: () => false,
				today: '2027-01-10'
			})[0];
			expect(segment.kind).toBe('scene');
			if (segment.kind !== 'scene') throw new Error('Expected Route map scene');
			return {
				height: (segment.data as { headerHeight: number }).headerHeight,
				items: segment.items as RouteMapPaperItem[]
			};
		};
		const bodyHeight = (letter: boolean, headerHeight: number) =>
			(letter ? 816 : (210 * 96) / 25.4) - 2 * 57 - headerHeight - 54;
		for (const paper of ['a4', 'letter'] as const) {
			const small = scene({ ...example, paper });
			const big = scene({ ...large, paper });
			expect(big.height).toBe(small.height);
			const body = bodyHeight(paper === 'letter', big.height);
			expect(body).toBeGreaterThan(0);
			const stationItem = big.items.find((item) => item.stations.length > 0);
			expect(stationItem).toBeDefined();
			if (stationItem) expect(stationItem.height).toBeLessThanOrEqual(body);
			for (const item of big.items) expect(item.height).toBeLessThanOrEqual(body);
		}
	});
});
