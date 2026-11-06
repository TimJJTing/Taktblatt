import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openApp, openExample, openSettings, planIds, row, storedPlan } from './helpers.ts';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const isoDate = /\d{4}-\d{2}-\d{2}/;

async function readDownload(page: Page, menuItem: string) {
	await page.getByTestId('export-menu').click();
	const pending = page.waitForEvent('download');
	await page.getByRole('menuitem', { name: menuItem }).click();
	const download = await pending;
	const text = await readFile((await download.path())!, 'utf8');
	return { name: download.suggestedFilename(), file: JSON.parse(text) as Json };
}

async function importJson(page: Page, content: unknown | string, name = 'plan.json') {
	await page.getByTestId('import-input').setInputFiles({
		name,
		mimeType: 'application/json',
		buffer: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content))
	});
}

async function exportedExample(page: Page) {
	await openExample(page);
	return (await readDownload(page, 'Export this plan')).file;
}

test.describe('icons', () => {
	test('import points into the tray and export points out of it', async ({ page }) => {
		await openApp(page);
		await expect(page.getByTestId('import-open').locator('svg')).toHaveClass(/lucide-download/);
		await expect(page.getByTestId('export-menu').locator('svg')).toHaveClass(/lucide-upload/);
	});
});

test.describe('export', () => {
	test('"Export this plan" writes a plan file without viewer state', async ({ page }) => {
		await openExample(page);
		const { name, file } = await readDownload(page, 'Export this plan');
		expect(name).toMatch(
			new RegExp(`^taktblatt-community-garden-spring-season-${isoDate.source}\\.json$`)
		);
		expect(Object.keys(file).sort()).toEqual(['kind', 'plan', 'schemaVersion']);
		expect(file.kind).toBe('plan');
		const text = JSON.stringify(file);
		// The file is language-neutral: dates are ISO and there is no language setting.
		for (const key of ['ganttPinned', 'ganttHeight', 'expanded', 'locale'])
			expect(text).not.toContain(key);
		expect(file.plan.id).toBe((await storedPlan(page)).id);
	});

	test('"Export all plans" writes a backup file with every plan', async ({ page }) => {
		await openExample(page);
		await page.getByTestId('plan-switcher').click();
		await page.getByRole('menuitem', { name: 'New plan' }).click();
		await expect(page.getByTestId('plan-heading')).toHaveText('Untitled plan');
		const { name, file } = await readDownload(page, 'Export all plans');
		expect(name).toMatch(new RegExp(`^taktblatt-backup-${isoDate.source}\\.json$`));
		expect(file.kind).toBe('backup');
		expect(file.plans).toHaveLength(2);
		expect(file.plans.map((p: Json) => p.id).sort()).toEqual((await planIds(page)).sort());
	});
});

