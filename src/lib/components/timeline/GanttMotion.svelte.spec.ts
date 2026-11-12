import '../../../routes/layout.css';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { updateTask } from '#lib/state/commands.ts';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import { ganttScene, type GanttMarkGeom } from '#lib/scene/gantt-scene.ts';
import type { Track } from '#lib/scene/types.ts';
import GanttTest from './Gantt.test.svelte';

vi.mock('#lib/scene/gantt-scene.ts', { spy: true });

describe('rendered Gantt geometry motion', () => {
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
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('station geometry motion', () => {
		let time = 0;
		let nextFrame = 0;
		let pending = new Map<number, FrameRequestCallback>();
		const frame = (at: number) => {
			time = at;
			const callbacks = [...pending.values()];
			pending.clear();
			for (const callback of callbacks) callback(time);
			flushSync();
		};
		beforeEach(() => {
			time = 0;
			pending = new Map();
			vi.spyOn(performance, 'now').mockImplementation(() => time);
			vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
				pending.set(++nextFrame, callback);
				return nextFrame;
			});
			vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
				pending.delete(id);
			});
		});
		afterEach(() => {
			frame(time + 1000);
			frame(time + 1000);
		});

		it('keeps a moving milestone on its original deadline after an unrelated title edit', async () => {
			ws.commit((plan) => {
				plan.range = { start: '2027-01-01', end: '2027-01-31' };
				plan.milestones = [
					{
						id: 'release',
						title: 'Release',
						description: '',
						date: '2027-01-10',
						symbol: 'diamond'
					}
				];
			});
			const screen = await render(GanttTest, { workspace: ws });
			const milestone = screen.container.querySelector<HTMLElement>(
				'[data-testid="gantt-milestone"]'
			)!;
			frame(0);
			frame(300);
			const start = milestone.getBoundingClientRect().left;
			ws.commit((plan) => {
				plan.milestones[0].date = '2027-01-20';
			});
			flushSync();
			frame(300);
			frame(420);
			const moving = milestone.getBoundingClientRect().left;
			expect(moving).toBeGreaterThan(start);
			ws.commit((plan) => {
				plan.milestones[0].title = 'Updated release';
			});
			flushSync();
			frame(420);
			expect(milestone.getBoundingClientRect().left).toBeCloseTo(moving, 2);
			frame(540);
			const atDeadline = milestone.getBoundingClientRect().left;
			frame(780);
			expect(atDeadline).toBeCloseTo(milestone.getBoundingClientRect().left, 2);
		});

		it.each(['none', 'invalid', 'outside'] as const)(
			'places new bar and point bounds at their target from %s',
			async (kind) => {
				ws.commit((plan) => {
					plan.range = { start: '2027-01-01', end: '2027-01-31' };
					const dates =
						kind === 'none'
							? {}
							: kind === 'invalid'
								? { start: '2027-01-20', end: '2027-01-10' }
								: { start: '2027-02-10', end: '2027-02-15' };
					plan.tasks = [makeTask({ id: 'new-mark', stageId: plan.stages[0].id, ...dates })];
				});
				const screen = await render(GanttTest, { workspace: ws });
				frame(0);
				frame(300);
				for (const end of ['2027-01-20', null]) {
					updateTask(ws, 'new-mark', {
						start: kind === 'none' ? null : kind === 'invalid' ? '2027-01-20' : '2027-02-10',
						end: kind === 'none' ? null : kind === 'invalid' ? '2027-01-10' : '2027-02-15'
					});
					flushSync();
					frame(time + 300);
					updateTask(ws, 'new-mark', { start: '2027-01-10', end });
					flushSync();
					const mark = screen.container.querySelector<HTMLElement>(
						'[data-task-id="new-mark"] [role="img"][tabindex="0"]'
					)!;
					const target = vi
						.mocked(ganttScene)
						.mock.results.at(-1)!
						.value.marks.find((item: GanttMarkGeom) => item.id === 'new-mark')! as GanttMarkGeom;
					expect(parseFloat(mark.style.left)).toBeCloseTo(
						target.line?.x0 ?? target.stations[0].x - target.stations[0].r,
						2
					);
					expect(parseFloat(mark.style.width)).toBeCloseTo(
						target.line ? target.line.x1 - target.line.x0 : target.stations[0].r * 2,
						2
					);
					expect(parseFloat(mark.style.height)).toBe(
						Math.max(target.line?.height ?? 0, ...target.stations.map((station) => station.r * 2))
					);
					const before = mark.getBoundingClientRect().toJSON();
					frame(time + 120);
					expect(mark.getBoundingClientRect().toJSON()).toEqual(before);
				}
			}
		);

		it('moves shrunk and ordinary stations continuously with ports and focus bounds, including retarget and width snap', async () => {
			const year = { start: '2027-01-01', end: '2027-12-31' };
			const month = { start: '2027-01-01', end: '2027-01-31' };
			ws.commit((plan) => {
				plan.range = year;
				const stageId = plan.stages[0].id;
				plan.tasks = [
					makeTask({ id: 'tiny-source', stageId, start: '2027-01-10', end: '2027-01-10' }),
					makeTask({
						id: 'target',
						stageId,
						start: '2027-01-15',
						end: '2027-01-20',
						dependsOn: ['tiny-source']
					})
				];
			});
			const screen = await render(GanttTest, { workspace: ws });
			const path = screen.container.querySelector<SVGPathElement>(
				'[data-testid="gantt-dependency"][data-from="tiny-source"]'
			)!;
			const mark = screen.container.querySelector<HTMLElement>(
				'[data-task-id="tiny-source"] [data-testid="gantt-bar"]'
			)!;
			const notifyWidth = () => {
				const observer = observers.find((item) =>
					[...item.targets].some((target) => target.contains(path))
				)!;
				observer.callback([], {} as ResizeObserver);
				flushSync();
			};
			const snapshot = () => {
				const origin = path.ownerSVGElement!.getBoundingClientRect();
				const box = mark.getBoundingClientRect();
				const dots = [...mark.querySelectorAll<SVGSVGElement>('.station-dot')]
					.filter((dot) => getComputedStyle(dot).visibility !== 'hidden')
					.map((dot) => {
						const d = dot.getBoundingClientRect();
						return {
							x: (d.left + d.right) / 2 - origin.left,
							width: d.width,
							left: d.left - box.left,
							right: box.right - d.right,
							top: d.top - box.top,
							bottom: box.bottom - d.bottom
						};
					});
				const port = path.getPointAtLength(0);
				return { dots, port: port.x };
			};
			const enclosed = (sample: ReturnType<typeof snapshot>) => {
				for (const dot of sample.dots) {
					expect(dot.left).toBeGreaterThanOrEqual(-0.05);
					expect(dot.right).toBeGreaterThanOrEqual(-0.05);
					expect(dot.top).toBeGreaterThanOrEqual(-0.05);
					expect(dot.bottom).toBeGreaterThanOrEqual(-0.05);
				}
				expect(
					sample.dots.some((dot) => Math.abs(sample.port - dot.x) <= dot.width / 2 + 0.05)
				).toBe(true);
			};
			notifyWidth();
			frame(0);
			frame(300);
			const initial = snapshot();
			expect(initial.dots).toHaveLength(1);
			expect(initial.dots[0].width).toBeLessThan(4);
			enclosed(initial);
			ws.commit((plan) => {
				plan.range = month;
			});
			flushSync();
			frame(300);
			const start = snapshot();
			expect(start.dots[0].x).toBeCloseTo(initial.dots[0].x, 1);
			expect(start.dots[0].width).toBeCloseTo(initial.dots[0].width, 1);
			const target = vi
				.mocked(ganttScene)
				.mock.results.at(-1)!
				.value.marks.find((item: GanttMarkGeom) => item.id === 'tiny-source')!;
			expect(target.stations).toHaveLength(2);
			frame(420);
			const halfway = snapshot();
			expect(halfway.dots).toHaveLength(2);
			for (const [i, dot] of halfway.dots.entries()) {
				expect(dot.x).toBeCloseTo(
					initial.dots[0].x + (target.stations[i].x - initial.dots[0].x) * 0.875,
					1
				);
				expect(dot.width).toBeCloseTo(
					initial.dots[0].width + (target.stations[i].r * 2 - initial.dots[0].width) * 0.875,
					1
				);
			}
			enclosed(halfway);
			ws.commit((plan) => {
				plan.range = year;
			});
			flushSync();
			frame(420);
			const retarget = snapshot();
			expect(retarget.dots[0].x).toBeCloseTo(halfway.dots[0].x, 1);
			expect(retarget.dots[0].width).toBeCloseTo(halfway.dots[0].width, 1);
			frame(480);
			enclosed(snapshot());
			const wrapper = screen.container.querySelector<HTMLElement>('div[style]')!;
			wrapper.style.width = '1200px';
			notifyWidth();
			frame(480);
			const resizedTarget = vi
				.mocked(ganttScene)
				.mock.results.at(-1)!
				.value.marks.find((item: GanttMarkGeom) => item.id === 'tiny-source')!;
			const resized = snapshot();
			expect(resized.dots).toHaveLength(1);
			expect(resized.dots[0].x).toBeCloseTo(resizedTarget.stations[0].x, 1);
			expect(resized.dots[0].width).toBeCloseTo(resizedTarget.stations[0].r * 2, 1);
			enclosed(resized);
			frame(900);
			expect(snapshot()).toEqual(resized);
			expect(screen.container.querySelector('[data-testid="gantt-dependency"]')).toBe(path);
		});
		it('snaps a moving row, its stations and its tap to the resized connector route', async () => {
			ws.commit((plan) => {
				plan.range = { start: '2027-01-01', end: '2027-01-31' };
				const stageId = plan.stages[0].id;
				plan.tasks = [
					makeTask({ id: 'source', stageId, start: '2027-01-20', end: '2027-02-05' }),
					makeTask({
						id: 'target',
						stageId,
						start: '2027-01-10',
						end: '2027-01-15',
						dependsOn: ['source']
					})
				];
			});
			const screen = await render(GanttTest, { workspace: ws });
			const path = screen.container.querySelector<SVGPathElement>(
				'[data-testid="gantt-dependency"]'
			)!;
			const row = screen.container.querySelector<HTMLElement>('[data-task-id="source"]')!;
			const mark = row.querySelector<HTMLElement>('[data-testid="gantt-bar"]')!;
			const notifyWidth = () => {
				const observer = observers.find((item) =>
					[...item.targets].some((target) => target.contains(path))
				)!;
				observer.callback([], {} as ResizeObserver);
				flushSync();
			};
			const snapshot = () => {
				const port = path.getPointAtLength(0).matrixTransform(path.getScreenCTM()!);
				const markBox = mark.getBoundingClientRect();
				const dotBox = mark.querySelector('.station-dot')!.getBoundingClientRect();
				const tapBox = mark.querySelector('[data-testid="gantt-tap"]')!.getBoundingClientRect();
				return {
					port: port.y,
					mark: (markBox.top + markBox.bottom) / 2,
					dot: (dotBox.top + dotBox.bottom) / 2,
					tap: (tapBox.top + tapBox.bottom) / 2
				};
			};
			notifyWidth();
			frame(0);
			frame(300);
			const initial = snapshot();
			updateTask(ws, 'source', { start: '2027-01-05' });
			flushSync();
			frame(300);
			frame(420);
			const moving = snapshot();
			expect(moving.mark).toBeLessThan(initial.mark);
			expect(moving.mark).toBeCloseTo(moving.port, 1);
			const wrapper = screen.container.querySelector<HTMLElement>('div[style]')!;
			wrapper.style.width = '1200px';
			notifyWidth();
			frame(420);
			const resized = snapshot();
			const target = vi
				.mocked(ganttScene)
				.mock.results.at(-1)!
				.value.tracks.find((track: Track) => track.id === 'source')!;
			const targetY = path.ownerSVGElement!.getBoundingClientRect().top + target.center;
			expect(resized.port).toBeCloseTo(targetY, 1);
			for (const y of [resized.mark, resized.dot, resized.tap]) expect(y).toBeCloseTo(targetY, 1);
			frame(800);
			expect(snapshot()).toEqual(resized);
			expect(screen.container.querySelector('[data-testid="gantt-dependency"]')).toBe(path);
		});
	});
});
