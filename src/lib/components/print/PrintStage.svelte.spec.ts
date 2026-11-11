import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { buildPrintModel, type StageSegment, type LegendSegment } from '#lib/domain/print-model.ts';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { Workspace, getWorkspace } from '#lib/state/workspace.svelte.ts';
import PrintStage from './PrintStage.svelte';
import PrintLegend from './PrintLegend.svelte';

vi.mock('#lib/state/workspace.svelte.ts', async (original) => ({
	...(await original<typeof import('#lib/state/workspace.svelte.ts')>()),
	getWorkspace: vi.fn()
}));

describe('paper stage signs (3b)', () => {
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
			isExpanded: () => false,
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
});
