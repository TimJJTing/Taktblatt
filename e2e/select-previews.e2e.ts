import { expect, test, type Locator } from '@playwright/test';
import { BAND_TINT_KEYS, BAND_TINTS, type BandTint } from '#lib/domain/palette.ts';
import en from '../messages/en.json' with { type: 'json' };
import de from '../messages/de.json' with { type: 'json' };
import ja from '../messages/ja.json' with { type: 'json' };
import zhTW from '../messages/zh-TW.json' with { type: 'json' };
import {
	chooseOption,
	expectPreviewBeforeName,
	openApp,
	openPreview,
	openSelect,
	storedPlan
} from './helpers.ts';

const symbols = [
	{ key: 'diamond', name: 'Diamond', icon: 'diamond' },
	{ key: 'flag', name: 'Flag', icon: 'flag' },
	{ key: 'star', name: 'Star', icon: 'star' },
	{ key: 'circle', name: 'Circle', icon: 'circle' },
	{ key: 'triangle', name: 'Triangle', icon: 'triangle' },
	{ key: 'square', name: 'Square', icon: 'square' },
	{ key: 'hexagon', name: 'Hexagon', icon: 'hexagon' },
	{ key: 'pentagon', name: 'Pentagon', icon: 'pentagon' },
	{ key: 'pin', name: 'Map pin', icon: 'map-pin' },
	{ key: 'bookmark', name: 'Bookmark', icon: 'bookmark' },
	{ key: 'heart', name: 'Heart', icon: 'heart' }
];

async function expectSymbolPreview(container: Locator, icon: string, name: string): Promise<void> {
	const selector = `svg.lucide-${icon}`;
	await expectPreviewBeforeName(container, selector, name);
	await expect(container.locator(selector)).toHaveClass(/\bfill-current\b/);
	if (icon === 'map-pin') {
		// The filled pin keeps a hole in its centre.
		await expect(container.locator(`${selector} path[fill-rule="evenodd"]`)).toHaveCount(1);
	}
}

test('milestone symbol options show filled previews in the specified order and remain selectable', async ({
	page
}) => {
	await openApp(page);
	await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
	const trigger = page.getByTestId('milestone-symbol');
	await expectSymbolPreview(trigger, 'diamond', 'Diamond');
	const listbox = await openSelect(page, 'milestone-symbol');
	await expect(listbox.getByRole('option')).toHaveText(symbols.map(({ name }) => name));
	for (const { name, icon } of symbols) {
		const option = listbox.getByRole('option', { name, exact: true });
		await expectSymbolPreview(option, icon, name);
	}
	await page.keyboard.press('Escape');
	await expect(listbox).toHaveCount(0);
	await expect(trigger).toBeFocused();
	for (const { name, icon } of symbols) {
		await chooseOption(page, 'milestone-symbol', name);
		await expect(listbox).toHaveCount(0);
		await expect(trigger).toHaveText(name);
		await expectSymbolPreview(trigger, icon, name);
	}
	await chooseOption(page, 'milestone-symbol', 'Hexagon');
	await expectSymbolPreview(trigger, 'hexagon', 'Hexagon');
});

test('a saved Hexagon milestone keeps its symbol in the dialog, Gantt and Preview sheet', async ({
	page
}) => {
	await openApp(page);
	const { range } = await storedPlan(page);
	await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
	const dialog = page.getByTestId('milestone-dialog');
	await dialog.getByLabel('Title', { exact: true }).fill('Hexagon review');
	await dialog.getByTestId('milestone-date').click();
	// The end date is inside the plan range and differs from the default start date.
	await page.getByTestId('date-value').fill(range.end);
	await page.getByTestId('date-value').press('Enter');
	await page.getByRole('button', { name: 'Done', exact: true }).last().click();
	await chooseOption(page, 'milestone-symbol', 'Hexagon');
	await dialog.getByRole('button', { name: 'OK', exact: true }).click();
	await expect(dialog).toHaveCount(0);
	await expect
		.poll(async () => (await storedPlan(page)).milestones)
		.toEqual([
			expect.objectContaining({ title: 'Hexagon review', date: range.end, symbol: 'hexagon' })
		]);
	await page.reload();
	const milestone = page.getByTestId('gantt-milestone').filter({ hasText: 'M1' });
	await expect(milestone).toHaveAccessibleName(/Hexagon review/);
	await expect(milestone.locator('svg.lucide-hexagon')).toBeVisible();
	await milestone.click();
	await expect(page.getByTestId('milestone-symbol')).toHaveText('Hexagon');
	await expectSymbolPreview(page.getByTestId('milestone-symbol'), 'hexagon', 'Hexagon');
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(dialog).toHaveCount(0);
	const preview = await openPreview(page);
	const sheet = preview.getByTestId('sheet').first();
	const printedMilestone = sheet.getByRole('img', { name: /Hexagon review/ });
	await expect(printedMilestone.locator('svg.lucide-hexagon')).toBeVisible();
	await page.emulateMedia({ media: 'print' });
	await expect(printedMilestone.locator('svg.lucide-hexagon')).toBeVisible();
});

const swatchSelector = '[data-slot="tint-swatch"]';