test.describe('import', () => {
	test('importing a plan in another language leaves the UI language alone', async ({ page }) => {
		const file = await exportedExample(page);
		await openSettings(page);
		await page.getByRole('menuitemradio', { name: 'Deutsch' }).click();
		// The plan has history, so the app asks before it reloads.
		await page.getByTestId('language-reload-confirm').click();
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');
		// The file comes from a user with another language (Japanese).
		file.plan.id = 'japanese-plan';
		file.plan.heading = 'Japanese plan';
		file.plan.locale = 'ja';
		await importJson(page, file);
		await expect(page.getByTestId('plan-heading')).toHaveText('Japanese plan');
		// The old language key of the file is dropped.
		expect((await storedPlan(page)).locale).toBeUndefined();
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');
		await expect(page.getByTestId('settings-menu')).toHaveAccessibleName('Einstellungen');
		expect(await page.evaluate(() => localStorage.getItem('taktblatt:locale'))).toBe('de');
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');
		expect(await page.evaluate(() => localStorage.getItem('taktblatt:locale'))).toBe('de');
	});

	test('a valid file with a new id becomes a new active plan', async ({ page }) => {
		const file = await exportedExample(page);
		file.plan.id = 'imported-plan';
		file.plan.heading = 'Imported plan';
		await importJson(page, file);
		await expect(page.getByTestId('plan-heading')).toHaveText('Imported plan');
		await expect(page.getByText('Plan imported', { exact: true })).toBeVisible();
		expect(await planIds(page)).toHaveLength(2);
		expect((await storedPlan(page)).id).toBe('imported-plan');
	});

	test('"Replace" overwrites the plan with the same id', async ({ page }) => {
		const file = await exportedExample(page);
		const id = file.plan.id;
		file.plan.heading = 'Replaced heading';
		await importJson(page, file);
		await expect(page.getByTestId('import-conflicts')).toBeVisible();
		await page.getByRole('radio', { name: 'Replace' }).check();
		await page.getByTestId('import-ok').click();
		await expect(page.getByTestId('plan-heading')).toHaveText('Replaced heading');
		expect(await planIds(page)).toEqual([id]);
	});

	test('"Keep both" adds a copy with a new id and a copy suffix', async ({ page }) => {
		const file = await exportedExample(page);
		const id = file.plan.id;
		await importJson(page, file);
		await expect(page.getByTestId('import-conflicts')).toBeVisible();
		// Keep both is the default choice.
		await expect(page.getByRole('radio', { name: 'Keep both' })).toBeChecked();
		await page.getByTestId('import-ok').click();
		await expect(page.getByTestId('plan-heading')).toHaveText(`${file.plan.heading} (copy)`);
		const ids = await planIds(page);
		expect(ids).toHaveLength(2);
		expect(ids).toContain(id);
		expect((await storedPlan(page)).id).not.toBe(id);
	});

	test('cancel in the conflict dialog changes nothing', async ({ page }) => {
		const file = await exportedExample(page);
		await importJson(page, file);
		await page.getByTestId('import-conflicts').getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByTestId('import-conflicts')).toBeHidden();
		expect(await planIds(page)).toHaveLength(1);
	});

	test('a backup file asks about each plan that exists', async ({ page }) => {
		await openExample(page);
		const { file } = await readDownload(page, 'Export all plans');
		file.plans.push({ ...structuredClone(file.plans[0]), id: 'other', heading: 'Other plan' });
		await importJson(page, file, 'backup.json');
		const dialog = page.getByTestId('import-conflicts');
		await expect(dialog.getByRole('group')).toHaveCount(1);
		await page.getByRole('radio', { name: 'Replace' }).check();
		await page.getByTestId('import-ok').click();
		await expect(page.getByTestId('plan-heading')).toHaveText('Other plan');
		await expect(page.getByText('2 plans imported')).toBeVisible();
		expect(await planIds(page)).toHaveLength(2);
	});

	test('an invalid file shows the errors and changes nothing', async ({ page }) => {
		await openExample(page);
		const before = await planIds(page);
		await importJson(page, 'this is not json');
		const dialog = page.getByTestId('import-errors');
		await expect(dialog).toContainText('This file cannot be imported');
		await expect(dialog).toContainText('not valid JSON');
		await dialog.getByRole('button', { name: 'OK' }).click();

		const { file: good } = await readDownload(page, 'Export this plan');
		good.plan.id = 'broken';
		good.plan.range.start = 'not a date';
		await importJson(page, good);
		await expect(dialog).toContainText('plan.range.start');
		await dialog.getByRole('button', { name: 'OK' }).click();

		expect(await planIds(page)).toEqual(before);
		await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
	});

	test('a backup with a repeated plan id is rejected', async ({ page }) => {
		await openApp(page);
		const plan = (await exportedExample(page)).plan;
		const before = await planIds(page);
		await importJson(
			page,
			{ schemaVersion: 1, kind: 'backup', plans: [plan, plan] },
			'backup.json'
		);
		await expect(page.getByTestId('import-errors')).toContainText('Plan ids must be unique');
		expect(await planIds(page)).toEqual(before);
	});

	test('an empty backup is rejected', async ({ page }) => {
		await openApp(page);
		await importJson(page, { schemaVersion: 1, kind: 'backup', plans: [] }, 'backup.json');
		await expect(page.getByTestId('import-errors')).toContainText('at least one plan');
	});

	test('a date-rule conflict imports and shows a warning', async ({ page }) => {
		const file = await exportedExample(page);
		file.plan.id = 'conflict';
		// "Order seeds" depends on "Site survey". The survey now ends after the seeds end.
		const survey = file.plan.tasks.find((t: Json) => t.title === 'Site survey');
		survey.start = '2099-01-01';
		survey.end = '2099-01-02';
		await importJson(page, file);
		await expect(page.getByText('Plan imported', { exact: true })).toBeVisible();
		await expect(page.getByText(/Dependencies that break the date rule: 1/)).toBeVisible();
		await row(page, 'Order seeds').getByTestId('task-details').click();
		await expect(page.getByLabel(/starts after this task ends/)).toBeVisible();
	});
});

test('the header keeps Import and Export visible at 768 px', async ({ page }) => {
	await page.setViewportSize({ width: 768, height: 800 });
	await openApp(page);
	await expect(page.getByTestId('import-open')).toBeInViewport();
	await expect(page.getByTestId('export-menu')).toBeInViewport();
	await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeInViewport();
});
