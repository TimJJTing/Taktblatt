import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	openApp,
	openExample,
	openMenu,
	openPlans,
	chooseLanguage,
	openSelect,
	chooseTheme,
	storedPlan,
	planIds,
	waitForAnimations,
	touchDrag,
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

/** Uses small steps so a slow drag cannot satisfy the flick threshold. */
function dragSteps(start: { x: number; y: number }, distance: number, count = 12) {
	return Array.from({ length: count }, (_, i) => ({
		x: start.x,
		y: start.y + (distance * (i + 1)) / count
	}));
}

async function titleDragStart(sheet: Locator) {
	const box = (await sheet.getByRole('heading').boundingBox())!;
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('a slow downward title drag past a quarter height closes Plans and restores focus', async ({
	page
}) => {
	const sheet = await openPlans(page);
	const box = (await sheet.boundingBox())!;
	const start = await titleDragStart(sheet);
	await touchDrag(page, start, dragSteps(start, box.height * 0.3), 100);
	await expectClosed(page, sheet, 'plan-switcher');
});

test('a short slow drag follows the finger then returns to the open position', async ({ page }) => {
	const sheet = await openMenu(page);
	const box = (await sheet.boundingBox())!;
	const start = await titleDragStart(sheet);
	const distance = box.height * 0.15;
	await touchDrag(page, start, dragSteps(start, distance), 100, async () => {
		const moved = (await sheet.boundingBox())!.y - box.y;
		expect(Math.abs(moved - distance)).toBeLessThanOrEqual(8);
	});
	await expect(sheet).toBeVisible();
	await waitForAnimations(sheet);
	await expect.poll(async () => (await sheet.boundingBox())!.y).toBeCloseTo(box.y, 0);
});

test('Esc during the return slides the sheet out from its current position', async ({ page }) => {
	const sheet = await openMenu(page);
	const box = (await sheet.boundingBox())!;
	const start = await titleDragStart(sheet);
	await touchDrag(page, start, dragSteps(start, box.height * 0.15), 100);
	// Press Esc and record the top in each frame in one call. A CDP round trip is as long as the exit.
	const { tops, releasedTop } = await page.evaluate(async () => {
		const releasedTop = document
			.querySelector('[data-testid="menu-sheet"]')!
			.getBoundingClientRect().top;
		const values: number[] = [];
		const options = { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true };
		const target = document.activeElement ?? document.body;
		target.dispatchEvent(new KeyboardEvent('keydown', options));
		target.dispatchEvent(new KeyboardEvent('keyup', options));
		for (let frame = 0; frame < 30; frame++) {
			const element = document.querySelector('[data-testid="menu-sheet"]');
			if (!element) break;
			values.push(element.getBoundingClientRect().top);
			await new Promise(requestAnimationFrame);
		}
		return { tops: values, releasedTop };
	});
	expect(tops.length).toBeGreaterThan(1);
	// The first top stays between the open position and the position before Esc.
	expect(tops[0]).toBeGreaterThan(box.y);
	expect(tops[0]).toBeLessThanOrEqual(releasedTop + 1);
	for (let index = 1; index < tops.length; index++) {
		expect(tops[index]).toBeGreaterThanOrEqual(tops[index - 1] - 1);
	}
	await expectClosed(page, sheet, 'app-menu');
});

test('a short fast downward flick closes This plan and restores focus', async ({ page }) => {
	const sheet = await openMenu(page);
	const box = (await sheet.boundingBox())!;
	// CDP adds about 50 ms between touch events. 100 px in two steps is a flick, not a long drag.
	expect(100).toBeLessThan(box.height * 0.25);
	const start = await titleDragStart(sheet);
	await touchDrag(page, start, dragSteps(start, 100, 2), 0);
	await expectClosed(page, sheet, 'app-menu');
});

test('an upward drag stays at the open top and keeps the sheet open', async ({ page }) => {
	const sheet = await openMenu(page);
	const box = (await sheet.boundingBox())!;
	const start = await titleDragStart(sheet);
	await touchDrag(page, start, dragSteps(start, -80), 100, async () => {
		const top = (await sheet.boundingBox())!.y;
		// Resistance allows at most 12 px of upward travel.
		expect(top).toBeGreaterThanOrEqual(box.y - 12);
		expect(top).toBeLessThan(box.y);
	});
	await waitForAnimations(sheet);
	await expect(sheet).toBeVisible();
	await expect.poll(async () => (await sheet.boundingBox())!.y).toBeCloseTo(box.y, 0);
	// The next downward drag must still work after the upward gesture.
	await touchDrag(page, start, dragSteps(start, 40), 100, async () => {
		expect(Math.abs((await sheet.boundingBox())!.y - box.y - 40)).toBeLessThanOrEqual(8);
	});
	await waitForAnimations(sheet);
	await expect.poll(async () => (await sheet.boundingBox())!.y).toBeCloseTo(box.y, 0);
});

test('dragging the Print tile closes the sheet without opening Preview or a dialog', async ({
	page
}) => {
	const sheet = await openMenu(page);
	const box = (await sheet.boundingBox())!;
	const tile = (await sheet.getByTestId('menu-print').boundingBox())!;
	const start = { x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 };
	await touchDrag(page, start, dragSteps(start, box.height * 0.3), 100);
	await expectClosed(page, sheet, 'app-menu');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('reduced motion returns a short drag immediately without an active animation', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const sheet = await openMenu(page);
	const box = (await sheet.boundingBox())!;
	const start = await titleDragStart(sheet);
	const distance = box.height * 0.15;
	await touchDrag(page, start, dragSteps(start, distance), 100, async () => {
		expect(Math.abs((await sheet.boundingBox())!.y - box.y - distance)).toBeLessThanOrEqual(8);
	});
	// Read the first frame after release without waiting for the return animation.
	const released = await sheet.evaluate(async (element) => {
		await new Promise(requestAnimationFrame);
		return {
			top: element.getBoundingClientRect().top,
			animating: element
				.getAnimations({ subtree: true })
				.some((animation) => animation.playState === 'running' || animation.pending)
		};
	});
	expect(released.top).toBeCloseTo(box.y, 0);
	expect(released.animating).toBe(false);
	await expect(sheet).toBeVisible();
});

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
	const language = menu.getByRole('combobox', { name: 'Language', exact: true });
	await expect(language).toHaveJSProperty('tagName', 'BUTTON');
	await expect(language).toHaveText('English');
	const listbox = await openSelect(page, 'menu-language');
	const options = listbox.getByRole('option');
	await expect(options).toHaveCount(4);
	const optionHeights = await options.evaluateAll((elements) =>
		elements.map((element) => element.getBoundingClientRect().height)
	);
	expect(optionHeights.every((height) => height >= 44)).toBe(true);
	await listbox.getByRole('option', { name: 'English', exact: true }).click();
	await expect(listbox).toHaveCount(0);
	await expectClosed(page, menu, 'app-menu');
	await openMenu(page);
	await expect(language).toHaveText('English');
	const targets = await menu
		.locator('button, [role="radio"]')
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

test('the current Language closes the sheet with Enter and Space and restores Menu focus', async ({
	page
}) => {
	for (const key of ['Enter', 'Space']) {
		const sheet = await openMenu(page);
		await openSelect(page, 'menu-language');
		await page.keyboard.press(key);
		await expectClosed(page, sheet, 'app-menu');
	}
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

test('sheet focus stays contained and scrolled Plans content consumes a downward drag in landscape', async ({
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
	const content = sheet.getByRole('radiogroup', { name: 'Plans', exact: true }).locator('..');
	const before = await content.evaluate((element) => ({
		scroll: element.scrollTop,
		overflow: element.scrollHeight - element.clientHeight
	}));
	expect(before.overflow).toBeGreaterThan(100);
	expect(before.scroll).toBeGreaterThan(100);
	const contentBox = (await content.boundingBox())!;
	const start = {
		x: contentBox.x + contentBox.width / 2,
		y: contentBox.y + contentBox.height / 3
	};
	await touchDrag(page, start, dragSteps(start, 60), 100, async () => {
		await expect
			.poll(() => content.evaluate((element) => element.scrollTop))
			.toBeLessThan(before.scroll - 20);
		expect((await sheet.boundingBox())!.y).toBeCloseTo(box.y, 0);
		expect((await heading.boundingBox())!.y).toBeCloseTo(titleTop, 0);
	});
	await expect(sheet).toBeVisible();
	expect((await sheet.boundingBox())!.y).toBeCloseTo(box.y, 0);
	// At the top, the same content must hand the drag to the sheet.
	await sheet.getByRole('radio').first().focus();
	await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBe(0);
	await touchDrag(page, start, dragSteps(start, box.height * 0.3), 100);
	await expectClosed(page, sheet, 'plan-switcher');
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
