import { expect, test, type Page } from '@playwright/test';
import { formatted, openExample, storedPlan } from './helpers';

/** A day button of the month that the open calendar shows. */
const day = (page: Page, n: number) =>
	page
		.locator('[data-bits-day]:not([data-outside-month])')
		.filter({ hasText: new RegExp(`^${n}$`) });

test('the milestone date is picked with the calendar', async ({ page }) => {
	await openExample(page);
	const start: string = (await storedPlan(page)).range.start;
	await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Title', { exact: true }).fill('Soil check');
	const trigger = dialog.getByTestId('milestone-date');
	await expect(trigger).toHaveText(formatted(start));
	await trigger.click();
	await expect(page.getByTestId('date-value')).toHaveValue(formatted(start));
	await day(page, 15).click();
	const picked = `${start.slice(0, 7)}-15`;
	await expect(page.getByTestId('date-value')).toHaveValue(formatted(picked));
	await page.getByRole('button', { name: 'Done', exact: true }).last().click();
	await expect(page.getByTestId('date-value')).toHaveCount(0);
	await expect(trigger).toHaveText(formatted(picked));
	await dialog.getByRole('button', { name: 'OK', exact: true }).click();
	await expect(dialog).toHaveCount(0);
	const legend = page.getByTestId('milestone-legend');
	await expect(legend.getByRole('button', { name: /Soil check/ })).toHaveText(
		new RegExp(`Soil check \\(${formatted(picked)}\\)`)
	);
	const saved = (await storedPlan(page)).milestones.find(
		(item: { title: string }) => item.title === 'Soil check'
	);
	expect(saved.date).toBe(picked);
});

test('Escape closes the milestone calendar before it cancels the dialog', async ({ page }) => {
	await openExample(page);
	const legend = page.getByTestId('milestone-legend');
	const button = legend.getByRole('button', { name: /Beds ready/ });
	const before = (await storedPlan(page)).milestones.find(
		(item: { title: string }) => item.title === 'Beds ready'
	).date as string;
	await button.click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Title', { exact: true }).fill('Beds almost ready');
	const trigger = dialog.getByTestId('milestone-date');
	await trigger.click();
	const other = before.endsWith('-15') ? 16 : 15;
	await day(page, other).click();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('date-value')).toHaveCount(0);
	await expect(dialog).toBeVisible();
	await expect(trigger).toHaveText(formatted(before));
	await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Beds almost ready');
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(button).toContainText('Beds ready');
	const saved = (await storedPlan(page)).milestones.find(
		(item: { title: string }) => item.title === 'Beds ready'
	);
	expect(saved.date).toBe(before);
});
