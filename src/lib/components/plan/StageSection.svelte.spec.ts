import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import StageSectionTest from './StageSection.test.svelte';

describe('stage heading signs (3b)', () => {
	let ws: Workspace;
	beforeEach(() => {
		ws = new Workspace(new MemoryStorage());
		ws.commit((plan) => {
			plan.stages[0].title = 'Prepare';
			plan.stages[0].color = 'blue';
		});
	});

	it('shows S1 with the editable stage title and keeps the color picker', async () => {
		const screen = await render(StageSectionTest, { workspace: ws });
		const heading = screen.container.querySelector('h3')!;
		const badge = heading.querySelector('.stage-badge');
		expect(badge?.textContent?.trim()).toBe('S1');
		expect(badge?.closest('[aria-hidden="true"]')).not.toBeNull();
		await expect.element(screen.getByRole('heading', { level: 3 })).toHaveAccessibleName(/Prepare/);
		await expect.element(screen.getByRole('heading', { level: 3 })).not.toHaveAccessibleName(/S1/);
		await expect.element(screen.getByRole('region')).not.toHaveAccessibleName(/S1/);
		await expect.element(screen.getByTestId('stage-title')).toHaveTextContent('Prepare');
		await screen.getByTestId('stage-color').click();
		await expect.element(screen.getByRole('radiogroup')).toBeVisible();
		await screen.getByRole('radio', { name: 'violet', exact: true }).click();
		expect(ws.plan.stages[0].color).toBe('violet');
		await expect
			.poll(() => document.activeElement)
			.toBe(screen.getByTestId('stage-color').element());
	});
});