async function expectTintPreview(container: Locator, tint: BandTint): Promise<string> {
	await expectPreviewBeforeName(container, swatchSelector, tint);
	const swatch = container.locator(swatchSelector);
	await expect
		.poll(() =>
			swatch.evaluate((element, palette) => {
				const style = getComputedStyle(element);
				const probe = document.createElement('span');
				probe.style.backgroundColor = `color-mix(in oklab, light-dark(${palette.light}, ${palette.dark}) 60%, transparent)`;
				element.append(probe);
				const expectedBackground = getComputedStyle(probe).backgroundColor;
				probe.remove();
				const canvas = document.createElement('canvas');
				canvas.width = canvas.height = 1;
				const context = canvas.getContext('2d')!;
				context.fillStyle = style.backgroundColor;
				context.fillRect(0, 0, 1, 1);
				return {
					matchesBandFill: style.backgroundColor === expectedBackground,
					hasFill: context.getImageData(0, 0, 1, 1).data[3] > 0,
					hasBorder: [
						style.borderTopWidth,
						style.borderRightWidth,
						style.borderBottomWidth,
						style.borderLeftWidth
					].every((width) => parseFloat(width) > 0)
				};
			}, BAND_TINTS[tint])
		)
		.toEqual({ matchesBandFill: true, hasFill: true, hasBorder: true });
	return swatch.evaluate((element) => getComputedStyle(element).backgroundColor);
}

test('band tint previews have a border and the band fill in light and dark themes', async ({
	page
}) => {
	await openApp(page);
	await page.getByRole('button', { name: 'Add band', exact: true }).click();
	const trigger = page.getByTestId('band-tint');
	const fills: Record<string, Record<string, string>> = {};
	for (const theme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: theme });
		await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
		fills[theme] = { trigger: await expectTintPreview(trigger, 'gray') };
		const listbox = await openSelect(page, 'band-tint');
		await expect(listbox.getByRole('option')).toHaveText(BAND_TINT_KEYS);
		for (const tint of BAND_TINT_KEYS) {
			const option = listbox.getByRole('option', { name: tint, exact: true });
			fills[theme][tint] = await expectTintPreview(option, tint);
		}
		await page.keyboard.press('Escape');
		await expect(listbox).toHaveCount(0);
		await expect(trigger).toBeFocused();
	}
	for (const key of ['trigger', ...BAND_TINT_KEYS]) {
		expect(fills.dark[key], `${key} changes with the theme`).not.toBe(fills.light[key]);
	}
});

test('choosing a different band tint changes the trigger swatch and saved color', async ({
	page
}) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await openApp(page);
	await page.getByRole('button', { name: 'Add band', exact: true }).click();
	const dialog = page.getByTestId('band-dialog');
	await dialog.getByLabel('Title', { exact: true }).fill('Green field work');
	const trigger = page.getByTestId('band-tint');
	const initialFill = await expectTintPreview(trigger, 'gray');
	await chooseOption(page, 'band-tint', 'green');
	await expect(page.getByRole('listbox')).toHaveCount(0);
	await expect(trigger).toHaveText('green');
	const selectedFill = await expectTintPreview(trigger, 'green');
	expect(selectedFill).not.toBe(initialFill);
	await dialog.getByRole('button', { name: 'OK', exact: true }).click();
	await expect(dialog).toHaveCount(0);
	await expect
		.poll(async () => (await storedPlan(page)).bands)
		.toEqual([expect.objectContaining({ title: 'Green field work', color: 'green' })]);
	await page.reload();
	await page
		.getByTestId('band-legend')
		.getByRole('button', { name: /Green field work/ })
		.click();
	await expect(trigger).toHaveText('green');
	expect(await expectTintPreview(trigger, 'green')).toBe(selectedFill);
});

for (const { locale, catalog } of [
	{ locale: 'en', catalog: en },
	{ locale: 'de', catalog: de },
	{ locale: 'ja', catalog: ja },
	{ locale: 'zh-TW', catalog: zhTW }
]) {
	test(`symbol names appear in ${locale} options and triggers while stored keys stay language-neutral`, async ({
		page
	}) => {
		await page.addInitScript((locale) => localStorage.setItem('taktblatt:locale', locale), locale);
		await openApp(page);
		await expect(page.locator('html')).toHaveAttribute('lang', locale);
		await page.getByRole('button', { name: catalog.milestone_add, exact: true }).click();
		const names = symbols.map(({ key }) => (catalog as Record<string, string>)[`symbol_${key}`]);
		for (const name of names) {
			expect(typeof name).toBe('string');
			expect(name.trim()).not.toBe('');
		}
		const listbox = await openSelect(page, 'milestone-symbol');
		await expect(listbox.getByRole('option')).toHaveText(names);
		await page.keyboard.press('Escape');
		await expect(listbox).toHaveCount(0);
		for (const [index, { icon }] of symbols.entries()) {
			await chooseOption(page, 'milestone-symbol', names[index]);
			await expect(page.getByTestId('milestone-symbol')).toHaveText(names[index]);
			await expectSymbolPreview(page.getByTestId('milestone-symbol'), icon, names[index]);
		}
		await page.getByTestId('milestone-ok').click();
		await expect.poll(async () => (await storedPlan(page)).milestones[0]?.symbol).toBe('heart');
	});
}
