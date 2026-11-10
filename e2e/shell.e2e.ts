import { expect, test, type Page } from '@playwright/test';
import {
	chooseLanguage,
	chooseTheme,
	choosePrint,
	openApp,
	openMenu,
	openPlans,
	openLanguageMenu,
	openMenuWithKeyboard,
	openExample,
	storedPlan,
	expectDuplicateOnceAfterReopen
} from './helpers.ts';

test('the split header shows the app name and actions without section navigation', async ({
	page
}) => {
	await page.goto('/');
	const header = page.getByRole('banner');
	await expect(header).toContainText('Taktblatt');
	await expect(header.getByRole('navigation', { name: 'Plan sections' })).toHaveCount(0);
	await expect(
		header.locator(
			'a[href="#timeline"], a[href="#header"], a[href="#stage-overview"], a[href="#work-plan"], a[href="#remarks"]'
		)
	).toHaveCount(0);
	await expect(header.getByRole('tablist', { name: 'Workspace view' })).toBeHidden();
	await expect(page.getByTestId('app-menu')).toBeVisible();
	await expect(page.getByTestId('plan-switcher')).toBeVisible();
});

test('the header menus group actions by plan scope', async ({ page }) => {
	await openApp(page);
	const plans = await openPlans(page);
	await expect(
		plans.getByRole('menuitemradio', { name: 'Untitled plan', exact: true })
	).toBeChecked();
	await expect(plans.getByRole('menuitem')).toHaveText([
		'New plan',
		'Import…',
		'Back up all plans'
	]);
	await page.keyboard.press('Escape');
	const menu = await openMenu(page);
	await expect(menu.locator('[role="menuitem"]:not([data-testid="menu-language"])')).toHaveText([
		'Print…',
		'Export this plan',
		'Rename plan…',
		'Duplicate plan',
		'Delete plan…'
	]);
	await expect(menu.getByTestId('menu-export')).toHaveCount(0);
	await expect(menu.getByTestId('plans-import')).toHaveCount(0);
	await expect(menu.getByRole('menuitemradio')).toHaveCount(3);
	for (const name of ['Light', 'Dark', 'System'])
		await expect(menu.getByRole('menuitemradio', { name, exact: true })).toBeVisible();
	await expect(menu.getByTestId('menu-language')).toContainText('English');
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('app-menu')).toBeFocused();
});

test('Language opens a submenu with the current language checked', async ({ page }) => {
	await openApp(page);
	const languages = await openLanguageMenu(page);
	await expect(languages.getByRole('menuitemradio')).toHaveText([
		'English',
		'Deutsch',
		'繁體中文',
		'日本語'
	]);
	await expect(
		languages.getByRole('menuitemradio', { name: 'English', exact: true })
	).toBeChecked();
	await page.keyboard.press('Escape');
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('app-menu')).toBeFocused();
});

test('keyboard language selection closes the menu and cancel returns focus without losing the theme', async ({
	page
}) => {
	await openApp(page);
	await chooseTheme(page, 'Dark');
	await editHeading(page, 'Garden');
	// Open the Language submenu with the keyboard. A pointer click keeps focus on its trigger.
	await openMenuWithKeyboard(page);
	await page.keyboard.press('End');
	await expect(page.getByTestId('menu-language')).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByRole('menuitemradio', { name: 'English', exact: true })).toBeFocused();
	await page.keyboard.press('End');
	await expect(page.getByRole('menuitemradio', { name: '日本語', exact: true })).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	await expect(page.getByRole('menuitemradio', { name: 'Deutsch', exact: true })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(dialog(page)).toBeVisible();
	await expect(page.getByRole('menu')).toHaveCount(0);
	await page.getByTestId('language-reload-cancel').click();
	await expect(dialog(page)).toHaveCount(0);
	await expect(page.getByTestId('app-menu')).toBeFocused();
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
	await openLanguageMenu(page);
	await expect(page.getByRole('menuitemradio', { name: 'English', exact: true })).toBeChecked();
	await page.keyboard.press('Escape');
	await page.keyboard.press('Escape');
	await pickGerman(page);
	await expect(dialog(page)).toBeVisible();
	await expect(page.getByRole('menu')).toHaveCount(0);
	await page.getByTestId('language-reload-confirm').click();
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
	expect(await page.evaluate(() => localStorage.getItem('taktblatt:theme'))).toBe('dark');
	await expect(page.getByTestId('plan-heading')).toHaveText('Garden');
	await expect(page.getByTestId('app-menu')).toHaveAccessibleName('Menü');
	await openLanguageMenu(page);
	await expect(page.getByRole('menuitemradio', { name: 'Deutsch', exact: true })).toBeChecked();
});

test('the UI language changes and stays after a reload', async ({ page }) => {
	await page.goto('/');
	await chooseLanguage(page, 'Deutsch');
	await expect(page.getByTestId('plan-switcher')).toHaveText('Unbenannter Plan');
	await page.reload();
	await expect(page.getByTestId('plan-switcher')).toHaveText('Unbenannter Plan');
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});

