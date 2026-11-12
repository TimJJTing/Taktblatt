import '../../../routes/layout.css';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { HOVER_COLD_MS, HOVER_GRACE_MS } from '#lib/state/route-focus.svelte.ts';
import { userEvent } from 'vitest/browser';
import { EditingState } from '#lib/state/editing.svelte.ts';
import { ViewerState } from '#lib/state/viewer.svelte.ts';
import { updateTask } from '#lib/state/commands.ts';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import { effectiveDependencyGraph } from '#lib/domain/route.ts';
import { ganttScene } from '#lib/scene/gantt-scene.ts';
import GanttTest from './Gantt.test.svelte';

const HOVER_SCHEDULING_MARGIN_MS = 50;

async function ganttPointer(target: Element, type: 'pointermove' | 'pointerleave') {
	const destination =
		type === 'pointermove'
			? target
			: target.closest('[data-testid="gantt-scroller"]')!.firstElementChild!;
	const bounds = destination.getBoundingClientRect();
	destination.dispatchEvent(
		new PointerEvent(type, {
			bubbles: type === 'pointermove',
			clientX: bounds.left + bounds.width / 2,
			clientY: bounds.top + bounds.height / 2,
			pointerType: 'mouse'
		})
	);
	await new Promise(requestAnimationFrame);
	flushSync();
}

vi.mock('#lib/scene/gantt-scene.ts', { spy: true });
vi.mock('#lib/domain/route.ts', { spy: true });
const routeMotion = vi.hoisted(() => ({ reduced: false }));
vi.mock('#lib/motion.ts', async (original) => ({
	...(await original<typeof import('#lib/motion.ts')>()),
	motionDuration: (ms: number) => (routeMotion.reduced ? 0 : ms)
}));

