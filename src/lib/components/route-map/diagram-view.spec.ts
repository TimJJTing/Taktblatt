import { indexTasks } from '#lib/domain/derive.ts';
import { makePlan, makeTask } from '#lib/domain/test-helpers.ts';
import {
	pinnedExamplePlan,
	paperPathOverlap,
	outsideStations
} from '#lib/scene/route-map.test-helpers.ts';
import type { Plan } from '#lib/domain/schema.ts';
import type { RouteMapPaperItem } from '#lib/scene/route-map-paper.ts';
import { describe, expect, it } from 'vitest';
import { routersCompatible } from '#lib/components/diagram/diagram-motion.ts';
import { VIEW_ORDER } from '#lib/components/diagram/view-contract.ts';
import { appViewRegistry, createViewRegistry } from '#lib/components/diagram/view-registry.ts';
import { view as gantt } from '#lib/components/timeline/diagram-view.ts';
import { view } from './diagram-view.ts';
import { verificationPlan } from './verification-plan.test-helper.ts';

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
	it.each(['a4', 'letter'] as const)('keeps a child branch at Region west on %s paper', (paper) => {
		const plan = { ...verificationPlan, paper };
		const segment = view.paper.segments({
			plan,
			index: indexTasks(plan.tasks),
			showSubtasks: () => true,
			today: '2026-11-17'
		})[0];
		expect(segment.kind).toBe('scene');
		if (segment.kind !== 'scene') throw new Error('Expected Route map scene');
		const items = segment.items as RouteMapPaperItem[];
		const item = items.find((entry) => entry.stations.some((station) => station.id === 't22'));
		expect(item).toBeDefined();
		if (!item) throw new Error('Expected Region west on a paper item');
		const source = item.stations.find((entry) => entry.id === 't19');
		const target = item.stations.find((entry) => entry.id === 't22');
		expect(source).toBeDefined();
		expect(target).toBeDefined();
		if (!source || !target) throw new Error('Expected both family stations in the paper item');
		const family = item.lines.find(
			(line) =>
				line.kind === 'family' &&
				line.form === 'double' &&
				line.taskIds[0] === 't19' &&
				line.taskIds[1] === 't22'
		);
		expect(family).toBeDefined();
		if (!family) throw new Error('Expected the Region north to Region west child branch');
		expect(family.points[0]).toEqual(source.center);
		expect(family.points.at(-1)).toEqual(target.center);

		const pathWidth = (edge: (typeof item.continuations)[number]) => {
			if (edge.cycle) return 4;
			if (edge.carrier !== 'line') return 1;
			return plan.tasks.some(
				(task) => (task.id === edge.from || task.id === edge.to) && task.parentId
			)
				? 3.5
				: 5;
		};
		const violations: string[] = [];
		for (const current of items) {
			const restored = current.lines.filter((line) => {
				if (line.kind !== 'family' || !current.id.startsWith('row:')) return false;
				const from = current.stations.find((station) => station.id === line.taskIds[0]);
				const to = current.stations.find((station) => station.id === line.taskIds[1]);
				return from && to && from.track !== to.track;
			});
			const paths = [
				...current.lines.map((line) => ({
					key: line.key,
					ids: line.taskIds,
					points: line.points,
					width: line.width
				})),
				...current.edges
					.filter((edge) => edge.carrier !== 'line')
					.map((edge) => ({
						key: edge.key,
						ids: [edge.from, edge.to],
						points: edge.points,
						width: edge.cycle ? 4 : 1
					})),
				...current.continuations.map((edge) => ({
					key: edge.key,
					ids: [edge.from, edge.to],
					points: edge.points,
					width: pathWidth(edge)
				})),
				...(current.markers ?? []).flatMap((marker) =>
					(marker.stubs ?? []).map((edge) => ({
						key: `${edge.key}:stub`,
						ids: [edge.from, edge.to],
						points: edge.points,
						width: pathWidth(edge)
					}))
				)
			];
			for (const branch of restored) {
				for (const other of paths.filter((path) => path.key !== branch.key)) {
					const shared = current.stations
						.filter(
							(station) => branch.taskIds.includes(station.id) && other.ids.includes(station.id)
						)
						.map((station) => station.center);
					const clearance = (branch.width + other.width) / 2 + 1;
					const overlap = paperPathOverlap(
						outsideStations(branch.points, shared),
						outsideStations(other.points, shared),
						clearance
					);
					const allowed = Math.max(branch.width, other.width);
					if (overlap > allowed + 1e-6)
						violations.push(
							`${current.id}: ${branch.key} vs ${other.key}: overlap ${overlap.toFixed(2)} > ${allowed}`
						);
				}
			}
		}
		expect(violations, violations.join('\n')).toEqual([]);
	});

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
