import { expect, test, type Page } from '@playwright/test';
import {
	dependencyArrowMatches,
	dependencyContrast,
	openExample,
	row,
	storedPlan
} from './helpers';

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
	await expect(survey).toHaveAccessibleName(/^Site survey: .+, done$/);
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
	const line = gantt(page).locator(`[data-testid="gantt-dependency"][data-from="${sowing.id}"]`);
	const normal = await dependencyContrast(line);
	await row(page, 'First harvest').getByTestId('task-done').click();
	await expect.poll(() => dependencyContrast(line)).toBe(normal);
	await row(page, 'Sowing').getByTestId('task-done').click();
	await expect.poll(() => dependencyContrast(line)).toBeLessThan(normal);
	await expect.poll(() => dependencyArrowMatches(line)).toBe(true);
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
			await toggle.click();
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
			await expect.soft(gantt(page).locator('[data-highlighted]')).toHaveCount(0);
			await expect
				.soft(page.getByTestId('task-row').and(page.locator('[class~="bg-accent/60"]')))
				.toHaveCount(0);

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

test('the pinned Gantt resizes with the keyboard within its limits', async ({ page }) => {
	await openExample(page);
	const pin = page.getByTestId('gantt-pin');
	await expect(pin).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByTestId('gantt-resize')).toHaveCount(0);
	await pin.click();
	await expect(pin).toHaveAttribute('aria-pressed', 'true');
	const handle = page.getByRole('separator', { name: 'Timeline height' });
	await expect(handle).toHaveAttribute('aria-valuenow', '35');
	const viewport = page.viewportSize()!.height;
	const height = async () => (await gantt(page).boundingBox())!.height;
	const before = await height();
	expect(before).toBeCloseTo(viewport * 0.35, 0);

	await handle.focus();
	await handle.press('ArrowDown');
	await expect(handle).toHaveAttribute('aria-valuenow', '37');
	expect(await height()).toBeGreaterThan(before);

	await handle.press('End');
	await expect(handle).toHaveAttribute('aria-valuenow', '50');
	await handle.press('ArrowDown');
	await expect(handle).toHaveAttribute('aria-valuenow', '50');
	expect(await height()).toBeLessThanOrEqual(viewport * 0.5 + 1);

	await handle.press('Home');
	await expect(handle).toHaveAttribute('aria-valuenow', String(Math.round((120 / viewport) * 100)));
	await handle.press('ArrowUp');
	expect(await height()).toBeGreaterThanOrEqual(119);
	expect(await height()).toBeLessThanOrEqual(121);

	// The pinned chart stays below the app header when the page scrolls.
	await row(page, 'First harvest').scrollIntoViewIfNeeded();
	const header = (await page.locator('[data-app-header]').boundingBox())!;
	await expect
		.poll(async () => (await gantt(page).boundingBox())!.y)
		.toBeCloseTo(header.y + header.height, 0);
	await page.reload();
	await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'true');
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
