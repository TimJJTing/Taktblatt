import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	choosePrint,
	openExample,
	row,
	stage,
	waitForAnimations,
	ganttRow,
	openLinePlan,
	openPreview
} from './helpers.ts';

const tooltips = (page: Page) => page.locator('[data-slot="tooltip-content"]');
const gantt = (page: Page) => page.getByTestId('gantt');

/** Moves the pointer to an empty corner and removes focus, then waits until no tooltip is open. */
async function closeHints(page: Page): Promise<void> {
	const { width, height } = page.viewportSize()!;
	await page.mouse.move(width - 2, height - 2);
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await expect(tooltips(page)).toHaveCount(0);
}

/** Waits until the tooltip with the text is visible and its opening animation is complete. */
async function expectTooltip(page: Page, text: string | RegExp): Promise<Locator> {
	const tooltip = tooltips(page).filter({ hasText: text });
	await expect(tooltip).toHaveCount(1);
	await expect(tooltip).toBeVisible();
	await waitForAnimations(tooltip);
	await expect(tooltip).toHaveText(text);
	return tooltip;
}

/** Checks the hint on hover and, for focusable targets, on keyboard focus. */
async function expectHint(
	page: Page,
	target: Locator,
	text: string | RegExp,
	{ focus = true }: { focus?: boolean } = {}
): Promise<void> {
	await closeHints(page);
	await target.hover();
	await expectTooltip(page, text);
	if (!focus) return;
	await closeHints(page);
	await target.focus();
	await expect(target).toBeFocused();
	await expectTooltip(page, text);
}

