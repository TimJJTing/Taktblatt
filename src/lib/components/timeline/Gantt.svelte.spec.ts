import '../../../routes/layout.css';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { EditingState } from '#lib/state/editing.svelte.ts';
import { ViewerState } from '#lib/state/viewer.svelte.ts';
import { updateTask } from '#lib/state/commands.ts';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import { effectiveDependencyGraph } from '#lib/domain/route.ts';
import { ganttScene } from '#lib/scene/gantt-scene.ts';
import GanttTest from './Gantt.test.svelte';

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

	it('lights from mark and label intent while keeping linked highlight immediate', async () => {
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		const row = screen.container.querySelector('[data-testid="gantt-row"][data-task-id="parent"]')!;
		for (const target of [
			row.querySelector('[data-testid="gantt-bar"]')!,
			row.querySelector('[data-testid="gantt-label"]')!.parentElement!
		]) {
			target.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
			flushSync();
			expect(editing.highlightId).toBe('parent');
			await expect.poll(() => row.getAttribute('data-route')).toBe('lit');
			expect(
				screen.container.querySelector('[data-task-id="child"]')!.getAttribute('data-route')
			).toBe('off');
			target.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
			flushSync();
			expect(row.hasAttribute('data-route')).toBe(false);
		}
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
		const description = source.getAttribute('aria-describedby');
		source.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
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
		expect(source.getAttribute('aria-describedby')).toBe(description);
		source.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		flushSync();
		expect(before.every((p) => !p.hasAttribute('data-route'))).toBe(true);
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
		child.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		await expect.poll(() => editing.routeId).toBe('child');
		viewer.toggleExpanded(ws.plan.id, 'parent');
		flushSync();
		expect(editing.routeId).toBeNull();
		viewer.toggleExpanded(ws.plan.id, 'parent');
		flushSync();
		expect(editing.routeId).toBeNull();
	});

	it('keeps isolated input inactive while its linked highlight still responds', async () => {
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		const parent = screen.container.querySelector(
			'[data-task-id="parent"] [data-testid="gantt-bar"]'
		)!;
		parent.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		await expect.poll(() => editing.routeId).toBe('parent');
		parent.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		const point = screen.container.querySelector('[data-testid="gantt-point"]')!;
		point.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		await expect.poll(() => editing.routeId).toBe('point');
		expect(editing.highlightId).toBe('point');
		expect(screen.container.querySelectorAll('[data-testid="gantt-row"][data-route]')).toHaveLength(
			0
		);
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

	it('fades overlay stroke color on entry, exit and return while clearing membership immediately', async () => {
		const editing = new EditingState();
		const screen = await render(GanttTest, { workspace: ws, editing });
		const selector = '[data-overlay-for="parent->target"][data-route-layer="ink"]';
		const alpha = () => {
			const path = screen.container.querySelector(selector);
			if (!path) return null;
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 1;
			const context = canvas.getContext('2d')!;
			const style = getComputedStyle(path);
			context.fillStyle = style.stroke.replaceAll('currentcolor', style.color);
			context.fillRect(0, 0, 1, 1);
			expect(style.opacity).toBe('1');
			return context.getImageData(0, 0, 1, 1).data[3];
		};
		const sample = async (until: (value: number | null) => boolean) => {
			const samples: (number | null)[] = [];
			for (let i = 0; i < 40; i++) {
				await new Promise(requestAnimationFrame);
				const value = alpha();
				samples.push(value);
				if (until(value)) break;
			}
			return samples;
		};
		editing.routeFocus.toggleTouch('parent', 'parent-mark');
		flushSync();
		expect(screen.container.querySelector(selector)).not.toBeNull();
		const entry = await sample((value) => value === 255);
		expect(entry.some((a) => a !== null && a > 0 && a < 255)).toBe(true);
		expect(entry.at(-1)).toBe(255);
		editing.routeFocus.clearPointer();
		flushSync();
		expect(
			screen.container.querySelector('[data-task-id="parent"]')!.hasAttribute('data-route')
		).toBe(false);
		const exit = await sample((value) => value !== null && value > 0 && value < 255);
		expect(exit.some((a) => a !== null && a > 0 && a < 255)).toBe(true);
		expect(screen.container.querySelector(selector)!.getAttribute('aria-hidden')).toBe('true');
		editing.routeFocus.toggleTouch('parent', 'parent-mark');
		flushSync();
		expect(screen.container.querySelectorAll(selector)).toHaveLength(1);
		await sample((value) => value === 255);
		expect(alpha()).toBe(255);
		editing.routeFocus.clearPointer();
		flushSync();
		await sample((value) => value === null);
		expect(screen.container.querySelectorAll('[data-route-layer]')).toHaveLength(0);
	});

	it('keeps pointer intent under reduced motion and applies final route paint immediately', async () => {
		routeMotion.reduced = true;
		const screen = await render(GanttTest, { workspace: ws });
		const parent = screen.container.querySelector('[data-task-id="parent"]')!;
		const mark = parent.querySelector('[data-testid="gantt-bar"]')!;
		const entered = performance.now();
		mark.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		flushSync();
		expect(parent.hasAttribute('data-route')).toBe(false);
		await expect.poll(() => parent.getAttribute('data-route')).toBe('lit');
		expect(performance.now() - entered).toBeGreaterThanOrEqual(120);
		const overlay = screen.container.querySelector('[data-route-layer="ink"]');
		expect(overlay).not.toBeNull();
		expect(getComputedStyle(overlay!).opacity).toBe('1');
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const context = canvas.getContext('2d')!;
		context.fillStyle = getComputedStyle(overlay!).stroke;
		context.fillRect(0, 0, 1, 1);
		expect(context.getImageData(0, 0, 1, 1).data[3]).toBe(255);
		expect(getComputedStyle(mark.querySelector('[data-gantt-line]')!).transitionDuration).toBe(
			'0s'
		);
		mark.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		flushSync();
		expect(screen.container.querySelectorAll('[data-route-layer]')).toHaveLength(0);
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
		editing.routeFocus.toggleTouch('first', 'first-mark');
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

	it('clears plan input on switch and disposes an intent timer on unmount', async () => {
		const editing = new EditingState();
		const originalPlan = ws.plan.id;
		const screen = await render(GanttTest, { workspace: ws, editing });
		const mark = () =>
			screen.container.querySelector('[data-task-id="parent"] [data-testid="gantt-bar"]')!;
		mark().dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		await expect.poll(() => editing.routeId).toBe('parent');
		ws.createPlan();
		flushSync();
		expect(editing.routeId).toBeNull();
		ws.switchTo(originalPlan);
		flushSync();
		expect(editing.routeId).toBeNull();
		mark().dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		await screen.unmount();
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(editing.routeId).toBeNull();
	});
});
