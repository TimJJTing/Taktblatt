import { expect, test, type Page } from '@playwright/test';
import {
	dependencyArrowFades,
	dependencyContrast,
	defaultPanelHeight,
	expectPanelHeight,
	expectStickyBelowHeader,
	openExample,
	row,
	storedPlan
} from './helpers.ts';

const gantt = (page: Page) => page.getByTestId('gantt');

/** The Gantt row of a task, found by its label text. */
const ganttRow = (page: Page, title: string) =>
	gantt(page)
		.getByTestId('gantt-row')
		.filter({ has: page.getByTestId('gantt-label').and(page.getByText(title, { exact: true })) });

test('the Gantt shows bars, lines and the today line of the example plan', async ({ page }) => {
	await openExample(page);
	await expect(gantt(page).getByTestId('gantt-row')).toHaveCount(7);
	await expect(gantt(page).getByTestId('gantt-bar')).toHaveCount(7);
	await expect(gantt(page).getByTestId('gantt-today')).toBeVisible();
	await expect(gantt(page).getByTestId('gantt-dependency')).toHaveCount(4);
	await expect(gantt(page).getByTestId('gantt-milestone')).toHaveCount(2);
	await expect(gantt(page).getByTestId('gantt-band')).toHaveCount(1);
	const survey = ganttRow(page, 'Site survey').getByTestId('gantt-bar');
	await expect(survey).toHaveAccessibleName(/^Site survey: .+ and done$/);
	await expect(ganttRow(page, 'Site survey').getByTestId('gantt-label')).toHaveClass(
		/line-through/
	);
});

test('outgoing dependency lines become fainter when their source is done', async ({ page }) => {
	await openExample(page);
	await page.reload();
	await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
	const plan = await storedPlan(page);
	const sowing = plan.tasks.find((task) => task.title === 'Sowing')!;
	const harvest = plan.tasks.find((task) => task.title === 'First harvest')!;
	const line = gantt(page).locator(
		`[data-testid="gantt-dependency"][data-from="${sowing.id}"][data-to="${harvest.id}"]`
	);
	await expect(line).toHaveCount(1);
	const normal = await dependencyContrast(line);
	await row(page, 'First harvest').getByTestId('task-done').click();
	await expect.poll(() => dependencyContrast(line)).toBe(normal);
	await row(page, 'Sowing').getByTestId('task-done').click();
	await expect.poll(() => dependencyContrast(line)).toBeLessThan(normal);
	await expect.poll(() => dependencyArrowFades(line)).toBe(true);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.poll(() => dependencyContrast(line)).toBe(normal);
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect.poll(() => dependencyContrast(line)).toBeLessThan(normal);
});

test('expand and collapse are shared between the Gantt and the table', async ({ page }) => {
	await openExample(page);
	const ganttToggle = ganttRow(page, 'Soil preparation').getByTestId('gantt-toggle');
	await expect(ganttToggle).toHaveAttribute('aria-expanded', 'false');
	await ganttToggle.click();
	await expect(ganttToggle).toHaveAttribute('aria-expanded', 'true');
	await expect(row(page, 'Soil test')).toBeVisible();
	await expect(gantt(page).getByTestId('gantt-row')).toHaveCount(9);
	await expect(gantt(page).getByTestId('gantt-dependency')).toHaveCount(5);

	const tableToggle = row(page, 'Soil preparation').getByTestId('task-toggle');
	await expect(tableToggle).toHaveAttribute('aria-expanded', 'true');
	await tableToggle.click();
	await expect(ganttToggle).toHaveAttribute('aria-expanded', 'false');
	await expect(gantt(page).getByTestId('gantt-row')).toHaveCount(7);
	await expect(ganttRow(page, 'Soil test')).toHaveCount(0);
	await expect(gantt(page).getByTestId('gantt-dependency')).toHaveCount(4);
});

const HIGHLIGHTED =
	'[data-testid="task-row"][class~="bg-accent/60"], [data-testid="gantt"] [data-highlighted]';

/**
 * Records the highlighted rows in the first frame after the next click.
 * The page can scroll after a collapse. A row that then moves under the resting pointer gets a
 * real hover highlight. The first frame comes before this hover, so it shows the click result.
 */
