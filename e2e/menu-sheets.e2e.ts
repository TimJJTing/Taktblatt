import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	openApp,
	openExample,
	openMenu,
	openPlans,
	chooseLanguage,
	chooseTheme,
	storedPlan,
	planIds,
	waitForAnimations,
	expectDuplicateOnceAfterReopen
} from './helpers.ts';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
	await openApp(page);
	expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
});

async function expectClosed(page: Page, sheet: Locator, trigger: string) {
	await expect(sheet).toHaveCount(0);
	await expect(page.getByTestId(trigger)).toBeFocused();
}

async function dismissWithScrim(page: Page, sheet: Locator) {
	const box = (await sheet.boundingBox())!;
	await page.touchscreen.tap(10, box.y / 2);
}

test('Plans and This plan open modal sheets with scope actions and return focus on dismissal', async ({
	page
}) => {
	const plans = await openPlans(page);
	await expect(plans).toHaveRole('dialog');
	await expect(plans).toHaveAccessibleName('Plans');
	await expect(plans.getByRole('radio', { name: 'Untitled plan', exact: true })).toBeChecked();
	for (const id of ['plans-new', 'plans-import', 'plans-backup']) {
		await expect(plans.getByTestId(id)).toBeVisible();
		expect((await plans.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(44);
	}
	await expect(plans.getByTestId('plans-backup')).toHaveText('Back up');
	await expect(plans.getByTestId('plans-backup')).toHaveAccessibleName('Back up all plans');
	const actions = await plans
		.locator(
			'[data-testid="plans-new"], [data-testid="plans-import"], [data-testid="plans-backup"]'
		)
		.evaluateAll((elements) =>
			elements.map((e) => {
				const b = e.getBoundingClientRect();
				return { y: b.y, width: b.width };
			})
		);
	expect(
		Math.max(...actions.map((b) => b.y)) - Math.min(...actions.map((b) => b.y))
	).toBeLessThanOrEqual(1);
	expect(
		Math.max(...actions.map((b) => b.width)) - Math.min(...actions.map((b) => b.width))
	).toBeLessThanOrEqual(1);
	await page.keyboard.press('Escape');
	await expectClosed(page, plans, 'plan-switcher');
	await openPlans(page);
	await dismissWithScrim(page, plans);
	await expectClosed(page, plans, 'plan-switcher');
	const menu = await openMenu(page);
	await expect(menu).toHaveRole('dialog');
	await expect(menu).toHaveAccessibleName('This plan');
	await expect(menu).toContainText('Untitled plan');
	for (const id of [
		'menu-print',
		'menu-export-plan',
		'menu-rename',
		'menu-duplicate',
		'menu-delete'
	])
		await expect(menu.getByTestId(id)).toBeVisible();
	const printBox = (await menu.getByTestId('menu-print').boundingBox())!;
	const exportBox = (await menu.getByTestId('menu-export-plan').boundingBox())!;
	expect(printBox.y).toBeCloseTo(exportBox.y, 0);
	expect(printBox.x + printBox.width).toBeLessThanOrEqual(exportBox.x);
	await expect(menu).toContainText('Preview the sheets');
	await expect(menu).toContainText('This plan as a file');
	await expect(menu.getByRole('combobox', { name: 'Language', exact: true })).toHaveJSProperty(
		'tagName',
		'SELECT'
	);
	const targets = await menu
		.locator('button, select, [role="radio"]')
		.evaluateAll((elements) =>
			elements.filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().height)
		);
	expect(targets.length).toBeGreaterThan(5);
	expect(targets.every((height) => height >= 44)).toBe(true);
	await dismissWithScrim(page, menu);
	await expectClosed(page, menu, 'app-menu');
	await openMenu(page);
	await page.keyboard.press('Escape');
	await expectClosed(page, menu, 'app-menu');
});

test('Theme applies immediately and keeps the sheet open; Language closes before confirmation', async ({
	page
}) => {
	await page.getByTestId('plan-heading').click();
	await page.getByTestId('plan-heading-input').fill('Garden');
	await page.keyboard.press('Enter');
	const origin = await page.evaluate(() => performance.timeOrigin);
	await chooseTheme(page, 'Dark');
	const sheet = page.getByTestId('menu-sheet');
	await expect(sheet).toBeVisible();
	await expect(sheet.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
	await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
	expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
	await page.keyboard.press('Escape');
	await chooseLanguage(page, 'Deutsch');
	await expect(sheet).toHaveCount(0);
	const dialog = page.getByTestId('language-reload-dialog');
	await expect(dialog).toBeVisible();
	await waitForAnimations(dialog);
	await expect.poll(() => dialog.evaluate((e) => e.contains(document.activeElement))).toBe(true);
	await page.getByTestId('language-reload-cancel').click();
	await expectClosed(page, sheet, 'app-menu');
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
});

test('sheet focus stays contained and many plans scroll below the visible title in landscape', async ({
	page
}) => {
	for (let i = 0; i < 12; i++) {
		const sheet = await openPlans(page);
		await sheet.getByTestId('plans-new').click();
		await expect(sheet).toHaveCount(0);
	}
	await page.setViewportSize({ width: 844, height: 390 });
	const sheet = await openPlans(page);
	const heading = sheet.getByRole('heading', { name: 'Plans', exact: true });
	const titleTop = (await heading.boundingBox())!.y;
	const box = (await sheet.boundingBox())!;
	expect(box.height).toBeLessThanOrEqual(390 * 0.85 + 1);
	expect(box.y + box.height).toBeLessThanOrEqual(391);
	for (let i = 0; i < 24; i++) {
		await page.keyboard.press('Tab');
		await expect.poll(() => sheet.evaluate((e) => e.contains(document.activeElement))).toBe(true);
	}
	await sheet.getByRole('radio').last().focus();
	await expect(sheet.getByRole('radio').last()).toBeInViewport();
	expect((await heading.boundingBox())!.y).toBeCloseTo(titleTop, 0);
	expect(
		await sheet.evaluate((e) => [e, ...e.querySelectorAll('*')].some((node) => node.scrollTop > 0))
	).toBe(true);
});

test('Print hands focus to Preview and returns it to Menu after dismissal', async ({ page }) => {
	const sheet = await openMenu(page);
	await sheet.getByTestId('menu-print').click();
	await expect(sheet).toHaveCount(0);
	const preview = page.getByRole('dialog', { name: 'Print preview' });
	await expect(preview).toBeVisible();
	await waitForAnimations(preview);
	await expect.poll(() => preview.evaluate((e) => e.contains(document.activeElement))).toBe(true);
	await page.keyboard.press('Escape');
	await expectClosed(page, sheet, 'app-menu');
});

test('rename keeps IME Enter and Escape in the dialog and returns focus to Menu', async ({
	page
}) => {
	const sheet = await openMenu(page);
	await sheet.getByTestId('menu-rename').click();
	await expect(sheet).toHaveCount(0);
	const dialog = page.getByTestId('plan-rename-dialog');
	const input = page.getByTestId('plan-rename-input');
	await expect(dialog).toBeVisible();
	await waitForAnimations(dialog);
	await expect(input).toBeFocused();
	await input.fill('春の計画');
	for (const key of ['Enter', 'Escape']) {
		await input.dispatchEvent('keydown', { key, isComposing: true });
		await expect(dialog).toBeVisible();
		await expect(input).toHaveValue('春の計画');
	}
	await input.press('Enter');
	await expect(dialog).toHaveCount(0);
	await expect(page.getByTestId('plan-heading')).toHaveText('春の計画');
	await expect(page.getByTestId('app-menu')).toBeFocused();
});

test('delete cancel returns focus; confirm still offers restoration through the toast', async ({
	page
}) => {
	await openExample(page);
	const before = await storedPlan(page);
	const ids = await planIds(page);
	for (const confirm of [false, true]) {
		const sheet = await openMenu(page);
		await sheet.getByTestId('menu-delete').click();
		await expect(sheet).toHaveCount(0);
		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();
		await waitForAnimations(dialog);
		await expect.poll(() => dialog.evaluate((e) => e.contains(document.activeElement))).toBe(true);
		if (!confirm) {
			await page.keyboard.press('Escape');
			await expect(page.getByTestId('app-menu')).toBeFocused();
			expect(await planIds(page)).toEqual(ids);
		} else {
			await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
			await page
				.locator('[data-sonner-toast]')
				.getByRole('button', { name: 'Undo', exact: true })
				.click();
			expect(await storedPlan(page)).toEqual(before);
		}
	}
});

test('file chooser cancellation and invalid import return focus to Plans', async ({ page }) => {
	let sheet = await openPlans(page);
	const pending = page.waitForEvent('filechooser');
	await sheet.getByTestId('plans-import').click();
	const chooser = await pending;
	await chooser.setFiles([]);
	await expectClosed(page, sheet, 'plan-switcher');
	sheet = await openPlans(page);
	const next = page.waitForEvent('filechooser');
	await sheet.getByTestId('plans-import').click();
	await (
		await next
	).setFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('invalid') });
	await expect(sheet).toHaveCount(0);
	const errors = page.getByTestId('import-errors');
	await expect(errors).toBeVisible();
	await waitForAnimations(errors);
	await expect.poll(() => errors.evaluate((e) => e.contains(document.activeElement))).toBe(true);
	await page.keyboard.press('Escape');
	await expectClosed(page, sheet, 'plan-switcher');
});

