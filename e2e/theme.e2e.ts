import { expect, test, type Page } from '@playwright/test';
import {
	choosePrint,
	chooseTheme,
	openLanguageMenu,
	openApp,
	openExample,
	openPreview,
	openMenu,
	storedPlan,
	openMenuWithKeyboard,
	openLinePlan,
	ganttRow,
	expectStationStatus,
	setTaskStatus,
	row
} from './helpers.ts';

const menuButton = (page: Page) => page.getByTestId('app-menu');
const themeGroup = (page: Page) => page.getByRole('group', { name: 'Theme', exact: true });
const preference = (page: Page) => page.evaluate(() => localStorage.getItem('taktblatt:theme'));

async function expectTheme(page: Page, theme: 'light' | 'dark') {
	await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
	const chrome = page.locator('meta[name="theme-color"]');
	await expect(chrome).toHaveCount(1);
	await expect(chrome).toHaveAttribute('content', theme === 'dark' ? '#13161a' : '#ffffff');
}

test('System is the default and follows system changes while open', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await openApp(page);
	await openMenu(page);
	await expect(themeGroup(page).getByRole('menuitemradio')).toHaveCount(3);
	await expect(themeGroup(page).getByRole('menuitemradio', { name: 'System' })).toBeChecked();
	await page.keyboard.press('Escape');
	await expectTheme(page, 'light');
	await page.emulateMedia({ colorScheme: 'dark' });
	await expectTheme(page, 'dark');
	await openMenu(page);
	await expect(themeGroup(page).getByRole('menuitemradio', { name: 'System' })).toBeChecked();
	await page.keyboard.press('Escape');
	await page.emulateMedia({ colorScheme: 'light' });
	await expectTheme(page, 'light');
});

test('explicit themes override the system and all choices survive a reload', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await openApp(page);
	for (const [label, value, opposite] of [
		['Dark', 'dark', 'light'],
		['Light', 'light', 'dark'],
		['System', 'system', 'dark']
	] as const) {
		await chooseTheme(page, label);
		if (value !== 'system') {
			await page.emulateMedia({ colorScheme: value });
			await expectTheme(page, value);
		}
		await page.emulateMedia({ colorScheme: opposite });
		await expectTheme(page, value === 'system' ? opposite : value);
		await expect.poll(() => preference(page)).toBe(value);
		await page.reload();
		await expect(page.getByTestId('plan-heading')).toBeVisible();
		await expectTheme(page, value === 'system' ? opposite : value);
		await openMenu(page);
		await expect(
			themeGroup(page).getByRole('menuitemradio', { name: label, exact: true })
		).toBeChecked();
		await page.keyboard.press('Escape');
	}
});

test('the menu theme choices support keyboard selection and preserve plan history', async ({
	page
}) => {
	await openApp(page);
	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	const redo = page.getByRole('button', { name: 'Redo', exact: true });
	await expect(undo).toBeDisabled();
	await expect(redo).toBeDisabled();
	await page.getByTestId('plan-heading').click();
	await page.getByTestId('plan-heading-input').fill('Garden');
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('plan-heading')).toHaveText('Garden');
	const plan = await storedPlan(page);
	const origin = await page.evaluate(() => performance.timeOrigin);
	await openMenuWithKeyboard(page);
	// The five actions come before the Theme group.
	for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowDown');
	await expect(
		themeGroup(page).getByRole('menuitemradio', { name: 'Light', exact: true })
	).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(
		themeGroup(page).getByRole('menuitemradio', { name: 'Dark', exact: true })
	).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(
		themeGroup(page).getByRole('menuitemradio', { name: 'System', exact: true })
	).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(
		themeGroup(page).getByRole('menuitemradio', { name: 'Dark', exact: true })
	).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(
		themeGroup(page).getByRole('menuitemradio', { name: 'Light', exact: true })
	).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('menu')).toHaveCount(0);
	await expect(menuButton(page)).toBeFocused();
	await expectTheme(page, 'dark');
	expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
	expect(await storedPlan(page)).toEqual(plan);
	await undo.click();
	await expect(page.getByTestId('plan-heading')).toHaveText('Untitled plan');
	await redo.click();
	await expect(page.getByTestId('plan-heading')).toHaveText('Garden');
	await expectTheme(page, 'dark');
});