test.describe('hints show in a tooltip', () => {
	test('Timeline pin, shorter and taller buttons', async ({ page }) => {
		await openExample(page);
		const pin = page.getByTestId('gantt-pin');
		await expectHint(page, pin, 'Pin timeline');
		await expect(pin).toHaveAccessibleName('Pin timeline');
		await expect(pin).not.toHaveAttribute('title');

		await closeHints(page);
		await pin.click();
		await expect(pin).toHaveAttribute('aria-pressed', 'true');
		const shorter = page.getByRole('button', { name: 'Make timeline shorter', exact: true });
		const taller = page.getByRole('button', { name: 'Make timeline taller', exact: true });
		await expectHint(page, shorter, 'Make timeline shorter');
		await expectHint(page, taller, 'Make timeline taller');
		await expect(shorter).not.toHaveAttribute('title');
		await expect(taller).not.toHaveAttribute('title');
	});

	test('a Gantt bar keeps its linked highlight', async ({ page }) => {
		await openExample(page);
		const bar = ganttRow(page, 'Watering rota').getByTestId('gantt-bar');
		await expect(bar).toHaveAccessibleName(/^Watering rota: /);
		await expectHint(page, bar, /^Watering rota: /, { focus: false });
		await expect(row(page, 'Watering rota')).toHaveClass(/bg-accent/);
		await expect(bar).not.toHaveAttribute('title');

		await closeHints(page);
		const harvest = ganttRow(page, 'First harvest').getByTestId('gantt-bar');
		await harvest.focus();
		await expectTooltip(page, /^First harvest: /);
		await expect(row(page, 'First harvest')).toHaveClass(/bg-accent/);
	});

	test('a Gantt milestone', async ({ page }) => {
		await openExample(page);
		const milestone = gantt(page).getByTestId('gantt-milestone').first();
		await expect(milestone).toHaveAccessibleName(/^Milestone .+: Beds ready \(/);
		await expectHint(page, milestone, /Beds ready/);
		await expect(milestone).not.toHaveAttribute('title');
	});

	test('a Gantt label keeps its accessible description', async ({ page }) => {
		await openExample(page);
		const label = ganttRow(page, 'Sowing').getByTestId('gantt-label');
		await expect(label).toHaveAccessibleName('Sowing');
		await expect(label).toHaveAccessibleDescription('Sowing: Show in the work plan');
		await expectHint(page, label, 'Sowing: Show in the work plan');
		await expect(label).not.toHaveAttribute('title');
	});

	test('the "+" add line', async ({ page }) => {
		await openExample(page);
		const add = stage(page, 0).getByTestId('add-task');
		await expect(add).toHaveAccessibleName('Add task to Prepare');
		await expectHint(page, add, 'Add task to Prepare');
		await expect(add).not.toHaveAttribute('title');
	});

	test('the ready light in the work plan', async ({ page }) => {
		await openExample(page);
		const dot = row(page, 'Order seeds').getByTestId('ready-dot');
		await expect(dot).toHaveAccessibleName('Ready. Dependencies done: 1');
		await expectHint(page, dot, 'Ready. Dependencies done: 1', { focus: false });
		await expect(dot).not.toHaveAttribute('title');
	});

	test('the planned window of a parent task', async ({ page }) => {
		await openExample(page);
		const target = row(page, 'Soil preparation').getByTestId('task-target');
		await expectHint(page, target, /\S+ – \S+/, { focus: false });
		await expect(target).not.toHaveAttribute('title');
	});

	test('a stage color swatch names its in-use state', async ({ page }) => {
		await openExample(page);
		await stage(page, 0).getByTestId('stage-color').click();
		const group = page.getByRole('radiogroup');
		await expect(group).toBeVisible();
		await waitForAnimations(page.locator('[data-slot="popover-content"]'));
		// "Grow" uses amber. No stage uses violet.
		const amber = group.getByRole('radio', { name: /^amber/ });
		await expect(amber).toHaveAccessibleName(/^amber\b.*Another stage uses this color\./);
		await expect(group.getByRole('radio', { name: /^violet/ })).toHaveAccessibleName('violet');

		// The popover moves focus to the checked swatch, and its tooltip can take the first hover.
		// Leave and enter the swatch again until its own tooltip opens.
		const { width, height } = page.viewportSize()!;
		const hint = tooltips(page).filter({ hasText: /^amber\b.*Another stage uses this color\./ });
		await expect(async () => {
			await page.mouse.move(width - 2, height - 2);
			await amber.hover();
			await expect(hint).toHaveCount(1, { timeout: 1000 });
		}).toPass();
		await expectTooltip(page, /^amber\b.*Another stage uses this color\./);
		await expect(amber).not.toHaveAttribute('title');
	});

	test('the derived status select of a parent in the work plan', async ({ page }) => {
		await openExample(page);
		const wrapper = row(page, 'Soil preparation')
			.locator('[data-slot="tooltip-trigger"]')
			.filter({ has: page.getByTestId('task-status') });
		await expectHint(page, wrapper, 'The subtasks set the status.');
	});

	test('the derived status select in the task dialog', async ({ page }) => {
		await openExample(page);
		await row(page, 'Soil preparation').getByTestId('task-details').click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await waitForAnimations(dialog);
		const checkbox = dialog.getByTestId('task-status');
		await expect(checkbox).toBeDisabled();
		const { width, height } = page.viewportSize()!;
		await page.mouse.move(width - 2, height - 2);
		await checkbox.hover();
		await expectTooltip(page, 'The subtasks set the status.');
		await expect(dialog.locator('[title]')).toHaveCount(0);
	});

	test('the derived status hint adds no tab stop when the dialog opens by keyboard', async ({
		page
	}) => {
		await openExample(page);
		const details = row(page, 'Soil preparation').getByTestId('task-details');
		await details.focus();
		await page.keyboard.press('Enter');
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await waitForAnimations(dialog);
		const wrapper = dialog.locator('[data-slot="tooltip-trigger"]').filter({
			has: page.getByTestId('task-status')
		});
		await expect(wrapper).toHaveCount(1);
		await expect(wrapper).not.toHaveAttribute('tabindex');
		await expect(wrapper).not.toBeFocused();
		await expect(tooltips(page)).toHaveCount(0);
	});

	test('the app has no native title hints', async ({ page }) => {
		await openExample(page);
		await expect(page.locator('body [title]')).toHaveCount(0);
	});

	test('print sheets show no hints', async ({ page }) => {
		await openExample(page);
		await choosePrint(page);
		await expect(page.getByRole('dialog', { name: 'Print preview' })).toBeVisible();
		const sheets = page.getByTestId('sheet');
		await expect(sheets.first()).toBeVisible();
		await expect(sheets.getByTestId('sheet-gantt-bar').first()).toBeVisible();
		await expect(sheets.locator('[title]')).toHaveCount(0);
		await expect(sheets.locator('[data-slot="tooltip-trigger"]')).toHaveCount(0);
		await expect(sheets.locator('[data-slot="tooltip-content"]')).toHaveCount(0);
	});
});

test('point stations retain hover and keyboard hints while paper signs have none', async ({
	page
}) => {
	await openLinePlan(page);
	const point = ganttRow(page, 'Point').getByTestId('gantt-point');
	await expect(point.locator('.station-dot')).toBeVisible();
	await expectHint(page, point, /^Point:/);
	// The hint text equals the accessible name, with no trailing whitespace.
	const name = await point.getAttribute('aria-label');
	await expect.poll(async () => (await tooltips(page).first().textContent()) === name).toBe(true);
	await expect(row(page, 'Point')).toHaveClass(/bg-accent/);
	await closeHints(page);
	await openPreview(page);
	const paper = page.getByTestId('sheets').getByTestId('sheet-gantt-point');
	await expect(paper).toHaveAccessibleName(/^Point:/);
	await expect(paper.locator('.station-dot')).toBeVisible();
	await expect(paper.locator('[data-slot="tooltip-trigger"], [title]')).toHaveCount(0);
	await expect(paper).not.toHaveAttribute('tabindex');
});
