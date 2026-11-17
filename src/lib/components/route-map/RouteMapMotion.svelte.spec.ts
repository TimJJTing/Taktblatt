import '../../../routes/layout.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { cleanup, render } from 'vitest-browser-svelte';
import { DIAGRAM_ATTR } from '#lib/components/diagram/view-contract.ts';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { updateTask } from '#lib/state/commands.ts';
import { EditingState } from '#lib/state/editing.svelte.ts';
import { ViewerState } from '#lib/state/viewer.svelte.ts';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import RouteMapTest from './RouteMap.test.svelte';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('#lib/motion.ts', async (original) => ({
	...(await original<typeof import('#lib/motion.ts')>()),
	motionDuration: (ms: number) => (motion.reduced ? 0 : ms)
}));

const pathPoints = (root: ParentNode, from: string, to: string) => {
	const wrapper = root.querySelector(
		`[data-testid="route-map-dependency"][data-from="${from}"][data-to="${to}"]`
	)!;
	const path = wrapper.matches('path')
		? wrapper
		: wrapper.querySelector('path[data-testid="gantt-dependency"], path[data-carrier-path]')!;
	const numbers = path
		.getAttribute('d')!
		.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!
		.map(Number);
	return Array.from({ length: numbers.length / 2 }, (_, i) => ({
		x: numbers[2 * i],
		y: numbers[2 * i + 1]
	}));
};

let now = 0;
let next = 0;
let pending = new Map<number, FrameRequestCallback>();
function mockFrames() {
	return (at: number) => {
		now = at;
		const callbacks = [...pending.values()];
		pending.clear();
		for (const callback of callbacks) callback(at);
		flushSync();
	};
}
const mark = (root: ParentNode, id: string) =>
	root.querySelector<HTMLButtonElement>(`button:has([${DIAGRAM_ATTR.station}="${id}"])`)!;
const label = (root: ParentNode, id: string) =>
	root.querySelector<HTMLElement>(`[${DIAGRAM_ATTR.label}="${id}"]`)!.closest('button')!;