test('an invalid saved theme falls back to System', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('taktblatt:theme', 'invalid'));
	await page.emulateMedia({ colorScheme: 'light' });
	await openApp(page);
	await openMenu(page);
	await expect(themeGroup(page).getByRole('menuitemradio', { name: 'System' })).toBeChecked();
	await page.keyboard.press('Escape');
	await expectTheme(page, 'light');
	await page.emulateMedia({ colorScheme: 'dark' });
	await expectTheme(page, 'dark');
});

test('a theme change reaches another tab without reloading it', async ({ page, context }) => {
	await openApp(page);
	const other = await context.newPage();
	await openApp(other);
	const origin = await other.evaluate(() => performance.timeOrigin);
	await chooseTheme(page, 'Dark');
	await expectTheme(other, 'dark');
	await openMenu(other);
	await expect(
		themeGroup(other).getByRole('menuitemradio', { name: 'Dark', exact: true })
	).toBeChecked();
	expect(await other.evaluate(() => performance.timeOrigin)).toBe(origin);
});

test('Preview and printed sheets stay light with the same pagination in dark mode', async ({
	page
}, testInfo) => {
	await openExample(page);
	await chooseTheme(page, 'Light');
	await openPreview(page);
	const sheets = page.getByTestId('sheet');
	const count = await sheets.count();
	const dimensions = await sheets.first().evaluate((element) => {
		const box = element.getBoundingClientRect();
		return { width: box.width, height: box.height };
	});
	await page.keyboard.press('Escape');
	await chooseTheme(page, 'Dark');
	await openPreview(page);
	await expect(sheets).toHaveCount(count);
	await expect(sheets.first()).toHaveCSS('color-scheme', 'light');
	await expect(sheets.first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
	await expect(sheets.first()).toContainText('Community Garden');
	await expect
		.poll(() =>
			sheets.first().evaluate((element) => {
				const box = element.getBoundingClientRect();
				return { width: box.width, height: box.height };
			})
		)
		.toEqual(dimensions);
	await page.emulateMedia({ media: 'print' });
	await expect(page.locator('[data-workspace]')).toBeHidden();
	await expect(sheets.first()).toBeVisible();
	await expect(sheets.first()).toHaveCSS('color-scheme', 'light');
	await expect(sheets.first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
	const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
	expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(count);
	await testInfo.attach('dark-theme-print.pdf', { body: pdf, contentType: 'application/pdf' });
});

test('the app menu fits a phone header and works after an offline reload', async ({
	page,
	context
}) => {
	await page.setViewportSize({ width: 360, height: 800 });
	await openExample(page);
	await chooseTheme(page, 'Dark');
	await expectTheme(page, 'dark');
	await expect
		.poll(() =>
			page.locator('[data-app-header]').evaluate((header) => {
				const viewport = document.documentElement.clientWidth;
				return [...header.querySelectorAll('button')].every((button) => {
					const box = button.getBoundingClientRect();
					return box.left >= 0 && box.right <= viewport;
				});
			})
		)
		.toBe(true);
	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);
	await context.setOffline(true);
	await page.reload();
	await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
	await expectTheme(page, 'dark');
	await chooseTheme(page, 'Light');
	await expectTheme(page, 'light');
	await expect.poll(() => preference(page)).toBe('light');
	await openPreview(page);
	await page.keyboard.press('Escape');
	await openLanguageMenu(page);
	await expect(page.getByRole('menuitemradio', { name: 'English', exact: true })).toBeChecked();
	await page.getByRole('menuitemradio', { name: 'Deutsch', exact: true }).click();
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await expectTheme(page, 'light');
	await openLanguageMenu(page);
	await expect(page.getByRole('menuitemradio', { name: 'Deutsch', exact: true })).toBeChecked();
	await page.keyboard.press('Escape');
	await page.keyboard.press('Escape');
	await choosePrint(page);
	await expect(page.getByTestId('sheet').first()).toContainText('Zeitachse');
	await context.setOffline(false);
});

test('the saved theme applies before the app starts', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('taktblatt:theme', 'dark'));
	await page.emulateMedia({ colorScheme: 'light' });
	// Without its scripts, the app does not start. Only the page shell runs.
	await page.route('**/_app/immutable/**', (route) => route.abort());
	await page.goto('/');
	await expectTheme(page, 'dark');
	await expect(page.locator('html')).toHaveClass(/\bdark\b/);
	expect(await preference(page)).toBe('dark');
});