const stored = (page: Page) => page.evaluate(() => localStorage.getItem('taktblatt:locale'));

test.describe('the first UI language comes from the browser', () => {
	test.describe('de-AT', () => {
		test.use({ locale: 'de-AT' });
		test('a supported language with a region is used', async ({ page }) => {
			await page.goto('/');
			await expect(page.getByTestId('plan-switcher')).toHaveText('Unbenannter Plan');
			await expect(page.locator('html')).toHaveAttribute('lang', 'de');
			// Paraglide saves the language it found, so the choice stays the same later.
			expect(await stored(page)).toBe('de');
		});
	});

	test.describe('zh-Hant-TW', () => {
		test.use({ locale: 'zh-Hant-TW' });
		test('Traditional Chinese with a script subtag gives zh-TW', async ({ page }) => {
			await page.goto('/');
			await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
		});
	});

	test.describe('zh-CN', () => {
		test.use({ locale: 'zh-CN' });
		test('Simplified Chinese falls back to English', async ({ page }) => {
			await page.goto('/');
			await expect(page.getByTestId('plan-switcher')).toHaveText('Untitled plan');
			await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		});
	});

	test.describe('fr-FR', () => {
		test.use({ locale: 'fr-FR' });
		test('an unsupported language falls back to English', async ({ page }) => {
			await page.goto('/');
			await expect(page.getByTestId('plan-switcher')).toHaveText('Untitled plan');
			await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		});
	});

	test.describe('fr-FR first, then ja', () => {
		test.use({ locale: 'fr-FR' });
		test('the next supported language in the list is used', async ({ page }) => {
			await page.addInitScript(() => {
				Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'ja-JP', 'en'] });
			});
			await page.goto('/');
			await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
		});
	});

	test.describe('a saved choice', () => {
		test.use({ locale: 'de-AT' });
		test('wins over the browser language', async ({ page }) => {
			await page.addInitScript(() => localStorage.setItem('taktblatt:locale', 'ja'));
			await page.goto('/');
			await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
		});
	});
});

test('a chosen language is saved under taktblatt:locale', async ({ page }) => {
	await page.goto('/');
	await chooseLanguage(page, 'Deutsch');
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	expect(await stored(page)).toBe('de');
	await page.reload();
	expect(await stored(page)).toBe('de');
	await expect(page.getByTestId('plan-switcher')).toHaveText('Unbenannter Plan');
});

const dialog = (page: Page) => page.getByTestId('language-reload-dialog');

/** Makes one undoable edit: renames the plan. */
async function editHeading(page: Page, text: string) {
	await page.getByTestId('plan-heading').click();
	await page.getByTestId('plan-heading-input').fill(text);
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('plan-heading')).toHaveText(text);
}

async function pickGerman(page: Page) {
	await chooseLanguage(page, 'Deutsch');
}

test.describe('a language change that would drop work', () => {
	test('cancel keeps the language, the history and the stored language', async ({ page }) => {
		await page.goto('/');
		await editHeading(page, 'Garden');
		await pickGerman(page);
		await expect(dialog(page)).toBeVisible();
		await expect(dialog(page)).toContainText('undo history');
		await page.getByTestId('language-reload-cancel').click();
		await expect(dialog(page)).toHaveCount(0);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		expect(await stored(page)).toBe('en');
		// The menu still shows English as the chosen language.
		await openLanguageMenu(page);
		await expect(page.getByRole('menuitemradio', { name: 'English' })).toBeChecked();
		await page.keyboard.press('Escape');
		await page.keyboard.press('Escape');
		// The edit is still undoable.
		await page.locator('body').press('ControlOrMeta+z');
		await expect(page.getByTestId('plan-heading')).toHaveText('Untitled plan');
	});

	test('confirm switches the language', async ({ page }) => {
		await page.goto('/');
		await editHeading(page, 'Garden');
		await pickGerman(page);
		await page.getByTestId('language-reload-confirm').click();
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');
		expect(await stored(page)).toBe('de');
		await expect(page.getByTestId('plan-heading')).toHaveText('Garden');
	});

	test('a fresh app switches at once, without a dialog', async ({ page }) => {
		await page.goto('/');
		await pickGerman(page);
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');
		await expect(dialog(page)).toHaveCount(0);
	});
});