describe('rendered Gantt task marks', () => {
	const observers: { callback: ResizeObserverCallback; targets: Set<Element> }[] = [];
	beforeAll(() =>
		vi.stubGlobal(
			'ResizeObserver',
			class {
				targets = new Set<Element>();
				constructor(callback: ResizeObserverCallback) {
					observers.push({ callback, targets: this.targets });
				}
				observe(target: Element) {
					this.targets.add(target);
				}
				unobserve(target: Element) {
					this.targets.delete(target);
				}
				disconnect() {
					this.targets.clear();
				}
			}
		)
	);
	afterAll(() => vi.unstubAllGlobals());
	let ws: Workspace;
	beforeEach(() => {
		ws = new Workspace(new MemoryStorage());
		ws.commit((plan) => {
			const stageId = plan.stages[0].id;
			plan.range = { start: '2027-01-01', end: '2027-01-31' };
			plan.tasks = [
				makeTask({ id: 'parent', stageId, start: '2027-01-02', end: '2027-01-05' }),
				makeTask({
					id: 'child',
					stageId,
					parentId: 'parent',
					start: '2027-01-02',
					end: '2027-01-05'
				}),
				makeTask({ id: 'tap-source', stageId, start: '2027-01-20', end: '2027-02-05' }),
				makeTask({
					id: 'target',
					stageId,
					start: '2027-01-10',
					end: '2027-01-15',
					dependsOn: ['tap-source', 'parent']
				}),
				makeTask({ id: 'point', stageId, start: '2027-01-18' })
			];
		});
	});
	afterEach(() => {
		vi.restoreAllMocks();
		routeMotion.reduced = false;
	});

	it('renders 8/6 px lines and encloses station dots in focusable mark bounds', async () => {
		const screen = await render(GanttTest, { workspace: ws });
		for (const [id, height, diameter] of [
			['parent', 8, 8],
			['child', 6, 6]
		] as const) {
			const row = screen.container.querySelector(`[data-task-id="${id}"]`)!;
			const mark = row.querySelector<HTMLElement>('[data-testid="gantt-bar"]')!;
			const fill = mark.querySelector<HTMLElement>('[data-gantt-line]');
			expect(fill, 'The date line must be separate from its station dots').not.toBeNull();
			expect(fill!.getBoundingClientRect().height).toBe(height);
			const dots = mark.querySelectorAll<SVGSVGElement>('.station-dot');
			expect(dots).toHaveLength(2);
			mark.focus();
			expect(document.activeElement).toBe(mark);
			const box = mark.getBoundingClientRect();
			for (const dot of dots) {
				const d = dot.getBoundingClientRect();
				expect(d.width).toBe(diameter);
				expect(d.left).toBeGreaterThanOrEqual(box.left);
				expect(d.right).toBeLessThanOrEqual(box.right);
				expect(d.top).toBeGreaterThanOrEqual(box.top);
				expect(d.bottom).toBeLessThanOrEqual(box.bottom);
			}
		}
	});

	it('keeps clipped cuts flat and makes the point an accessible round station', async () => {
		const screen = await render(GanttTest, { workspace: ws });
		const clipped = screen.container.querySelector(
			'[data-task-id="tap-source"] [data-testid="gantt-bar"]'
		)!;
		expect(clipped.querySelectorAll('.station-dot')).toHaveLength(1);
		const fill = clipped.querySelector('[data-gantt-line]')!;
		expect(getComputedStyle(fill).clipPath).toBe('none');
		expect(getComputedStyle(fill).borderTopRightRadius).toBe('0px');
		const point = screen.getByTestId('gantt-point');
		await expect.element(point).toHaveAccessibleName(/^point:/);
		const dot = point.element().querySelector('.station-dot');
		expect(dot).not.toBeNull();
		expect(dot!.getBoundingClientRect().width).toBe(10);
		(point.element() as HTMLElement).focus();
		expect(document.activeElement).toBe(point.element());
	});

	it('keeps taps in their source mark between its line and dots, hidden and timeline-clipped', async () => {
		const screen = await render(GanttTest, { workspace: ws });
		const mark = screen.container.querySelector(
			'[data-task-id="tap-source"] [data-testid="gantt-bar"]'
		)!;
		const tap = mark.querySelector('[data-testid="gantt-tap"]');
		expect(tap).not.toBeNull();
		expect(tap!.getAttribute('aria-hidden')).toBe('true');
		expect(tap!.getAttribute('data-source')).toBe('tap-source');
		const line = mark.querySelector('[data-gantt-line]')!;
		const dot = mark.querySelector('.station-dot')!;
		expect(line.compareDocumentPosition(tap!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(tap!.compareDocumentPosition(dot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		let clipped = false;
		for (
			let e = tap!.parentElement;
			e && e !== mark.parentElement?.parentElement;
			e = e.parentElement
		) {
			const s = getComputedStyle(e);
			clipped ||= ['hidden', 'clip'].includes(s.overflowX) || s.clipPath !== 'none';
		}
		expect(clipped).toBe(true);
		expect(
			screen.container
				.querySelector('svg [data-testid="gantt-dependency"]')!
				.parentElement!.querySelector('[data-testid="gantt-tap"]')
		).toBeNull();
	});

	it('sorts satisfied paths before open paths without remounting, reparenting or rerouting them', async () => {
		const screen = await render(GanttTest, { workspace: ws });
		const paths = [
			...screen.container.querySelectorAll<SVGPathElement>('[data-testid="gantt-dependency"]')
		];
		const sourcePath = paths.find((p) => p.dataset.from === 'tap-source')!;
		const parent = sourcePath.parentNode;
		const d = sourcePath.getAttribute('d');
		updateTask(ws, 'tap-source', { status: 'done' });
		flushSync();
		const after = [
			...screen.container.querySelectorAll<SVGPathElement>('[data-testid="gantt-dependency"]')
		];
		expect(after[0]).toBe(sourcePath);
		expect(after.every((p) => p.parentNode === parent)).toBe(true);
		expect(after.every((p) => paths.includes(p))).toBe(true);
		expect(sourcePath.getAttribute('d')).toBe(d);
		expect(getComputedStyle(sourcePath).opacity).toBe('1');
	});

	it('uses the measured width before paint and reroutes each changed container width once', async () => {
		vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 0);
		const screen = await render(GanttTest, { workspace: ws });
		const measured = observers
			.flatMap((o) => [...o.targets])
			.find((target) => target.querySelector('[data-testid="gantt-dependency"]'))!;
		const sceneWidth = () => vi.mocked(ganttScene).mock.calls.at(-1)![2].width;
		// No observer delivery or animation frame is needed for the mounted width.
		expect(sceneWidth()).toBe(measured.clientWidth);
		const observer = observers.find((o) => o.targets.has(measured))!;
		const notify = () => {
			observer.callback([], {} as ResizeObserver);
			flushSync();
		};
		const wrapper = screen.container.querySelector<HTMLElement>('div[style]')!;
		for (const width of [900, 800, 700]) {
			vi.mocked(ganttScene).mockClear();
			wrapper.style.width = `${width}px`;
			notify();
			expect(ganttScene).toHaveBeenCalledTimes(1);
			expect(sceneWidth()).toBe(measured.clientWidth);
			notify();
			expect(ganttScene).toHaveBeenCalledTimes(1);
		}
		await screen.unmount();
		expect(observer.targets.size).toBe(0);
	});

	it('uses one 40 percent stage mix for finished subtask lines and full stage ink for their dots', async () => {
		const screen = await render(GanttTest, { workspace: ws });
		const mark = screen.container.querySelector<HTMLElement>(
			'[data-task-id="child"] [data-testid="gantt-bar"]'
		)!;
		const sample = (color: string) => {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 1;
			const context = canvas.getContext('2d')!;
			context.fillStyle = color;
			context.fillRect(0, 0, 1, 1);
			return [...context.getImageData(0, 0, 1, 1).data];
		};
		const dot = mark.querySelector('.station-dot')!;
		const full = sample(getComputedStyle(dot).color);
		const probe = document.createElement('span');
		mark.append(probe);
		for (const status of ['done', 'canceled'] as const) {
			updateTask(ws, 'child', { status });
			flushSync();
			await expect
				.poll(() => mark.querySelector('[data-gantt-line]')!.getAnimations().length)
				.toBe(0);
			probe.style.color = `color-mix(in oklab, rgb(${full.slice(0, 3).join(' ')}) 40%, var(--background))`;
			expect(
				sample(getComputedStyle(mark.querySelector('[data-gantt-line]')!).backgroundColor)
			).toEqual(sample(getComputedStyle(probe).color));
			expect(sample(getComputedStyle(dot).color)).toEqual(full);
		}
		probe.remove();
	});

	const hoverEmptyBand = async (row: Element) => {
		const bounds = row.getBoundingClientRect();
		const view = row.closest('[data-testid="gantt-scroller"]')!.getBoundingClientRect();
		const label = row.querySelector('[data-testid="gantt-label"]')!.parentElement!;
		const mark = row.querySelector('[data-testid="gantt-bar"]')!;
		const x =
			(Math.max(label.getBoundingClientRect().right, view.left, 0) +
				Math.min(bounds.right, view.right, window.innerWidth)) /
			2;
		const y = Math.min(bounds.bottom, view.bottom, window.innerHeight) - 3;
		expect(x).toBeGreaterThan(label.getBoundingClientRect().right);
		expect(y).toBeGreaterThan(mark.getBoundingClientRect().bottom);
		expect(x).toBeGreaterThanOrEqual(view.left);
		expect(x).toBeLessThan(Math.min(bounds.right, view.right, window.innerWidth));
		expect(y).toBeGreaterThanOrEqual(Math.max(bounds.top, view.top, 0));
		expect(y).toBeLessThan(Math.min(bounds.bottom, view.bottom, window.innerHeight));
		// Send the move at the band point. A real pointer move is not reliable after an earlier focus() in this file.
		document.elementFromPoint(x, y)!.dispatchEvent(
			new PointerEvent('pointermove', {
				bubbles: true,
				clientX: x,
				clientY: y,
				pointerType: 'mouse'
			})
		);
		await new Promise(requestAnimationFrame);
		flushSync();
	};
	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	it('starts cold hover intent in the empty timeline band and highlights the label cell', async () => {
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		const row = screen.container.querySelector('[data-testid="gantt-row"][data-task-id="parent"]')!;
		const label = row.querySelector('[data-testid="gantt-label"]')!.parentElement!;
		const restBackground = getComputedStyle(label).backgroundColor;
		expect(editing.routeId).toBeNull();
		await hoverEmptyBand(row);
		await wait(350);
		expect(editing.routeId).toBe('parent');
		expect(row.getAttribute('data-route')).toBe('lit');
		expect(row.getAttribute('data-highlighted')).toBe('true');
		expect(editing.highlightId).toBe('parent');
		expect(getComputedStyle(label).backgroundColor).not.toBe(restBackground);
		expect(
			screen.container.querySelector('[data-task-id="point"]')!.getAttribute('data-route')
		).toBe('off');
	});

	it('keeps one intent deadline from label through band to mark and stays lit over the band', async () => {
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		const row = screen.container.querySelector('[data-testid="gantt-row"][data-task-id="parent"]')!;
		const label = row.querySelector('[data-testid="gantt-label"]')!;
		const mark = row.querySelector('[data-testid="gantt-bar"]')!;
		await userEvent.hover(label);
		const enteredAt = performance.now();
		await wait(100);
		await hoverEmptyBand(row);
		await wait(100);
		await userEvent.hover(mark);
		// Check the original deadline, before a new cold rest on the mark could finish.
		await wait(Math.max(0, 350 - (performance.now() - enteredAt)));
		expect(editing.routeId).toBe('parent');
		expect(row.getAttribute('data-route')).toBe('lit');
		await hoverEmptyBand(row);
		await wait(300);
		expect(editing.routeId).toBe('parent');
		expect(row.getAttribute('data-highlighted')).toBe('true');
	});

	it('highlights the label cell without a shadow on the highlighted or route-focused mark', async () => {
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		const row = screen.container.querySelector('[data-testid="gantt-row"][data-task-id="parent"]')!;
		const label = row.querySelector('[data-testid="gantt-label"]')!;
		const cell = label.parentElement!;
		const mark = row.querySelector('[data-testid="gantt-bar"]')!;
		const restBackground = getComputedStyle(cell).backgroundColor;
		await userEvent.hover(label);
		await new Promise(requestAnimationFrame);
		flushSync();
		expect(row.getAttribute('data-highlighted')).toBe('true');
		await expect.poll(() => getComputedStyle(cell).backgroundColor).not.toBe(restBackground);
		expect(getComputedStyle(mark).boxShadow).toBe('none');
		await wait(350);
		expect(editing.routeId).toBe('parent');
		expect(getComputedStyle(mark).boxShadow).toBe('none');
	});

	it('keeps base identity, order and parent through route changes, with cycle signs above overlays', async () => {
		updateTask(ws, 'parent', { status: 'done' });
		ws.commit((plan) => {
			const stageId = plan.stages[0].id;
			plan.tasks.push(
				makeTask({
					id: 'cycle-a',
					stageId,
					start: '2027-01-03',
					end: '2027-01-04',
					dependsOn: ['cycle-b']
				}),
				makeTask({
					id: 'cycle-b',
					stageId,
					start: '2027-01-06',
					end: '2027-01-08',
					dependsOn: ['cycle-a']
				})
			);
		});
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		const bases = () => [
			...screen.container.querySelectorAll<SVGPathElement>('[data-testid="gantt-dependency"]')
		];
		const before = bases();
		const parent = before[0].parentNode;
		const source = screen.container.querySelector(
			'[data-task-id="parent"] [data-testid="gantt-bar"]'
		)!;
		const name = source.getAttribute('aria-label');
		// Hover opens Hint. Compare only descriptions outside that tooltip.
		const descriptions = () =>
			(source.getAttribute('aria-describedby') ?? '')
				.split(/\s+/)
				.filter(Boolean)
				.filter((id) => !document.getElementById(id)?.matches('[data-slot="tooltip-content"]'));
		const description = descriptions();
		await ganttPointer(source, 'pointermove');
		await expect
			.poll(() => screen.container.querySelectorAll('[data-route-layer="ink"]').length)
			.toBe(1);
		const ink = screen.container.querySelector<SVGPathElement>('[data-route-layer="ink"]')!;
		const casing = screen.container.querySelector<SVGPathElement>('[data-route-layer="casing"]')!;
		expect(ink.dataset.overlayFor).toBe('parent->target');
		const probe = document.createElement('span');
		screen.container.append(probe);
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const context = canvas.getContext('2d')!;
		const sample = (paint: string) => {
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = paint;
			context.fillRect(0, 0, 1, 1);
			return [...context.getImageData(0, 0, 1, 1).data];
		};
		probe.style.color = 'var(--foreground)';
		await expect
			.poll(() => sample(getComputedStyle(ink).stroke))
			.toEqual(sample(getComputedStyle(probe).color));
		probe.style.color = 'var(--background)';
		await expect
			.poll(() => sample(getComputedStyle(casing).stroke))
			.toEqual(sample(getComputedStyle(probe).color));
		probe.remove();

		expect(getComputedStyle(casing).strokeWidth).toBe('4px');
		for (const decoration of [ink, casing]) {
			expect(decoration.getAttribute('aria-hidden')).toBe('true');
			expect(decoration.hasAttribute('data-testid')).toBe(false);
		}
		const cycle = before.find((p) => p.dataset.cycle === 'true')!;
		expect(ink.compareDocumentPosition(cycle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(casing.compareDocumentPosition(ink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(cycle.hasAttribute('data-route')).toBe(false);
		expect(
			screen.container.querySelector(
				'[data-route-layer="ink"][data-overlay-for="cycle-a->cycle-b"]'
			)
		).toBeNull();
		for (const [i, path] of bases().entries()) {
			expect(path).toBe(before[i]);
			expect(path.parentNode).toBe(parent);
		}
		expect(bases()).toHaveLength(before.length);
		expect(source.getAttribute('aria-label')).toBe(name);
		expect(descriptions()).toEqual(description);
		await ganttPointer(source, 'pointerleave');
		flushSync();
		await expect.poll(() => before.every((p) => !p.hasAttribute('data-route'))).toBe(true);
		await expect.poll(() => screen.container.querySelectorAll('[data-route-layer]').length).toBe(0);
		expect(bases()).toEqual(before);
	});

	it('projects a hidden-subtask dialog alone and reconciles collapsed input rows', async () => {
		updateTask(ws, 'target', { dependsOn: ['child'] });
		const editing = new EditingState();
		const viewer = new ViewerState(new MemoryStorage());
		const screen = await render(GanttTest, { workspace: ws, editing, viewer });
		editing.openDetails('child', null);
		flushSync();
		expect(
			screen.container.querySelector('[data-task-id="parent"]')!.getAttribute('data-route')
		).toBe('lit');
		expect(
			screen.container
				.querySelector('[data-from="parent"][data-to="target"]')!
				.getAttribute('data-route')
		).toBe('lit');
		editing.detailsTaskId = null;
		viewer.toggleExpanded(ws.plan.id, 'parent');
		flushSync();
		const child = screen.container.querySelector(
			'[data-task-id="child"] [data-testid="gantt-bar"]'
		)!;
		await ganttPointer(child, 'pointermove');
		await expect.poll(() => editing.routeId).toBe('child');
		viewer.toggleExpanded(ws.plan.id, 'parent');
		flushSync();
		expect(editing.routeId).toBeNull();
		viewer.toggleExpanded(ws.plan.id, 'parent');
		flushSync();
		expect(editing.routeId).toBeNull();
	});

	it('dims every other task for isolated input while its linked highlight still responds', async () => {
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		const parent = screen.container.querySelector(
			'[data-task-id="parent"] [data-testid="gantt-bar"]'
		)!;
		await ganttPointer(parent, 'pointermove');
		await expect.poll(() => editing.routeId).toBe('parent');
		await ganttPointer(parent, 'pointerleave');
		const point = screen.container.querySelector('[data-testid="gantt-point"]')!;
		await ganttPointer(point, 'pointermove');
		await expect.poll(() => editing.routeId).toBe('point');
		expect(editing.highlightId).toBe('point');
		expect(
			screen.container.querySelector('[data-task-id="point"]')!.getAttribute('data-route')
		).toBe('lit');
		for (const row of screen.container.querySelectorAll(
			'[data-testid="gantt-row"]:not([data-task-id="point"])'
		)) {
			expect(row.getAttribute('data-route')).toBe('off');
		}
		await expect.poll(() => screen.container.querySelectorAll('[data-route-layer]').length).toBe(0);
	});

	it('inserts route decorations at the current six points during a running edge tween', async () => {
		let time = 0,
			id = 0;
		const pending = new Map<number, FrameRequestCallback>();
		vi.spyOn(performance, 'now').mockImplementation(() => time);
		vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((fn) => {
			pending.set(++id, fn);
			return id;
		});
		vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((key) => {
			pending.delete(key);
		});
		const frame = (at: number) => {
			time = at;
			const callbacks = [...pending.values()];
			pending.clear();
			for (const callback of callbacks) callback(at);
			flushSync();
		};
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		frame(300);
		const base = screen.container.querySelector<SVGPathElement>(
			'[data-from="parent"][data-to="target"]'
		)!;
		const before = base.getAttribute('d');
		updateTask(ws, 'target', { start: '2027-01-17', end: '2027-01-19' });
		flushSync();
		frame(300);
		frame(380);
		const moving = base.getAttribute('d');
		expect(moving).not.toBe(before);
		editing.routeFocus.toggleTouch('parent', 'parent-mark');
		flushSync();
		const paths = [
			...screen.container.querySelectorAll<SVGPathElement>(
				'[data-overlay-for="parent->target"][data-route-layer]'
			)
		];
		expect(paths).toHaveLength(2);
		for (const path of paths) expect(path.getAttribute('d')).toBe(moving);
		for (const at of [420, 460, 540]) {
			frame(at);
			// Read all related paths in the same frame.
			const snapshot = [base, ...paths].map((p) => p.getAttribute('d'));
			expect(new Set(snapshot).size).toBe(1);
		}
		frame(2000);
		await screen.unmount();
		frame(3000);
	});

	it('continues overlay paint through interrupted entry, exit and return without endpoint jumps', async () => {
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		const selector = '[data-overlay-for="parent->target"][data-route-layer]';
		const paths = () => [...screen.container.querySelectorAll<SVGPathElement>(selector)];
		const animate = Element.prototype.animate;
		vi.spyOn(Element.prototype, 'animate').mockImplementation(function (
			this: Element,
			frames,
			options
		) {
			const animation = animate.call(this, frames, options);
			// Control color progress so the assertion does not depend on frame delivery speed.
			if (this.matches(selector) && Number(animation.effect!.getTiming().duration) > 0) {
				animation.pause();
			}
			return animation;
		});
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const context = canvas.getContext('2d')!;
		const paint = () =>
			paths().map((path) => {
				const style = getComputedStyle(path);
				expect(style.opacity).toBe('1');
				context.clearRect(0, 0, 1, 1);
				context.fillStyle = style.stroke.replaceAll('currentcolor', style.color);
				context.fillRect(0, 0, 1, 1);
				return context.getImageData(0, 0, 1, 1).data[3];
			});
		let animations: Animation[] = [];
		const seek = (fraction: number) => {
			for (const animation of animations) {
				animation.pause();
				animation.currentTime = Number(animation.effect!.getTiming().duration) * fraction;
			}
			return paint();
		};
		const pauseNewPhase = async (fraction: number) => {
			const previous = animations;
			// Wait for the new color animations, not Svelte's zero-duration setup animation.
			await expect
				.poll(() =>
					paths().every((path) =>
						path
							.getAnimations()
							.some(
								(animation) =>
									!previous.includes(animation) &&
									Number(animation.effect!.getTiming().duration) > 0 &&
									(animation.effect as KeyframeEffect)
										.getKeyframes()
										.some((frame) => 'stroke' in frame)
							)
					)
				)
				.toBe(true);
			animations = paths().map((path) =>
				path
					.getAnimations()
					.filter(
						(animation) =>
							!previous.includes(animation) &&
							Number(animation.effect!.getTiming().duration) > 0 &&
							(animation.effect as KeyframeEffect).getKeyframes().some((frame) => 'stroke' in frame)
					)
					.at(-1)!
			);
			return seek(fraction);
		};
		const expectContinuous = (before: number[], after: number[]) => {
			expect(after).toHaveLength(2);
			for (const [i, value] of after.entries()) {
				expect(value).toBeGreaterThan(0);
				expect(value).toBeLessThan(255);
				expect(Math.abs(value - before[i])).toBeLessThanOrEqual(2);
			}
		};
		editing.routeFocus.toggleTouch('parent', 'parent-mark');
		flushSync();
		expect(paths()).toHaveLength(2);
		const entry = await pauseNewPhase(0.5);
		expect(entry.every((a) => a > 0 && a < 255)).toBe(true);
		editing.routeFocus.clearPointer();
		flushSync();
		expect(
			screen.container.querySelector('[data-task-id="parent"]')!.hasAttribute('data-route')
		).toBe(false);
		expectContinuous(entry, await pauseNewPhase(0));
		const exit = seek(0.5);
		expect(exit.every((a, i) => a > 0 && a < entry[i])).toBe(true);
		editing.routeFocus.toggleTouch('parent', 'parent-mark');
		flushSync();
		expect(paths()).toHaveLength(2);
		expectContinuous(exit, await pauseNewPhase(0));
		for (const path of paths()) for (const animation of path.getAnimations()) animation.finish();
		await expect.poll(paint).toEqual([255, 255]);
		editing.routeFocus.clearPointer();
		flushSync();
		await pauseNewPhase(0.5);
		for (const animation of animations) animation.finish();
		await expect.poll(() => paths().length).toBe(0);
	});

	it('keeps every row classified throughout a warm switch and leave grace', async () => {
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const mark = (id: string) =>
				screen.container.querySelector(`[data-task-id="${id}"] [data-testid="gantt-bar"]`)!;
			const membership = () =>
				[...screen.container.querySelectorAll('[data-testid="gantt-row"]')].map((row) =>
					row.getAttribute('data-route')
				);
			await ganttPointer(mark('parent'), 'pointermove');
			vi.advanceTimersByTime(HOVER_COLD_MS);
			flushSync();
			expect(editing.routeId).toBe('parent');
			const before = membership();
			expect(before.every(Boolean)).toBe(true);
			await ganttPointer(mark('parent'), 'pointerleave');
			await ganttPointer(mark('tap-source'), 'pointermove');
			for (let ms = 0; ms < 120; ms++) {
				flushSync();
				expect(editing.routeId).toBe('parent');
				expect(membership()).toEqual(before);
				vi.advanceTimersByTime(1);
			}
			flushSync();
			expect(editing.routeId).toBe('tap-source');
			expect(membership().every(Boolean)).toBe(true);
			await ganttPointer(mark('tap-source'), 'pointerleave');
			vi.advanceTimersByTime(HOVER_GRACE_MS - 1);
			flushSync();
			expect(membership().every(Boolean)).toBe(true);
			vi.advanceTimersByTime(1);
			flushSync();
			expect(editing.routeId).toBeNull();
			expect(membership().every((value) => value === null)).toBe(true);
		} finally {
			await screen.unmount();
			vi.useRealTimers();
		}
	});

	it('keeps cold, warm and grace timers under reduced motion with immediate final paint', async () => {
		routeMotion.reduced = true;
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const parent = screen.container.querySelector('[data-task-id="parent"]')!;
			const mark = parent.querySelector('[data-testid="gantt-bar"]')!;
			await ganttPointer(mark, 'pointermove');
			vi.advanceTimersByTime(HOVER_COLD_MS - 1);
			flushSync();
			expect(editing.routeId).toBeNull();
			expect(parent.hasAttribute('data-route')).toBe(false);
			vi.advanceTimersByTime(1);
			flushSync();
			expect(parent.getAttribute('data-route')).toBe('lit');
			const overlay = screen.container.querySelector('[data-route-layer="ink"]')!;
			expect(overlay).not.toBeNull();
			expect(getComputedStyle(overlay).opacity).toBe('1');
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 1;
			const context = canvas.getContext('2d')!;
			context.fillStyle = getComputedStyle(overlay).stroke;
			context.fillRect(0, 0, 1, 1);
			expect(context.getImageData(0, 0, 1, 1).data[3]).toBe(255);
			expect(getComputedStyle(mark.querySelector('[data-gantt-line]')!).transitionDuration).toBe(
				'0s'
			);
			await ganttPointer(mark, 'pointerleave');
			const next = screen.container.querySelector(
				'[data-task-id="tap-source"] [data-testid="gantt-bar"]'
			)!;
			await ganttPointer(next, 'pointermove');
			vi.advanceTimersByTime(119);
			flushSync();
			expect(editing.routeId).toBe('parent');
			vi.advanceTimersByTime(1);
			flushSync();
			expect(editing.routeId).toBe('tap-source');
			await ganttPointer(next, 'pointerleave');
			vi.advanceTimersByTime(HOVER_GRACE_MS - 1);
			flushSync();
			expect(editing.routeId).toBe('tap-source');
			vi.advanceTimersByTime(1);
			flushSync();
			expect(editing.routeId).toBeNull();
			expect(screen.container.querySelectorAll('[data-route-layer]')).toHaveLength(0);
		} finally {
			await screen.unmount();
			vi.useRealTimers();
		}
	});

	it('keeps unlit branches dim inside a shared trunk and taps tied to their own source', async () => {
		ws.commit((plan) => {
			const stageId = plan.stages[0].id;
			const task = (id: string, dependsOn: string[] = [], late = false) =>
				makeTask({
					id,
					stageId,
					dependsOn,
					start: late ? '2027-01-20' : '2027-01-02',
					end: late ? '2027-02-05' : '2027-01-05'
				});
			plan.tasks = [
				task('source-a', [], true),
				task('source-b', [], true),
				task('first', ['source-a', 'source-b']),
				task('middle', ['source-a', 'source-b']),
				task('last', ['source-a', 'source-b'])
			];
		});
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		// This target leaves an upper branch outside the lit route.
		editing.routeFocus.toggleTouch('last', 'last-mark');
		flushSync();
		const rings = [...screen.container.querySelectorAll('[data-testid="gantt-junction"]')];
		expect(rings.some((ring) => ring.getAttribute('data-route') === 'lit')).toBe(true);
		expect(rings.some((ring) => ring.getAttribute('data-route') === 'off')).toBe(true);
		const keys = rings.map((ring) => ring.getAttribute('data-junction-key'));
		expect(keys.every(Boolean)).toBe(true);
		editing.routeFocus.toggleTouch('source-a', 'source-a-mark');
		flushSync();
		const a = screen.container.querySelector('[data-testid="gantt-tap"][data-source="source-a"]');
		const b = screen.container.querySelector('[data-testid="gantt-tap"][data-source="source-b"]');
		expect(a).not.toBeNull();
		expect(b).not.toBeNull();
		expect(a!.getAttribute('data-route')).toBe('lit');
		expect(b!.getAttribute('data-route')).toBe('off');
		expect(a!.getAttribute('data-junction-key')).toBeTruthy();
		expect(b!.getAttribute('data-junction-key')).toBeTruthy();
		expect(rings.map((ring) => ring.getAttribute('data-junction-key'))).toEqual(keys);
	});

	it('keeps labels, ready lights, bands, Today and milestones at normal paint', async () => {
		ws.commit((plan) => {
			plan.bands = [
				{ id: 'band', title: 'Band', color: 'gray', start: '2027-01-01', end: '2027-01-20' }
			];
			plan.milestones = [
				{
					id: 'milestone',
					title: 'Milestone',
					description: '',
					symbol: 'diamond',
					date: '2027-01-10'
				}
			];
		});
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		const snapshot = () =>
			[
				...screen.container.querySelectorAll(
					'[data-testid="gantt-label"], [data-testid="ready-dot"], [data-testid="gantt-band"], [data-testid="gantt-today"], [data-testid="gantt-milestone"]'
				)
			].map((element) => {
				const style = getComputedStyle(element);
				return {
					element,
					color: style.color,
					background: style.backgroundColor,
					border: style.borderLeftColor,
					opacity: style.opacity
				};
			});
		const before = snapshot();
		expect(before.length).toBeGreaterThan(5);
		editing.routeFocus.toggleTouch('parent', 'parent-mark');
		flushSync();
		expect(
			screen.container.querySelector('[data-task-id="point"]')!.getAttribute('data-route')
		).toBe('off');
		expect(snapshot()).toEqual(before);
	});

	it('wires one raw stage 30 percent mix to off-route finished and unfinished subtask marks', async () => {
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		const mark = screen.container.querySelector(
			'[data-task-id="child"] [data-testid="gantt-bar"]'
		)!;
		const dot = mark.querySelector('.station-dot')!;
		const raw = getComputedStyle(dot).color;
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const context = canvas.getContext('2d')!;
		const sample = (color: string) => {
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = color;
			context.fillRect(0, 0, 1, 1);
			return [...context.getImageData(0, 0, 1, 1).data];
		};
		const probe = document.createElement('span');
		mark.append(probe);
		probe.style.color = `color-mix(in oklab, ${raw} 30%, var(--background))`;
		const expected = sample(getComputedStyle(probe).color);
		editing.routeFocus.toggleTouch('tap-source', 'tap-source-mark');
		flushSync();
		expect(mark.closest('[data-testid="gantt-row"]')!.getAttribute('data-route')).toBe('off');
		for (const status of ['done', 'todo'] as const) {
			updateTask(ws, 'child', { status });
			flushSync();
			await expect
				.poll(() =>
					sample(getComputedStyle(mark.querySelector('[data-gantt-line]')!).backgroundColor)
				)
				.toEqual(expected);
			await expect.poll(() => sample(getComputedStyle(dot).color)).toEqual(expected);
			for (let element: Element | null = dot; element; element = element.parentElement)
				expect(getComputedStyle(element).opacity).toBe('1');
		}
		probe.style.color = 'var(--background)';
		expect(sample(getComputedStyle(dot.querySelectorAll('circle')[1]).fill)).toEqual(
			sample(getComputedStyle(probe).color)
		);
		probe.remove();
	});

	it('builds one effective graph per index across route input and collapsed unions', async () => {
		vi.mocked(effectiveDependencyGraph).mockClear();
		const editing = new EditingState(),
			viewer = new ViewerState(new MemoryStorage());
		const screen = await render(GanttTest, { workspace: ws, editing, viewer });
		expect(effectiveDependencyGraph).toHaveBeenCalledTimes(1);
		for (const id of ['parent', 'target', 'parent']) {
			editing.routeFocus.toggleTouch(id, `mark-${id}`);
			flushSync();
		}
		expect(effectiveDependencyGraph).toHaveBeenCalledTimes(1);
		updateTask(ws, 'target', { dependsOn: ['child'] });
		flushSync();
		expect(effectiveDependencyGraph).toHaveBeenCalledTimes(2);
		await screen.unmount();
	});

	it('accepts keyboard focus on a route mark without its test id', async () => {
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		const point = screen.getByTestId('gantt-point').element() as HTMLElement;
		const label = point
			.closest('[data-testid="gantt-row"]')!
			.querySelector<HTMLElement>('[data-testid="gantt-label"]')!;
		// Keep the source hooks. Only this rendered mark has its test id removed.
		point.removeAttribute('data-testid');
		await userEvent.click(label);
		await userEvent.tab();
		expect(document.activeElement).toBe(point);
		expect(point.matches(':focus-visible')).toBe(true);
		expect(editing.routeId).toBe('point');
		expect(point.getAttribute('data-route-target')).toBe('point');
		expect(point.closest('[data-testid="gantt-row"]')!.getAttribute('data-route')).toBe('lit');
	});

	it('clears plan input on switch and disposes an intent timer on unmount', async () => {
		const editing = new EditingState();
		const originalPlan = ws.plan.id;
		const screen = await render(GanttTest, { workspace: ws, editing });
		const mark = () =>
			screen.container.querySelector('[data-task-id="parent"] [data-testid="gantt-bar"]')!;
		await ganttPointer(mark(), 'pointermove');
		await expect.poll(() => editing.routeId).toBe('parent');
		ws.createPlan();
		flushSync();
		expect(editing.routeId).toBeNull();
		ws.switchTo(originalPlan);
		flushSync();
		expect(editing.routeId).toBeNull();
		await ganttPointer(mark(), 'pointermove');
		await screen.unmount();
		await new Promise((resolve) => setTimeout(resolve, HOVER_COLD_MS + HOVER_SCHEDULING_MARGIN_MS));
		expect(editing.routeId).toBeNull();
	});
});
