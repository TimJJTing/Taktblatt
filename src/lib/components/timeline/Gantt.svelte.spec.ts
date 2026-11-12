import '../../../routes/layout.css';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { updateTask } from '#lib/state/commands.ts';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import { ganttScene } from '#lib/scene/gantt-scene.ts';
import GanttTest from './Gantt.test.svelte';

vi.mock('#lib/scene/gantt-scene.ts', { spy: true });

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
});
