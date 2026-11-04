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

export const stage = (page: Page, index: number) => page.getByTestId('stage').nth(index);

/** The task titles of a stage, in display order. */
export async function titles(page: Page, stageIndex: number): Promise<string[]> {
	return stage(page, stageIndex).getByTestId('task-title').allInnerTexts();
}