const recordHighlightAfterClick = (page: Page) =>
	page.evaluate((selector) => {
		const target = window as unknown as { afterClick?: (string | null)[] };
		delete target.afterClick;
		addEventListener(
			'click',
			() =>
				requestAnimationFrame(() => {
					target.afterClick = [...document.querySelectorAll(selector)].map((element) =>
						element.getAttribute('data-task-id')
					);
				}),
			{ once: true }
		);
	}, HIGHLIGHTED);

const highlightAfterClick = (page: Page) =>
	page.evaluate(() => (window as unknown as { afterClick?: (string | null)[] }).afterClick);

/** Returns the ids of highlighted rows that the pointer is not over. */
const highlightsNotFromHover = (page: Page, pointer: { x: number; y: number }) =>
	page.evaluate(
		({ x, y, selector }) => {
			const hovered = document.elementFromPoint(x, y)?.closest('[data-task-id]');
			const under = hovered?.getAttribute('data-task-id') ?? null;
			return [...document.querySelectorAll(selector)]
				.map((element) => element.getAttribute('data-task-id'))
				.filter((id) => id !== under);
		},
		{ ...pointer, selector: HIGHLIGHTED }
	);

for (const surface of ['table', 'Gantt'] as const) {
	for (const action of ['expand', 'collapse'] as const) {
		test(`a pointer click on the ${surface} chevron to ${action} clears focus and highlight`, async ({
			page
		}) => {
			await openExample(page);
			const parent = row(page, 'Soil preparation');
			const tableToggle = parent.getByTestId('task-toggle');
			const ganttToggle = ganttRow(page, 'Soil preparation').getByTestId('gantt-toggle');
			const expanding = action === 'expand';
			if (!expanding) await tableToggle.click();

			const edited = expanding ? parent : row(page, 'Soil test');
			const taskId = await edited.getAttribute('data-task-id');
			await edited.getByTestId('task-deliverable').click();
			const input = edited.getByTestId('task-deliverable-input');
			const draft = `Saved on ${surface} ${action}`;
			await input.fill(draft);
			await expect(input).toBeFocused();
			await expect(page.locator('table:focus-within')).toHaveCount(1);

			const toggle = surface === 'table' ? tableToggle : ganttToggle;
			await toggle.scrollIntoViewIfNeeded();
			const box = (await toggle.boundingBox())!;
			const pointer = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
			await recordHighlightAfterClick(page);
			await page.mouse.click(pointer.x, pointer.y);
			await expect(tableToggle).toHaveAttribute('aria-expanded', String(expanding));
			await expect(ganttToggle).toHaveAttribute('aria-expanded', String(expanding));
			await expect(row(page, 'Soil test')).toHaveCount(expanding ? 1 : 0);
			await expect(ganttRow(page, 'Soil test')).toHaveCount(expanding ? 1 : 0);
			await expect
				.poll(
					async () => (await storedPlan(page)).tasks.find((task) => task.id === taskId)?.deliverable
				)
				.toBe(draft);
			await expect.soft(toggle).not.toBeFocused();
			await expect.soft(page.locator('table:focus-within')).toHaveCount(0);
			await expect.poll(() => highlightAfterClick(page)).toEqual([]);
			// Later, only a hover highlight of the row under the pointer can stay.
			await expect
				.soft(() => expect(highlightsNotFromHover(page, pointer)).resolves.toEqual([]))
				.toPass();

			await row(page, 'Site survey').hover();
			await expect(ganttRow(page, 'Site survey')).toHaveAttribute('data-highlighted', 'true');
		});
	}

	test(`keyboard activation of the ${surface} chevron retains focus`, async ({ page }) => {
		await openExample(page);
		const tableToggle = row(page, 'Soil preparation').getByTestId('task-toggle');
		const ganttToggle = ganttRow(page, 'Soil preparation').getByTestId('gantt-toggle');
		const toggle = surface === 'table' ? tableToggle : ganttToggle;
		await toggle.focus();
		for (const key of ['Enter', 'Space']) {
			for (const expanded of [true, false]) {
				await toggle.press(key);
				await expect(toggle).toBeFocused();
				await expect(tableToggle).toHaveAttribute('aria-expanded', String(expanded));
				await expect(ganttToggle).toHaveAttribute('aria-expanded', String(expanded));
			}
		}
	});
}