test('the Menu button shows its name in a tooltip', async ({ page }) => {
	await openApp(page);
	await menuButton(page).hover();
	await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText('Menu');
});

test('3c forced colors keep task lines, station fill forms and junctions visible [AC9,D30]', async ({
	page
}) => {
	await openLinePlan(page);
	await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
	await expect
		.poll(() => page.evaluate(() => matchMedia('(forced-colors: active)').matches))
		.toBe(true);
	for (const title of ['Source', 'Crossing']) {
		const mark = ganttRow(page, title).getByTestId('gantt-bar');
		const line = mark.locator('[data-gantt-line]');
		await expect(line).toBeVisible();
		const paint = await line.evaluate((node) => {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 1;
			const context = canvas.getContext('2d')!;
			const sample = (color: string) => {
				context.clearRect(0, 0, 1, 1);
				context.fillStyle = color;
				context.fillRect(0, 0, 1, 1);
				return [...context.getImageData(0, 0, 1, 1).data];
			};
			const probe = document.createElement('span');
			probe.style.color = 'Canvas';
			node.append(probe);
			const ground = sample(getComputedStyle(probe).color);
			probe.remove();
			return { ground, line: sample(getComputedStyle(node).backgroundColor) };
		});
		expect(paint.line[3]).toBe(255);
		expect(paint.line).not.toEqual(paint.ground);
		await expect(mark.locator('.station-dot').first()).toBeVisible();
	}
	await expectStationStatus(ganttRow(page, 'Source').getByTestId('gantt-bar'), 'todo');
	await expectStationStatus(ganttRow(page, 'Crossing').getByTestId('gantt-bar'), 'done');
	for (const status of ['in_progress', 'canceled'] as const) {
		await setTaskStatus(page, row(page, 'Source'), status);
		await expectStationStatus(ganttRow(page, 'Source').getByTestId('gantt-bar'), status);
	}
	const ring = page.getByTestId('gantt-junction').first();
	await expect(ring).toBeVisible();
	const stroke = await ring.locator('circle').evaluate((node) => getComputedStyle(node).stroke);
	expect(stroke).not.toBe('none');
	expect(stroke).not.toBe('rgba(0, 0, 0, 0)');
});

test('3c keyboard focus encloses the complete point station [AC3,AC11]', async ({ page }) => {
	await openLinePlan(page);
	const point = ganttRow(page, 'Point').getByTestId('gantt-point');
	await point.focus();
	await expect(point).toBeFocused();
	await expect(point).toHaveAccessibleName(/^Point:/);
	await expect(point).toHaveCSS('outline-style', 'solid');
	const bounds = await point.evaluate((node) => {
		const mark = node.getBoundingClientRect(),
			dot = node.querySelector('.station-dot')?.getBoundingClientRect();
		const clip = node.closest('[data-testid="gantt-scroller"]')!.getBoundingClientRect();
		return {
			mark: { left: mark.left, right: mark.right, top: mark.top, bottom: mark.bottom },
			dot: dot ? { left: dot.left, right: dot.right, top: dot.top, bottom: dot.bottom } : null,
			clip: { top: clip.top, bottom: clip.bottom },
			outline: parseFloat(getComputedStyle(node).outlineWidth)
		};
	});
	expect(bounds.dot).not.toBeNull();
	expect(bounds.mark.left).toBeLessThanOrEqual(bounds.dot!.left);
	expect(bounds.mark.right).toBeGreaterThanOrEqual(bounds.dot!.right);
	expect(bounds.mark.top).toBeLessThanOrEqual(bounds.dot!.top);
	expect(bounds.mark.bottom).toBeGreaterThanOrEqual(bounds.dot!.bottom);
	expect(bounds.mark.top - bounds.outline).toBeGreaterThan(bounds.clip.top);
	expect(bounds.mark.bottom + bounds.outline).toBeLessThan(bounds.clip.bottom);
});
