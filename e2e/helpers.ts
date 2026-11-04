import { expect, type Page } from '@playwright/test';

/** Opens the app and waits until the SPA has mounted. */
export async function openApp(page: Page): Promise<void> {
	await page.goto('/');
	await expect(page.getByTestId('plan-heading')).toBeVisible();
}

/** Opens the app with the example plan. */
export async function openExample(page: Page): Promise<void> {
	await openApp(page);
	await page.getByRole('button', { name: 'Load example' }).click();
	await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
}

/** Reads the active plan from localStorage. */
export async function storedPlan(page: Page) {
	return page.evaluate(() => {
		const index = JSON.parse(localStorage.getItem('taktblatt:index')!);
		return JSON.parse(localStorage.getItem(`taktblatt:plan:${index.activeId}`)!).plan;
	});
}

export const stage = (page: Page, index: number) => page.getByTestId('stage').nth(index);

/** Finds a row by the exact text of its title cell. */
export const row = (page: Page, title: string) =>
	page.getByTestId('task-row').filter({
		has: page.getByTestId('task-title').and(page.getByText(title, { exact: true }))
	});

/** The task titles of a stage, in display order. */
export const titles = (page: Page, stageIndex: number) =>
	stage(page, stageIndex).getByTestId('task-title');

/** Opens a select by its test id and picks the option with the exact name. */
export async function chooseOption(page: Page, testId: string, name: string): Promise<void> {
	await page.getByTestId(testId).click();
	await page.getByRole('option', { name, exact: true }).click();
}

/** The same format as formatDate in src/lib/domain/format.ts for English. */
export const formatted = (date: string) =>
	new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${date}T00:00:00Z`));
