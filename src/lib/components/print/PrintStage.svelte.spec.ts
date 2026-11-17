import '../../../routes/layout.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { buildPrintModel, type StageSegment, type LegendSegment } from '#lib/domain/print-model.ts';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { Workspace, getWorkspace } from '#lib/state/workspace.svelte.ts';
import PrintStage from './PrintStage.svelte';
import PrintLegend from './PrintLegend.svelte';

vi.mock('#lib/state/workspace.svelte.ts', async (original) => ({
	...(await original<typeof import('#lib/state/workspace.svelte.ts')>()),
	getWorkspace: vi.fn()
}));

describe('paper stage signs', () => {
	let ws: Workspace;
	beforeEach(() => {
		ws = new Workspace(new MemoryStorage());
		ws.commit((plan) => {
			plan.stages[0].title = 'Prepare';
			plan.stages[0].color = 'blue';
		});
		vi.mocked(getWorkspace).mockReturnValue(ws);
		document.documentElement.style.colorScheme = 'dark';
	});

	afterEach(() => document.documentElement.style.removeProperty('color-scheme'));

	it('uses the light S1 badge in both the stage heading and paper legend', async () => {
		const model = buildPrintModel({
			plan: ws.plan,
			index: ws.index,
			showSubtasks: () => false,
			today: '2027-01-10'
		});
		const section = await render(PrintStage, {
			segment: model.find((item) => item.kind === 'stage') as StageSegment,
			from: 0,
			to: 0,
			first: true
		});
		const legend = await render(PrintLegend, {
			segment: model.find((item) => item.id === 'legend-stages') as LegendSegment
		});
		for (const container of [section.container.querySelector('h3')!, legend.container]) {
			const badge = container.querySelector('.stage-badge');
			expect(badge?.textContent?.trim()).toBe('S1');
			expect(container.textContent).toContain('Prepare');
			expect(getComputedStyle(badge!).backgroundColor).toBe('rgb(36, 86, 201)');
			expect(getComputedStyle(badge!).color).toBe('rgb(255, 255, 255)');
		}
	});

	it('renders 12 px status icons for both tasks and subtasks in the printed Work plan', async () => {
		ws.commit((plan) => {
			const stageId = plan.stages[0].id;
			plan.tasks = [
				makeTask({ id: 'parent', stageId, title: 'Parent task' }),
				makeTask({ id: 'child', stageId, parentId: 'parent', title: 'Child task', status: 'done' })
			];
		});
		const model = buildPrintModel({
			plan: ws.plan,
			index: ws.index,
			showSubtasks: () => true,
			today: '2027-01-10'
		});
		const segment = model.find((item) => item.kind === 'stage') as StageSegment;
		const section = await render(PrintStage, {
			segment,
			from: 0,
			to: segment.rows.length,
			first: true
		});
		const rows = [...section.container.querySelectorAll('[data-testid="sheet-task-row"]')];
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			const icon = row.querySelector('td:first-child svg');
			expect(icon).not.toBeNull();
			const box = icon!.getBoundingClientRect();
			expect(box.width).toBeCloseTo(12, 0);
			expect(box.height).toBeCloseTo(12, 0);
		}
	});
});