describe('Route map controlled motion', () => {
	let workspace: Workspace;
	let viewer: ViewerState;
	let editing: EditingState;
	beforeEach(async () => {
		await Promise.all([
			document.fonts.load('400 12px "Source Sans 3 Variable"'),
			document.fonts.load('500 12px "Source Sans 3 Variable"')
		]);
		await document.fonts.ready;
		now = 0;
		next = 0;
		pending = new Map();
		vi.spyOn(performance, 'now').mockImplementation(() => now);
		vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
			pending.set(++next, fn);
			return next;
		});
		vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id));
		motion.reduced = false;
		workspace = new Workspace(new MemoryStorage());
		viewer = new ViewerState(new MemoryStorage(), ['gantt', 'route-map']);
		viewer.setDiagramView('route-map');
		editing = new EditingState();
		workspace.commit((plan) => {
			plan.stages = [{ id: 's1', title: 'Prepare', description: '', color: 'blue' }];
			plan.tasks = [makeTask({ id: 'P' })];
		});
		workspace.history.clear();
	});
	afterEach(() => {
		cleanup();
		const frame = mockFrames();
		try {
			for (let i = 0; pending.size && i < 100; i++) frame(now + 10000);
			expect(pending.size).toBe(0);
		} finally {
			vi.restoreAllMocks();
			vi.unstubAllGlobals();
		}
	});
	const mount = () => render(RouteMapTest, { workspace, viewer, editing });

	it('displays measured wrapped summary and badge geometry on the first frame', async () => {
		motion.reduced = false;
		workspace.commit((plan) => {
			plan.tasks = [
				makeTask({ id: 'P', title: 'Parent' }),
				makeTask({ id: 'a', parentId: 'P', status: 'in_progress' }),
				makeTask({ id: 'b', parentId: 'P', status: 'done' })
			];
		});
		await document.fonts.ready;
		const frame = await mockFrames();
		try {
			const screen = await mount();
			const controls = screen.container.querySelector<HTMLElement>(
				'[data-route-map-controls="P"]'
			)!;
			const title = label(screen.container, 'P');
			const badge = screen.container.querySelector<HTMLElement>(
				'[data-testid="route-map-stage-label"][data-stage="s1"]'
			)!;
			const boxes = () =>
				[controls, title, badge].map((element) => {
					const { x, y, width, height } = element.getBoundingClientRect();
					return [x, y, width, height];
				});
			frame(0);
			const first = boxes();
			expect(controls.textContent).toContain('1 in progress and 1 done');
			expect(first[0][3]).toBeGreaterThan(24);
			let time = 300;
			let previous: number[][] | undefined;
			let settled = first;
			await expect
				.poll(() => {
					frame(time);
					time += 300;
					settled = boxes();
					const stable =
						previous !== undefined &&
						settled.every((box, i) =>
							box.every((value, j) => Math.abs(value - previous![i][j]) < 0.01)
						);
					previous = settled;
					return stable;
				})
				.toBe(true);
			for (let i = 0; i < first.length; i++) {
				for (let j = 0; j < first[i].length; j++) {
					expect(Math.abs(first[i][j] - settled[i][j])).toBeLessThanOrEqual(1);
				}
			}
			expect(first[2][1]).toBeGreaterThanOrEqual(first[0][1] + first[0][3]);
		} finally {
			frame(10000);
			frame(11000);
		}
	});

	for (const lifecycle of ['empty replacement', 'plan switch'] as const) {
		it(`displays measured first-frame geometry after ${lifecycle}`, async () => {
			motion.reduced = false;
			const family = (prefix: string) => [
				makeTask({ id: `${prefix}-parent`, title: 'Parent' }),
				makeTask({ id: `${prefix}-a`, parentId: `${prefix}-parent`, status: 'in_progress' }),
				makeTask({ id: `${prefix}-b`, parentId: `${prefix}-parent`, status: 'done' })
			];
			workspace.commit((plan) => {
				plan.tasks = lifecycle === 'empty replacement' ? [] : family('old');
			});
			const firstPlanId = workspace.plan.id;
			let secondPlanId = '';
			if (lifecycle === 'plan switch') {
				workspace.createPlan();
				workspace.commit((plan) => {
					plan.stages = [{ id: 's1', title: 'Prepare', description: '', color: 'blue' }];
					plan.tasks = family('new');
				});
				secondPlanId = workspace.plan.id;
				workspace.switchTo(firstPlanId);
			}
			await document.fonts.ready;
			const frame = await mockFrames();
			try {
				const screen = await mount();
				frame(0);
				frame(300);
				flushSync(() => {
					if (lifecycle === 'plan switch') workspace.switchTo(secondPlanId);
					else
						workspace.commit((plan) => {
							plan.tasks = family('new');
						});
				});
				frame(300);
				const controls = screen.container.querySelector<HTMLElement>(
					'[data-route-map-controls="new-parent"]'
				)!;
				const title = label(screen.container, 'new-parent');
				const badge = screen.container.querySelector<HTMLElement>(
					'[data-testid="route-map-stage-label"][data-stage="s1"]'
				)!;
				const boxes = () =>
					[controls, title, badge].map((element) => {
						const { x, y, width, height } = element.getBoundingClientRect();
						return [x, y, width, height];
					});
				const first = boxes();
				expect(controls.textContent).toContain('1 in progress and 1 done');
				expect(first[0][3]).toBeGreaterThan(24);
				let previous: number[][] | undefined;
				let settled = first;
				let time = 600;
				await expect
					.poll(() => {
						frame(time);
						time += 300;
						settled = boxes();
						const stable =
							previous !== undefined &&
							settled.every((box, i) =>
								box.every((value, j) => Math.abs(value - previous![i][j]) < 0.01)
							);
						previous = settled;
						return stable;
					})
					.toBe(true);
				for (let i = 0; i < first.length; i++)
					for (let j = 0; j < first[i].length; j++)
						expect(Math.abs(first[i][j] - settled[i][j])).toBeLessThanOrEqual(1);
				expect(first[2][1]).toBeGreaterThanOrEqual(first[0][1] + first[0][3]);
			} finally {
				frame(10000);
				frame(11000);
			}
		});
	}

	it.each(['initial mount', 'plan switch'] as const)(
		'displays measured empty-stage geometry on first frame after %s',
		async (lifecycle) => {
			motion.reduced = false;
			const setFamily = () =>
				workspace.commit((plan) => {
					plan.stages = [
						{ id: 's1', title: 'Prepare', description: '', color: 'blue' },
						{ id: 'empty', title: 'Empty stage', description: '', color: 'green' }
					];
					plan.tasks = [
						makeTask({ id: 'parent', title: 'Parent' }),
						makeTask({ id: 'a', parentId: 'parent', status: 'in_progress' }),
						makeTask({ id: 'b', parentId: 'parent', status: 'done' })
					];
				});
			let targetPlanId = workspace.plan.id;
			if (lifecycle === 'plan switch') {
				const firstPlanId = workspace.plan.id;
				workspace.createPlan();
				setFamily();
				targetPlanId = workspace.plan.id;
				workspace.switchTo(firstPlanId);
			} else setFamily();
			await document.fonts.ready;
			const frame = await mockFrames();
			try {
				const screen = await mount();
				frame(0);
				let time = 300;
				if (lifecycle === 'plan switch') {
					frame(time);
					flushSync(() => workspace.switchTo(targetPlanId));
					frame(time);
					time += 300;
				}
				const controls = screen.container.querySelector<HTMLElement>(
					'[data-route-map-controls="parent"]'
				)!;
				expect(controls.textContent).toContain('1 in progress and 1 done');
				expect(controls.getBoundingClientRect().height).toBeGreaterThan(24);
				expect(viewer.isExpanded(workspace.plan.id, 'parent')).toBe(false);
				const badge = screen.container.querySelector<HTMLElement>(
					'[data-testid="route-map-stage-label"][data-stage="empty"]'
				);
				const placeholder = [
					...screen.container.querySelectorAll<SVGElement>('[data-route-map-station-glyph]')
				].find((glyph) => !glyph.closest('[data-diagram-task]'));
				expect(badge).not.toBeNull();
				expect(placeholder).toBeDefined();
				const boxes = () =>
					[badge!, placeholder!].map((element) => {
						const { x, y, width, height } = element.getBoundingClientRect();
						return [x, y, width, height];
					});
				const first = boxes();
				let previous: number[][] | undefined;
				let settled = first;
				await expect
					.poll(() => {
						frame(time);
						time += 300;
						settled = boxes();
						const stable =
							previous !== undefined &&
							settled.every((box, i) =>
								box.every((value, j) => Math.abs(value - previous![i][j]) < 0.01)
							);
						previous = settled;
						return stable;
					})
					.toBe(true);
				for (let i = 0; i < first.length; i++)
					for (let j = 0; j < first[i].length; j++)
						expect(Math.abs(first[i][j] - settled[i][j])).toBeLessThanOrEqual(1);
			} finally {
				frame(10000);
				frame(11000);
			}
		}
	);

	it('animates a later label-height change in an initialized scene', async () => {
		motion.reduced = false;
		workspace.commit((plan) => {
			plan.tasks = [makeTask({ id: 'P', title: 'Parent' })];
		});
		await document.fonts.ready;
		const frame = await mockFrames();
		try {
			const screen = await mount();
			frame(0);
			frame(300);
			const badge = screen.container.querySelector<HTMLElement>(
				'[data-testid="route-map-stage-label"][data-stage="s1"]'
			)!;
			const start = badge.getBoundingClientRect().top;
			flushSync(() => updateTask(workspace, 'P', { title: 'A longer parent title that wraps' }));
			const title = label(screen.container, 'P');
			await expect
				.poll(() => {
					const span = [...title.querySelectorAll<HTMLElement>('span')].find(
						(element) =>
							element.textContent === 'A longer parent title that wraps' && !element.children.length
					);
					return span?.getBoundingClientRect().height ?? 0;
				})
				.toBeGreaterThan(16);
			let time = 300;
			let midway = start;
			await expect
				.poll(() => {
					frame(time);
					time += 16;
					midway = badge.getBoundingClientRect().top;
					return midway;
				})
				.not.toBe(start);
			frame(time + 300);
			const end = badge.getBoundingClientRect().top;
			expect(midway).not.toBe(end);
		} finally {
			frame(2000);
			frame(3000);
		}
	});

	it('retargets interrupted geometry from the current frame and keeps dependency ports on moving station centers', async () => {
		workspace.commit((plan) => {
			plan.tasks = [
				makeTask({ id: 'A', start: '2027-01-01' }),
				makeTask({ id: 'C', dependsOn: ['A'] })
			];
		});
		const frame = await mockFrames();
		try {
			const screen = await mount();
			const root = screen.container;
			frame(0);
			frame(300);
			const start = pathPoints(root, 'A', 'C');
			flushSync(() =>
				workspace.commit((plan) => {
					plan.tasks.push(makeTask({ id: 'obstacle' }));
					plan.tasks.find((t) => t.id === 'A')!.dependsOn = ['obstacle'];
				})
			);
			frame(300);
			frame(396);
			const midway = pathPoints(root, 'A', 'C');
			expect(midway).not.toEqual(start);
			flushSync(() =>
				workspace.commit((plan) => {
					plan.tasks.push(makeTask({ id: 'obstacle2' }));
					plan.tasks.find((t) => t.id === 'obstacle')!.dependsOn = ['obstacle2'];
				})
			);
			const retargeted = pathPoints(root, 'A', 'C');
			expect(retargeted).toEqual(midway);
			for (const at of [444, 492, 700]) {
				frame(at);
				const p = pathPoints(root, 'A', 'C');
				const svg = root.querySelector('[data-testid="route-map"] svg')!.getBoundingClientRect();
				for (const [id, point] of [
					['A', p[0]],
					['C', p.at(-1)!]
				] as const) {
					const box = mark(root, id).getBoundingClientRect();
					expect(point.x).toBeCloseTo(box.x + box.width / 2 - svg.x, 1);
					expect(point.y).toBeCloseTo(box.y + box.height / 2 - svg.y, 1);
				}
			}
		} finally {
			frame(2000);
			frame(3000);
		}
	});

	it('cross-fades carrier changes and settles reduced-motion geometry without interpolating point meanings', async () => {
		workspace.commit((plan) => {
			plan.stages.push({ id: 's2', title: 'Next', description: '', color: 'green' });
			plan.tasks = [makeTask({ id: 'A' }), makeTask({ id: 'target', dependsOn: ['A'] })];
		});
		const frame = await mockFrames();
		try {
			// Begin with settled geometry. Freeze new native animations at creation so
			// browser load cannot finish a fade before the test samples its midpoint.
			motion.reduced = true;
			const screen = await mount();
			frame(0);
			frame(300);
			motion.reduced = false;
			const selector = '[data-testid="route-map-dependency"][data-from="A"][data-to="target"]';
			const nativeAnimate = Element.prototype.animate;
			vi.spyOn(Element.prototype, 'animate').mockImplementation(function (
				this: Element,
				keyframes,
				options
			) {
				const animation = nativeAnimate.call(this, keyframes, options);
				if (this.matches(selector)) animation.pause();
				return animation;
			});
			expect(screen.container.querySelector(selector)!.getAttribute('data-carrier')).toBe('line');
			flushSync(() =>
				workspace.commit((plan) => {
					plan.tasks.find((t) => t.id === 'target')!.stageId = 's2';
				})
			);
			expect(
				[...screen.container.querySelectorAll(selector)]
					.map((e) => e.getAttribute('data-carrier'))
					.sort()
			).toEqual(['line', 'walkway']);
			frame(300);
			// Finish Svelte's delay placeholders, then wait for both paused fades.
			const routeAnimations = () =>
				screen.container
					.getAnimations({ subtree: true })
					.filter((a) => ((a.effect as KeyframeEffect).target as Element).matches(selector));
			const isFade = (animation: Animation) =>
				new Set((animation.effect as KeyframeEffect).getKeyframes().map((k) => k.opacity)).size > 1;
			await expect
				.poll(() => {
					const animations = routeAnimations();
					for (const animation of animations.filter((a) => !isFade(a))) animation.finish();
					return animations.filter(isFade).length;
				})
				.toBe(2);
			const animations = routeAnimations().filter(isFade);
			for (const animation of animations) {
				animation.pause();
				animation.currentTime = 80;
			}
			frame(380);
			const fading = [...screen.container.querySelectorAll<SVGElement>(selector)];
			expect(fading).toHaveLength(2);
			const visibleOpacity = (element: Element) => {
				let opacity = 1;
				for (let e: Element | null = element; e && e !== screen.container; e = e.parentElement)
					opacity *= Number(getComputedStyle(e).opacity);
				return opacity;
			};
			expect(fading.some((e) => visibleOpacity(e) > 0 && visibleOpacity(e) < 1)).toBe(true);
			for (const animation of animations) animation.finish();
			frame(700);
			await Promise.resolve();
			flushSync();
			await expect.poll(() => screen.container.querySelectorAll(selector).length).toBe(1);
			expect(screen.container.querySelector(selector)!.getAttribute('data-carrier')).toBe(
				'walkway'
			);
			motion.reduced = true;
			flushSync(() =>
				workspace.commit((plan) => {
					plan.tasks.find((t) => t.id === 'target')!.stageId = 's1';
				})
			);
			expect(screen.container.querySelectorAll(selector)).toHaveLength(1);
			expect(screen.container.querySelector(selector)!.getAttribute('data-carrier')).toBe('line');
			expect(pathPoints(screen.container, 'A', 'target').length).toBeGreaterThanOrEqual(2);
		} finally {
			frame(2000);
			frame(3000);
		}
	});
});
