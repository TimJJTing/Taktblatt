import { expect, test } from '@playwright/test';
import {
	expectTouchHitArea,
	ganttRow,
	openExample,
	openRoutePlan,
	row,
	selectTab,
	stage,
	stageColorPalette,
	tapControlOffset,
	waitForAnimations,
	writeStoredPlan
} from './helpers.ts';

test.describe('touch targets', () => {
	test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

	test('small controls have reachable hit areas without overlapping stage controls', async ({
		page
	}) => {
		await openExample(page);
		await selectTab(page, 'Work plan');
		const first = stage(page, 0);
		const handle = first.getByRole('button', { name: 'Drag to reorder the stage' });
		const color = first.getByTestId('stage-color');
		const points: [number, number][] = [
			[-11, 0],
			[11, 0],
			[0, -11],
			[0, 11]
		];
		for (const control of [handle, color, first.getByTestId('task-toggle').first()]) {
			await expectTouchHitArea(control, points);
		}
		// Add lines can use spacing vertically where the adjacent row leaves too little room.
		for (const control of [
			first.getByTestId('add-subtask').first(),
			first.getByTestId('add-task')
		]) {
			await expectTouchHitArea(control, [
				[-11, 0],
				[11, 0]
			]);
		}
		for (const width of [390, 320]) {
			await page.setViewportSize({ width, height: 844 });
			await handle.scrollIntoViewIfNeeded();
			const bounds = await handle.evaluate((element) => {
				const rect = element.getBoundingClientRect();
				// The nearest ancestor that clips its content is the visible pane.
				let clip = element.parentElement!;
				while (clip.parentElement && getComputedStyle(clip).overflowX === 'visible')
					clip = clip.parentElement;
				const pane = clip.getBoundingClientRect();
				return {
					left: rect.left - 2,
					right: rect.right + 2,
					paneLeft: pane.left,
					paneRight: pane.right
				};
			});
			expect(bounds.left).toBeGreaterThanOrEqual(bounds.paneLeft);
			expect(bounds.right).toBeLessThanOrEqual(bounds.paneRight);
		}
		await page.setViewportSize({ width: 390, height: 844 });
		await handle.scrollIntoViewIfNeeded();
		const gap = await handle.evaluate((element) => {
			const a = element.getBoundingClientRect();
			const b = element
				.closest('[data-testid="stage"]')!
				.querySelector('[data-testid="stage-color"]')!
				.getBoundingClientRect();
			return b.left - 5 - (a.right + 2);
		});
		expect(gap).toBeGreaterThanOrEqual(0);
		await selectTab(page, 'Overview');
		await expectTouchHitArea(
			page.getByRole('button', { name: 'Drag to reorder the section' }).first(),
			points
		);
		await selectTab(page, 'Work plan');
		await tapControlOffset(color, 11, 0);
		await expect(stageColorPalette(page)).toBeVisible();
	});

	test('dependency remove has a reachable horizontal hit area', async ({ page }) => {
		await openExample(page);
		await selectTab(page, 'Work plan');
		await row(page, 'Sowing').getByTestId('task-details').tap();
		const dialog = page.getByTestId('task-dialog');
		await waitForAnimations(dialog);
		const removes = dialog.getByRole('button', { name: /Remove dependency/ });
		const count = await removes.count();
		const remove = removes.first();
		const name = (await remove.getAttribute('aria-label'))!;
		await expectTouchHitArea(remove, [
			[-11, 0],
			[11, 0]
		]);
		await tapControlOffset(remove, 11, 0);
		await expect(removes).toHaveCount(count - 1);
		await expect(dialog.getByRole('button', { name, exact: true })).toHaveCount(0);
	});
});

test.describe('Gantt touch targets', () => {
	test.use({ hasTouch: true, viewport: { width: 1280, height: 900 } });
	test('a short bar receives a tap above its drawn center', async ({ page }) => {
		await openRoutePlan(page);
		await writeStoredPlan(page, (plan) => {
			const task = plan.tasks.find((item) => item.id === 'parent')!;
			task.start = '2027-01-01';
			task.end = '2027-01-02';
		});
		const bar = ganttRow(page, 'Route parent').getByTestId('gantt-bar');
		await tapControlOffset(bar, 0, -10);
		await expect(ganttRow(page, 'Route parent')).toHaveAttribute('data-route', 'lit');
		await tapControlOffset(bar, 0, -10);
		await expect(page.locator('[data-testid="gantt-row"][data-route]')).toHaveCount(0);
	});
});
