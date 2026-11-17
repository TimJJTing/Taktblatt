import { expect, test } from '@playwright/test';
import {
	choosePrint,
	importJson,
	openExample,
	openPreview,
	planIds,
	reloadInLocale,
	row,
	stage,
	storedPlan,
	waitForAnimations,
	writeStoredPlan,
	stageColorPalette
} from './helpers.ts';

const localizedProse = {
	en: /[A-Za-z]/,
	de: /[äöüÄÖÜß]|Datei|Daten|Wert|Format|muss|Schema|Pläne|Datum|Objekt|Migration|Verwenden/,
	'zh-TW': /\p{Script=Han}/u,
	ja: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
};

const notObjectDetail = {
	en: 'not an object',
	de: 'Objekt',
	'zh-TW': '物件',
	ja: 'オブジェクト'
} as const;

const missingVersionDetail = {
	en: 'schema version',
	de: 'Schemaversion',
	'zh-TW': '結構描述版本',
	ja: 'スキーマバージョン'
} as const;

for (const locale of ['en', 'de', 'zh-TW', 'ja'] as const) {
	test(`import diagnostics use ${locale} and rejected files preserve stored data`, async ({
		page
	}) => {
		await openExample(page);
		await reloadInLocale(page, locale);
		const before = await storedPlan(page);
		const ids = await planIds(page);
		const file = { schemaVersion: 1, kind: 'plan', plan: before };
		const invalidFields = (patch: Record<string, unknown>) => ({
			...file,
			plan: { ...before, ...patch }
		});
		const cases = [
			{ content: '{', detail: 'JSON' },
			{ content: [], detail: notObjectDetail[locale] },
			{ content: {}, detail: missingVersionDetail[locale] },
			{ content: { schemaVersion: 99 }, detail: '99' },
			{ content: { schemaVersion: 0 }, detail: '0' },
			{ content: invalidFields({ heading: 42 }), detail: 'plan.heading' },
			{ content: invalidFields({ paper: 'poster' }), detail: 'plan.paper' },
			{
				content: invalidFields({ range: { start: 'not a date', end: before.range.end } }),
				detail: 'plan.range.start'
			},
			{
				content: invalidFields({ range: { start: '2027-02-02', end: '2027-02-01' } }),
				detail: locale === 'en' ? 'on or before' : 'plan'
			},
			{ content: { schemaVersion: 1, kind: 'backup', plans: [] }, detail: 'plans' },
			{
				content: { schemaVersion: 1, kind: 'backup', plans: [before, before] },
				detail: 'plans'
			}
		];
		for (const { content, detail } of cases) {
			await importJson(page, content);
			const dialog = page.getByTestId('import-errors');
			const errors = dialog.getByRole('listitem');
			await expect(errors.first()).toBeVisible();
			const text = (await errors.allTextContents()).join('\n');
			expect(text).toContain(detail);
			expect(text).toMatch(localizedProse[locale]);
			if (locale !== 'en') {
				expect(text).not.toMatch(
					/The file|The data|Invalid type|Invalid key|Invalid input|Use a date|must be unique|must belong|before it ends|No migration/
				);
			}
			await dialog.getByRole('button').first().click();
			await expect(dialog).toBeHidden();
			expect(await storedPlan(page)).toEqual(before);
			expect(await planIds(page)).toEqual(ids);
		}
	});
}

for (const [locale, separator] of [
	['zh-TW', '·'],
	['ja', '・']
] as const) {
	test(`${locale} controls qualifier punctuation and owner lists on screen and sheets`, async ({
		page
	}) => {
		await openExample(page);
		await writeStoredPlan(page, (plan) => {
			plan.tasks.find((task) => task.title === 'Site survey')!.owners = ['Kai', 'Noor', 'Mei'];
			plan.stages[1].color = 'amber';
		});
		await reloadInLocale(page, locale);
		const names = new Intl.ListFormat(locale).format(['Kai', 'Noor', 'Mei']);
		await expect(
			row(page, 'Site survey').getByTestId('task-owners').getByRole('button')
		).toHaveAccessibleName(new RegExp(names));
		await stage(page, 0).getByTestId('stage-color').click();
		const palette = stageColorPalette(page);
		await expect(palette).toBeVisible();
		await waitForAnimations(palette.locator('..'));
		const amberName = await palette
			.getByRole('radio')
			.evaluateAll((radios) =>
				radios
					.map((radio) => radio.getAttribute('aria-label'))
					.find((name) => name?.startsWith('琥珀'))
			);
		expect(amberName).toContain(separator);
		if (locale === 'zh-TW') expect(amberName).not.toContain('・');
		await page.keyboard.press('Escape');
		await expect(page.locator('#header [role="group"] span[aria-hidden="true"]')).toHaveText([
			separator,
			separator
		]);
		const stageTitleWrapper = stage(page, 0).locator('h3 > span').first();
		await expect(stageTitleWrapper).toHaveCSS('display', 'flex');
		await expect(stageTitleWrapper).toHaveCSS('column-gap', /^(normal|0px)$/);
		const stageLabelPrefix = stageTitleWrapper.locator('> span').first();
		await expect(stageLabelPrefix).toHaveCSS('white-space', 'pre');
		await expect(stageLabelPrefix).toContainText(separator);
		const prefixToTitleGap = await stageTitleWrapper.evaluate((wrapper) => {
			const [prefix, title] = wrapper.querySelectorAll(':scope > span');
			return Math.round(title.getBoundingClientRect().left - prefix.getBoundingClientRect().right);
		});
		expect(prefixToTitleGap).toBe(0);
		await choosePrint(page);
		const sheets = page.getByTestId('sheet');
		await expect(sheets.first()).toBeVisible();
		const printedTask = sheets.getByTestId('sheet-task-row').filter({ hasText: 'Site survey' });
		await expect(printedTask).toContainText(names);
		await page.emulateMedia({ media: 'print' });
		await expect(printedTask).toContainText(names);
	});
}

test('Cancel and Escape keep the task editor open and preserve the task', async ({ page }) => {
	await openExample(page);
	const before = await storedPlan(page);
	await row(page, 'Soil preparation').getByTestId('task-details').click();
	const editor = page.getByTestId('task-dialog');
	const trigger = editor.getByRole('button', { name: 'Delete…', exact: true });
	for (const cancel of ['button', 'escape']) {
		await trigger.click();
		const confirmation = page.getByRole('alertdialog');
		await expect(confirmation).toBeVisible();
		if (cancel === 'button') {
			await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
		} else {
			await page.keyboard.press('Escape');
		}
		await expect(confirmation).toBeHidden();
		await expect(editor).toBeVisible();
		expect(await storedPlan(page)).toEqual(before);
	}
	await trigger.click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(editor).toBeHidden();
	await expect(row(page, 'Soil preparation')).toHaveCount(0);
});

test('paper ready lights keep their fixed colour in Preview and print under either theme', async ({
	page
}) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await openExample(page);
	await openPreview(page);
	const sheets = page.getByTestId('sheet');
	const lights = sheets.locator('.ready-dot');
	await expect(lights.first()).toBeVisible();
	const count = await sheets.count();
	for (const colorScheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme, media: 'screen' });
		await expect(lights.first()).toHaveCSS('background-color', 'rgb(46, 157, 91)');
		await expect(sheets).toHaveCount(count);
		await page.emulateMedia({ colorScheme, media: 'print' });
		await expect(lights.first()).toHaveCSS('background-color', 'rgb(46, 157, 91)');
		await expect(sheets).toHaveCount(count);
	}
});