test.describe('a language change in another tab', () => {
	test('a tab with history asks first; "Not now" keeps its language', async ({ context }) => {
		const a = await context.newPage();
		const b = await context.newPage();
		await a.goto('/');
		await b.goto('/');
		await editHeading(b, 'Garden');
		await pickGerman(a);
		await expect(a.locator('html')).toHaveAttribute('lang', 'de');
		await expect(dialog(b)).toBeVisible();
		await expect(dialog(b)).toContainText('Another tab changed the language');
		await b.getByTestId('language-reload-cancel').click();
		await expect(dialog(b)).toHaveCount(0);
		await expect(b.locator('html')).toHaveAttribute('lang', 'en');
		// A dialog that opens later still uses English.
		await openMenu(b);
		await b.getByRole('menuitem', { name: 'Delete plan…' }).click();
		await expect(b.getByRole('alertdialog')).toContainText('Delete this plan?');
		await b.keyboard.press('Escape');
		await expect(b.getByTestId('app-menu')).toHaveAccessibleName('Menu');
		await choosePrint(b);
		await expect(b.getByTestId('sheet').first()).toContainText('Timeline');
	});

	test('Esc on the question is "Not now"', async ({ context }) => {
		const a = await context.newPage();
		const b = await context.newPage();
		await a.goto('/');
		await b.goto('/');
		await editHeading(b, 'Garden');
		await pickGerman(a);
		await expect(dialog(b)).toBeVisible();
		await b.keyboard.press('Escape');
		await expect(dialog(b)).toHaveCount(0);
		await expect(b.locator('html')).toHaveAttribute('lang', 'en');
	});

	test('the question closes when the other tab goes back to this language', async ({ context }) => {
		const a = await context.newPage();
		const b = await context.newPage();
		await a.goto('/');
		await b.goto('/');
		await editHeading(b, 'Garden');
		await pickGerman(a);
		await expect(dialog(b)).toBeVisible();
		await chooseLanguage(a, 'English');
		await expect(a.locator('html')).toHaveAttribute('lang', 'en');
		await expect(dialog(b)).toHaveCount(0);
		// Tab B did not reload: its history is still there.
		await b.locator('body').press('ControlOrMeta+z');
		await expect(b.getByTestId('plan-heading')).toHaveText('Untitled plan');
	});

	test('"Not now" keeps the draft of an open dialog', async ({ context }) => {
		const a = await context.newPage();
		const b = await context.newPage();
		await a.goto('/');
		await b.goto('/');
		await b.getByRole('button', { name: 'Add milestone', exact: true }).click();
		await b.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Draft gate');
		await pickGerman(a);
		await expect(dialog(b)).toBeVisible();
		await b.getByTestId('language-reload-cancel').click();
		await expect(dialog(b)).toHaveCount(0);
		await expect(b.getByRole('dialog').getByLabel('Title', { exact: true })).toHaveValue(
			'Draft gate'
		);
	});

	test('"Reload" applies the new language', async ({ context }) => {
		const a = await context.newPage();
		const b = await context.newPage();
		await a.goto('/');
		await b.goto('/');
		await editHeading(b, 'Garden');
		await pickGerman(a);
		await b.getByTestId('language-reload-confirm').click();
		await expect(b.locator('html')).toHaveAttribute('lang', 'de');
		await expect(b.getByTestId('plan-heading')).toHaveText('Garden');
	});
});

test('another open tab reloads in the new UI language', async ({ context }) => {
	const first = await context.newPage();
	const second = await context.newPage();
	await first.goto('/');
	await second.goto('/');
	await expect(second.getByTestId('plan-switcher')).toHaveText('Untitled plan');
	await chooseLanguage(first, 'Deutsch');
	await expect(second.locator('html')).toHaveAttribute('lang', 'de');
	await expect(second.getByTestId('plan-switcher')).toHaveText('Unbenannter Plan');
});

test('Plans dropdown keyboard selection opens the next plan and moves its check mark', async ({
	page
}) => {
	await openExample(page);
	const original = (await storedPlan(page)).heading;
	let menu = await openPlans(page);
	await menu.getByTestId('plans-new').click();
	await expect(menu).toHaveCount(0);
	menu = await openPlans(page);
	await menu.getByRole('menuitemradio', { name: original, exact: true }).click();
	await expect(menu).toHaveCount(0);
	await expect(page.getByTestId('plan-heading')).toHaveText(original);
	await page.getByTestId('plan-switcher').focus();
	await page.keyboard.press('Enter');
	menu = page.getByRole('menu');
	await expect(menu).toBeVisible();
	await menu.getByRole('menuitemradio', { name: original, exact: true }).focus();
	await page.keyboard.press('ArrowDown');
	await expect(
		menu.getByRole('menuitemradio', { name: 'Untitled plan', exact: true })
	).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('plan-heading')).toHaveText('Untitled plan');
	await expect(menu).toHaveCount(0);
	menu = await openPlans(page);
	await expect(
		menu.getByRole('menuitemradio', { name: 'Untitled plan', exact: true })
	).toBeChecked();
	await expect(
		menu.getByRole('menuitemradio', { name: 'Untitled plan', exact: true }).locator('svg')
	).toHaveCount(1);
	await expect(
		menu.getByRole('menuitemradio', { name: original, exact: true }).locator('svg')
	).toHaveCount(0);
});

test('Duplicate plan runs once before a reopened This plan dropdown is dismissed', async ({
	page
}) => {
	await openApp(page);
	await expectDuplicateOnceAfterReopen(page);
});
