import '../../../routes/layout.css';
import { describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import { ViewerState } from '#lib/state/viewer.svelte.ts';
import { ganttScene } from '#lib/scene/gantt-scene.ts';
import SheetsTest from './Sheets.test.svelte';

vi.mock('#lib/scene/gantt-scene.ts', { spy: true });

describe('shared whole-segment paper routing', () => {
	it('routes the whole segment once across sheets and rebuilds once for paper, range and expansion', async () => {
		const workspace = new Workspace(new MemoryStorage());
		const viewer = new ViewerState(new MemoryStorage());
		workspace.commit((plan) => {
			plan.range = { start: '2027-01-01', end: '2027-04-10' };
			const stageId = plan.stages[0].id;
			plan.tasks = Array.from({ length: 125 }, (_, i) =>
				makeTask({
					id: `task-${i}`,
					stageId,
					start: '2027-01-10',
					end: '2027-03-10',
					createdAt: new Date(Date.UTC(2030, 0, 1, 0, 0, i)).toISOString(),
					dependsOn: i === 124 ? ['task-0'] : []
				})
			);
			plan.tasks.push(
				makeTask({
					id: 'child',
					stageId,
					parentId: 'task-0',
					start: '2027-01-10',
					end: '2027-01-20'
				})
			);
		});
		vi.mocked(ganttScene).mockClear();
		const screen = await render(SheetsTest, { workspace, viewer });
		await document.fonts.ready;
		flushSync();
		const fragments = () =>
			screen.container.querySelectorAll('[data-fragment] [data-gantt-fragment]');
		expect(fragments().length).toBeGreaterThanOrEqual(3);
		const wholeCalls = (count: number) =>
			vi
				.mocked(ganttScene)
				.mock.calls.filter(
					([rows, , metrics]) =>
						rows.length === count && metrics.media === 'paper' && metrics.width > 0
				);
		expect(wholeCalls(125)).toHaveLength(1);
		const original = [
			...screen.container.querySelectorAll<SVGPathElement>(
				'[data-testid="sheet-gantt-dependency"][data-from="task-0"]'
			)
		].map((path) => path.getAttribute('d'));
		expect(original).toHaveLength(fragments().length);
		vi.mocked(ganttScene).mockClear();
		workspace.commit((plan) => {
			plan.paper = 'letter';
		});
		flushSync();
		expect(wholeCalls(125)).toHaveLength(1);
		const letterWidth = wholeCalls(125)[0][2].width;
		vi.mocked(ganttScene).mockClear();
		workspace.commit((plan) => {
			plan.range.end = '2027-05-10';
		});
		flushSync();
		expect(wholeCalls(125)).toHaveLength(1);
		expect(wholeCalls(125)[0][2].width).toBe(letterWidth);
		vi.mocked(ganttScene).mockClear();
		viewer.toggleExpanded(workspace.plan.id, 'task-0');
		flushSync();
		expect(wholeCalls(126)).toHaveLength(1);
		expect(
			screen.container.querySelectorAll(
				'[data-testid="sheets"] [data-testid="sheet-gantt-row"][data-task-id="child"]'
			)
		).toHaveLength(1);
		vi.mocked(ganttScene).mockClear();
		workspace.commit((plan) => {
			plan.paper = 'a4';
			plan.range.end = '2027-04-10';
		});
		viewer.toggleExpanded(workspace.plan.id, 'task-0');
		flushSync();
		expect(wholeCalls(125)).toHaveLength(1);
		expect(
			[
				...screen.container.querySelectorAll<SVGPathElement>(
					'[data-testid="sheet-gantt-dependency"][data-from="task-0"]'
				)
			].map((path) => path.getAttribute('d'))
		).toEqual(original);
	});
});