test('import conflict survives sheet closure and cancel restores Plans focus', async ({ page }) => {
	await openExample(page);
	const file = { schemaVersion: 1, kind: 'plan', plan: await storedPlan(page) };
	const sheet = await openPlans(page);
	const pending = page.waitForEvent('filechooser');
	await sheet.getByTestId('plans-import').click();
	await (
		await pending
	).setFiles({
		name: 'conflict.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(file))
	});
	await expect(sheet).toHaveCount(0);
	const conflict = page.getByTestId('import-conflicts');
	await expect(conflict).toBeVisible();
	await waitForAnimations(conflict);
	await conflict.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expectClosed(page, sheet, 'plan-switcher');
	expect(await storedPlan(page)).toEqual(file.plan);
});

test('Plans imports a new file through the chooser and selects it after the sheet closes', async ({
	page
}) => {
	await openExample(page);
	const plan = await storedPlan(page);
	plan.id = 'touch-import';
	plan.heading = 'Imported by touch';
	const sheet = await openPlans(page);
	const pending = page.waitForEvent('filechooser');
	await sheet.getByTestId('plans-import').click();
	await (
		await pending
	).setFiles({
		name: 'touch.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'plan', plan }))
	});
	await expect(sheet).toHaveCount(0);
	await expect(page.getByTestId('plan-heading')).toHaveText('Imported by touch');
	expect(await planIds(page)).toContain('touch-import');
	await expect(page.getByTestId('plan-switcher')).toBeFocused();
});