test('a label click scrolls to the table row and flashes it', async ({ page }) => {
	await openExample(page);
	const target = row(page, 'Neighbourhood stall');
	await expect(target).not.toBeInViewport();
	await ganttRow(page, 'Neighbourhood stall').getByTestId('gantt-label').click();
	await expect(target).toBeInViewport();
	await expect(target).toHaveClass(/row-flash/);
	await expect(target).not.toHaveClass(/row-flash/, { timeout: 3000 });
});

test('the linked highlight works in both directions', async ({ page }) => {
	await openExample(page);
	const sowing = row(page, 'Sowing');
	await sowing.hover();
	await expect(ganttRow(page, 'Sowing')).toHaveAttribute('data-highlighted', 'true');

	const bar = ganttRow(page, 'Watering rota').getByTestId('gantt-bar');
	await bar.hover();
	await expect(row(page, 'Watering rota')).toHaveClass(/bg-accent/);
	await expect(ganttRow(page, 'Sowing')).not.toHaveAttribute('data-highlighted');

	await ganttRow(page, 'First harvest').getByTestId('gantt-bar').focus();
	await expect(row(page, 'First harvest')).toHaveClass(/bg-accent/);
});

test('the pinned Timeline section resizes with the keyboard within its limits', async ({
	page
}) => {
	await openExample(page);
	const pin = page.getByTestId('gantt-pin');
	await expect(pin).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByTestId('gantt-resize')).toHaveCount(0);
	await pin.click();
	await expect(pin).toHaveAttribute('aria-pressed', 'true');
	const handle = page.getByRole('separator', { name: 'Timeline height' });
	await expect(handle).toHaveAttribute('aria-valuenow', '35');
	const viewport = page.viewportSize()!.height;
	const panel = page.getByTestId('timeline-panel');
	await expectPanelHeight(page, defaultPanelHeight(page));

	await handle.focus();
	await handle.press('ArrowDown');
	await expect(handle).toHaveAttribute('aria-valuenow', '37');
	await expectPanelHeight(page, viewport * 0.37);
	await handle.press('PageUp');
	await expectPanelHeight(page, viewport * 0.27);
	await handle.press('PageDown');
	await expectPanelHeight(page, viewport * 0.37);
	// Clamp PageDown from 47 percent, then PageUp near the minimum.
	await handle.press('PageDown');
	await expectPanelHeight(page, viewport * 0.47);
	await handle.press('PageDown');
	await expectPanelHeight(page, viewport * 0.5);

	await handle.press('End');
	await expect(handle).toHaveAttribute('aria-valuenow', '50');
	await handle.press('ArrowDown');
	await expect(handle).toHaveAttribute('aria-valuenow', '50');
	await expectPanelHeight(page, viewport * 0.5);

	await handle.press('Home');
	await expect(handle).toHaveAttribute('aria-valuenow', String(Math.round((120 / viewport) * 100)));
	await handle.press('ArrowUp');
	await expectPanelHeight(page, 120);

	await handle.press('ArrowDown');
	await expectPanelHeight(page, 120 + viewport * 0.02);
	await handle.press('PageUp');
	await expectPanelHeight(page, 120);
	await handle.press('PageUp');
	await expectPanelHeight(page, 120);
	await expectStickyBelowHeader(panel);
	await page.reload();
	await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByTestId('gantt-resize')).toHaveAttribute(
		'aria-valuenow',
		String(Math.round((120 / viewport) * 100))
	);
	await expectPanelHeight(page, 120);
});

test('a band click opens the band dialog', async ({ page }) => {
	await openExample(page);
	await gantt(page)
		.getByTestId('gantt-band')
		.click({ position: { x: 4, y: 4 } });
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Frost risk');
});

test('a milestone click opens the milestone dialog', async ({ page }) => {
	await openExample(page);
	await gantt(page)
		.getByRole('button', { name: /^Milestone M2: Open day/ })
		.click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Open day');
});
