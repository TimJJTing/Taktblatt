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

	test('the remark handle and its hit area remain inside the pane at 320px', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 844 });
		await openExample(page);
		await selectTab(page, 'Overview');
		const handle = page.getByRole('button', { name: 'Drag to reorder the section' }).first();
		await handle.scrollIntoViewIfNeeded();
		const bounds = await handle.evaluate((element) => {
			const rect = element.getBoundingClientRect();
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

for (const width of [390, 1440]) {
	test(`add-subtask hit area leaves adjacent field edges usable at ${width}px`, async ({
		browser
	}) => {
		const context = await browser.newContext({
			hasTouch: true,
			viewport: { width, height: width === 390 ? 844 : 900 }
		});
		const page = await context.newPage();
		try {
			await openExample(page);
			await selectTab(page, 'Work plan');
			const parent = row(page, 'Site survey');
			const group = stage(page, 0).locator('tbody', { has: parent });
			const add = group.getByTestId('add-subtask');
			await parent.hover();
			await expectTouchHitArea(add, [
				[-11, 0],
				[11, 0]
			]);
			const count = await page.getByTestId('task-row').count();
			const x = (await add.boundingBox())!;
			for (const [task, edge] of [
				[parent, 'bottom'],
				[row(page, 'Soil preparation'), 'top']
			] as const) {
				// Pin the row by id: in edit mode its title is an input value, not text.
				const id = (await task.getAttribute('data-task-id'))!;
				const pinned = page.locator(`[data-testid="task-row"][data-task-id="${id}"]`);
				await task.scrollIntoViewIfNeeded();
				const cx = x.x + x.width / 2;
				// The field under the "+" depends on the column widths: find it at the row center.
				const box = await task.evaluate((element, px) => {
					const r = element.getBoundingClientRect();
					const field = document.elementFromPoint(px, r.top + r.height / 2)!.closest('button')!;
					const b = field.getBoundingClientRect();
					return { y: b.top, height: b.height };
				}, cx);
				await page.touchscreen.tap(cx, edge === 'top' ? box.y + 4 : box.y + box.height - 4);
				await expect(pinned.locator('input:focus, textarea:focus')).toHaveCount(1);
				await expect(page.getByTestId('task-row')).toHaveCount(count);
				await page.keyboard.press('Escape');
			}
		} finally {
			await context.close();
		}
	});
}