test('Plans sheet keyboard selection opens the next plan and moves its check mark', async ({
	page
}) => {
	await openExample(page);
	const original = (await storedPlan(page)).heading;
	let sheet = await openPlans(page);
	await sheet.getByTestId('plans-new').click();
	await expect(sheet).toHaveCount(0);
	await expect(page.getByTestId('plan-heading')).toHaveText('Untitled plan');
	// Start on the first plan so ArrowDown selects the second plan without wrapping.
	sheet = await openPlans(page);
	await sheet.getByRole('radio', { name: original, exact: true }).click();
	await expect(sheet).toHaveCount(0);
	await expect(page.getByTestId('plan-heading')).toHaveText(original);
	sheet = await openPlans(page);
	await sheet.getByRole('radio', { name: original, exact: true }).focus();
	await page.keyboard.press('ArrowDown');
	await expect.soft(page.getByTestId('plan-heading')).toHaveText('Untitled plan');
	await expect.soft(sheet).toHaveCount(0);
	// Inspect the rendered check mark as well as the radio state after reopening.
	if (await sheet.count()) await page.keyboard.press('Escape');
	sheet = await openPlans(page);
	await expect(sheet.getByRole('radio', { name: 'Untitled plan', exact: true })).toBeChecked();
	await expect(
		sheet.getByRole('radio', { name: 'Untitled plan', exact: true }).locator('svg')
	).toHaveCount(1);
	await expect(
		sheet.getByRole('radio', { name: original, exact: true }).locator('svg')
	).toHaveCount(0);
});

test('Duplicate plan runs once before a reopened This plan sheet is dismissed', async ({
	page
}) => {
	await expectDuplicateOnceAfterReopen(page);
});
