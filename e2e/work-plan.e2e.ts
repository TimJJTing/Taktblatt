import { expect, test } from '@playwright/test';
import { expectStickyBelowHeader, openApp, openExample, row, stage, titles } from './helpers';

test.describe('work plan', () => {
	test('a new task gets a title, and Escape removes an empty new task', async ({ page }) => {
		await openApp(page);
		const first = stage(page, 0);
		await first.hover();
		await first.getByTestId('add-task').click();
		await page.keyboard.type('Write brief');
		await page.keyboard.press('Enter');
		await expect(first.getByTestId('task-title')).toHaveText(['Write brief']);

		await first.getByTestId('add-task').click();
		await page.keyboard.press('Escape');
		await expect(first.getByTestId('task-row')).toHaveCount(1);
		// The empty row left no undo step. Undo reverts the title, then the new task.
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(first.getByTestId('task-title')).toHaveText(['New task']);
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(first.getByTestId('task-row')).toHaveCount(0);
	});

	test('Enter commits and moves to the same column in the next row', async ({ page }) => {
		await openExample(page);
		const first = stage(page, 0);
		await first.getByTestId('task-deliverable').first().click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('Site map');
		await page.keyboard.press('Enter');
		await expect(first.getByTestId('task-deliverable').first()).toHaveText('Site map');
		await expect(first.getByTestId('task-deliverable').nth(1)).toBeFocused();
	});

	test('the done checkbox updates the stage progress and the ready light', async ({ page }) => {
		await openExample(page);
		const grow = stage(page, 1);
		await expect(grow.getByTestId('stage-progress')).toContainText('0 / 2');
		// "First harvest" depends on "Sowing". Marking "Sowing" done turns on the ready light of "First harvest".
		const harvest = row(page, 'First harvest');
		await expect(harvest.getByTestId('ready-dot')).toHaveCount(0);
		await row(page, 'Sowing').getByTestId('task-done').click();
		await expect(grow.getByTestId('stage-progress')).toContainText('1 / 2');
		await expect(harvest.getByTestId('ready-dot')).toBeVisible();
	});

	test('a subtask can be added, and the parent shows derived values', async ({ page }) => {
		await openExample(page);
		const first = stage(page, 0);
		const parent = row(page, 'Soil preparation');
		await parent.getByTestId('task-toggle').click();
		await expect(parent.getByTestId('task-toggle')).toHaveAttribute('aria-expanded', 'true');
		await parent.hover();
		await first.locator('tbody', { has: parent }).getByTestId('add-subtask').click();
		await page.keyboard.type('Mulch');
		await page.keyboard.press('Enter');
		await expect(titles(page, 0)).toHaveText([
			'Site survey',
			'Soil preparation',
			'Soil test',
			'Add compost',
			'Mulch',
			'Order seeds'
		]);
		await expect(parent.getByTestId('task-owners')).toContainText('Kai');
	});

	test('a date change re-sorts the tasks', async ({ page }) => {
		await openExample(page);
		await expect(titles(page, 1)).toHaveText(['Sowing', 'Watering rota']);
		const watering = row(page, 'Watering rota');
		await watering.getByTestId('task-target').click();
		await page.getByTestId('date-start').fill('2020-01-01');
		await page.getByTestId('date-start').press('Enter');
		await page.getByRole('button', { name: 'Done', exact: true }).click();
		await expect(titles(page, 1)).toHaveText(['Watering rota', 'Sowing']);
	});

	test('owners can be added and renamed everywhere', async ({ page }) => {
		await openExample(page);
		const stall = row(page, 'Neighbourhood stall');
		await stall.getByTestId('owner-field').click();
		await page.getByTestId('owner-input').fill('Lee');
		await page.getByTestId('owner-input').press('Enter');
		await page.keyboard.press('Escape');
		await expect(stall.getByTestId('owner-field')).toContainText('Lee');

		await stall.getByTestId('owner-field').click();
		await page.getByRole('button', { name: 'Rename “Kai” everywhere' }).click();
		await page.getByRole('menuitem', { name: 'Rename everywhere…' }).click();
		await page.getByRole('dialog').getByRole('textbox').fill('Kairo');
		await page.getByRole('dialog').getByRole('button', { name: 'Rename' }).click();
		await expect(page.getByText('Kai', { exact: true })).toHaveCount(0);
		await expect(page.getByText('Kairo', { exact: true }).first()).toBeVisible();
	});

	test('stages can be added, renamed, recolored, moved and deleted', async ({ page }) => {
		await openExample(page);
		await page.getByTestId('add-stage').click();
		await expect(page.getByTestId('stage')).toHaveCount(4);
		const last = stage(page, 3);
		await last.getByTestId('stage-title').click();
		await page.keyboard.type('Review');
		await page.keyboard.press('Enter');
		await expect(last.getByTestId('stage-title')).toHaveText('Review');

		await last.getByTestId('stage-color').click();
		await page.getByRole('radio', { name: 'violet' }).click();
		await expect(last.getByTestId('stage-color')).toHaveAttribute(
			'aria-label',
			'Stage color: violet'
		);

		await last.getByTestId('stage-menu').click();
		await page.getByRole('menuitem', { name: 'Move up' }).click();
		await expect(stage(page, 2).getByTestId('stage-title')).toHaveText('Review');

		await stage(page, 0).getByTestId('stage-menu').click();
		await page.getByRole('menuitem', { name: 'Delete stage…' }).click();
		await expect(page.getByRole('alertdialog')).toContainText('Tasks deleted with the stage: 5');
		await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByTestId('stage')).toHaveCount(3);
	});

	test('the stage color picker does not scroll the page', async ({ page }) => {
		await page.setViewportSize({ width: 1000, height: 500 });
		await openExample(page);
		for (let i = 0; i < 3; i++) await page.getByTestId('add-stage').click();
		const swatch = stage(page, 5).getByTestId('stage-color');
		await swatch.scrollIntoViewIfNeeded();
		// Put the swatch near the bottom edge, so the popover opens below the fold.
		await page.evaluate(() => window.scrollBy(0, 80));
		const monitor = await page.evaluateHandle(() => {
			const baseline = window.scrollY;
			const positions = [baseline];
			const record = () => positions.push(window.scrollY);
			let frame: number;
			const sample = () => {
				record();
				frame = requestAnimationFrame(sample);
			};
			window.addEventListener('scroll', record);
			frame = requestAnimationFrame(sample);
			return {
				baseline,
				positions,
				stop() {
					window.removeEventListener('scroll', record);
					cancelAnimationFrame(frame);
				}
			};
		});
		const assertNoScroll = async () => {
			await page.evaluate(
				() =>
					new Promise<void>((resolve) => {
						requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
					})
			);
			const state = await monitor.evaluate(({ baseline, positions }) => ({
				baseline,
				positions,
				current: window.scrollY
			}));
			expect(state.positions.filter((position) => position !== state.baseline)).toEqual([]);
			expect(state.current).toBe(state.baseline);
		};
		try {
			expect(await monitor.evaluate(({ baseline }) => baseline)).toBeGreaterThan(0);
			await swatch.click();
			const palette = page.getByRole('radiogroup');
			const content = page.locator('[data-slot="popover-content"]');
			await expect(palette).toBeVisible();
			await expect(palette.getByRole('radio', { checked: true })).toBeFocused();
			await palette.evaluate(async (element) => {
				const content = element.closest('[data-slot="popover-content"]')!;
				const animations = content
					.getAnimations({ subtree: true })
					.filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime));
				await Promise.all(animations.map((animation) => animation.finished));
			});
			await assertNoScroll();
			await palette.getByRole('radio', { name: 'violet', exact: true }).click();
			await expect(swatch).toHaveAttribute('aria-label', 'Stage color: violet');
			await expect(swatch).toBeFocused();
			await expect(palette).toHaveCount(0);
			await expect(content).toHaveCount(0);
			await assertNoScroll();
		} finally {
			await monitor.evaluate((state) => state.stop());
			await monitor.dispose();
		}
	});

	test('a stage keeps its colored header band at the top while the page scrolls', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1000, height: 400 });
		await openExample(page);
		const band = stage(page, 0).locator('thead th').first();
		await expectStickyBelowHeader(band);
	});

	test('on a narrow screen the header cells stay in the table', async ({ page }) => {
		await page.setViewportSize({ width: 600, height: 400 });
		await openExample(page);
		const section = stage(page, 0);
		// Measure both in one call, so a layout change cannot fall between two measurements.
		await expect
			.poll(() =>
				section.locator('table').evaluate((table) => {
					const cell = table.querySelector('thead th')!;
					return Math.abs(cell.getBoundingClientRect().top - table.getBoundingClientRect().top);
				})
			)
			.toBeLessThanOrEqual(1);
	});

	test('on a narrow screen the colored band stays at the top while the page scrolls', async ({
		page
	}) => {
		await page.setViewportSize({ width: 600, height: 400 });
		await openExample(page);
		const band = stage(page, 0).getByTestId('stage-band');
		await expectStickyBelowHeader(band);
	});

	test('a stage moves with the keyboard drag handle', async ({ page }) => {
		await openExample(page);
		const stageTitles = page.getByTestId('stage-title');
		const [first, second] = await stageTitles.allTextContents();
		const handle = page.getByLabel('Drag to reorder the stage');
		await handle.first().focus();
		await expect(handle.first()).toBeFocused();
		await page.keyboard.press('Space');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Space');
		await expect(stageTitles.first()).toHaveText(second);
		await expect(stageTitles.nth(1)).toHaveText(first);
		await expect(handle.first()).toHaveAttribute('tabindex', '0');
	});

	test('the add-task line sits against the table, and the add buttons shrink by level', async ({
		page
	}) => {
		await openExample(page);
		const first = stage(page, 0);
		// Read one layout snapshot. Retry all checks while the rows animate.
		await expect(async () => {
			const layout = await first.evaluate((element) => {
				const table = element.querySelector('table')!.getBoundingClientRect();
				const addTask = element.querySelector('[data-testid="add-task"]')!.getBoundingClientRect();
				const addSubtask = Array.from(element.querySelectorAll('[data-testid="add-subtask"]'))
					.at(-1)!
					.getBoundingClientRect();
				const addStage = document
					.querySelector('[data-testid="add-stage"]')!
					.getBoundingClientRect();
				return {
					gap: addTask.top - table.bottom,
					clearance: addTask.top - addSubtask.bottom,
					addTaskWidth: addTask.width,
					addSubtaskWidth: addSubtask.width,
					addStageWidth: addStage.width
				};
			});
			expect(layout.gap).toBeLessThanOrEqual(12);
			// The last add-subtask line must not cover the add-task button.
			expect(layout.clearance).toBeGreaterThanOrEqual(0);
			expect(layout.addStageWidth).toBeGreaterThan(layout.addTaskWidth);
			expect(layout.addTaskWidth).toBeGreaterThan(layout.addSubtaskWidth);
		}).toPass({ timeout: 5000 });
		const addTask = (await first.getByTestId('add-task').boundingBox())!;
		await first.getByTestId('add-task').click({
			trial: true,
			position: { x: addTask.width / 2, y: 2 }
		});
	});
});
