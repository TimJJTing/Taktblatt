import { expect, test, type Page } from '@playwright/test';
import { formatted, openApp, openExample, row, storedPlan, writeStoredPlan } from './helpers';

declare global {
	interface Window {
		__printed: number;
		__printedSheets: number[];
	}
}

const sheets = (page: Page) => page.getByTestId('sheet');
const previewButton = (page: Page) => page.getByTestId('preview-open');

async function openPreview(page: Page) {
	await previewButton(page).click();
	await expect(page.getByRole('dialog', { name: 'Print preview' })).toBeVisible();
	await expect(sheets(page).first()).toBeVisible();
}

const addDays = (date: string, days: number) =>
	new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Adds many tasks to the first stage. The Gantt and the table then need more than one sheet. */
async function addManyTasks(page: Page, count: number) {
	await writeStoredPlan(page, (plan) => {
		const stageId = plan.stages[0].id;
		for (let i = 0; i < count; i++) {
			plan.tasks.push({
				id: `bulk${i}`,
				stageId,
				parentId: null,
				title: `Bulk task ${i + 1}`,
				// An empty deliverable keeps the stage card small. A card is one block and does not split.
				deliverable: '',
				start: addDays(plan.range.start, i % 40),
				end: addDays(plan.range.start, (i % 40) + 5),
				owners: ['Noor'],
				done: false,
				note: '',
				dependsOn: [],
				createdAt: new Date(Date.UTC(2030, 0, 1, 0, 0, i)).toISOString()
			});
		}
	});
}

test('the preview opens as a dialog, Esc closes it, and the focus returns to the button', async ({
	page
}) => {
	await openExample(page);
	await openPreview(page);
	// The workspace behind the dialog is inert.
	await expect(page.locator('[data-workspace]')).toHaveAttribute('inert', '');
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('preview')).toHaveCount(0);
	await expect(previewButton(page)).toBeFocused();
	await expect(page.locator('[data-workspace]')).not.toHaveAttribute('inert', '');
});

test('page 1 is the overview and the work plan starts on a new sheet', async ({ page }) => {
	await openExample(page);
	await openPreview(page);
	const count = await sheets(page).count();
	expect(count).toBeGreaterThan(1);
	const first = sheets(page).first();
	await expect(first.getByRole('heading', { level: 1 })).toContainText('Community Garden');
	await expect(first).toContainText('Objective:');
	await expect(first.getByTestId('sheet-month-header')).toHaveCount(1);
	await expect(first.getByTestId('sheet-gantt-row')).toHaveCount(7);
	await expect(first.getByTestId('sheet-gantt-today')).toBeVisible();
	await expect(first.getByTestId('sheet-gantt-bar')).toHaveCount(7);
	await expect(first.getByTestId('sheet-gantt-dependency')).toHaveCount(4);
	await expect(first.getByTestId('sheet-gantt-band')).toHaveCount(1);
	await expect(first.getByTestId('sheet-stage-card')).toHaveCount(3);
	await expect(first.getByText('Stages', { exact: true })).toBeVisible();
	await expect(first.getByText('Milestones', { exact: true }).first()).toBeVisible();
	await expect(first.getByText('Bands', { exact: true })).toBeVisible();
	await expect(first.getByTestId('sheet-table')).toHaveCount(0);

	const second = sheets(page).nth(1);
	await expect(second.locator('[data-fragment]').first()).toHaveAttribute(
		'data-fragment',
		/^stage-/
	);
	await expect(second.getByRole('heading', { name: 'Work plan' })).toBeVisible();
	await expect(second.getByTestId('sheet-table')).toHaveCount(3);
	// Remarks come after all stages.
	await expect(sheets(page).last().getByTestId('sheet-remark')).toHaveCount(2);

	// Every sheet shows "n / N".
	for (let i = 0; i < count; i++) {
		await expect(sheets(page).nth(i).getByTestId('page-number')).toHaveText(`${i + 1} / ${count}`);
	}
	// The footer of the plan shows on every sheet. The empty parts do not show.
	await expect(sheets(page).nth(1).getByTestId('sheet-footer-left')).toContainText('Example · v1');
	await expect(sheets(page).nth(1).getByTestId('sheet-footer-right')).toHaveText(
		'Garden volunteers'
	);
});

test('the sheet count is stable and the sheets have no controls', async ({ page }) => {
	await openExample(page);
	await openPreview(page);
	const count = await sheets(page).count();
	await page.keyboard.press('Escape');
	await openPreview(page);
	await expect(sheets(page)).toHaveCount(count);
	await expect(page.getByTestId('sheets').getByRole('button')).toHaveCount(0);
	await expect(page.getByTestId('sheets').getByRole('textbox')).toHaveCount(0);
	// The sheets use the plan fonts.
	const loaded = await page.evaluate(() => document.fonts.check('12px "IBM Plex Sans Variable"'));
	expect(loaded).toBe(true);
});

test('the paper size changes the sheet size, is one undo step, and persists', async ({ page }) => {
	await openExample(page);
	await openPreview(page);
	const size = async () => {
		const box = await sheets(page).first().boundingBox();
		return { width: Math.round(box!.width), height: Math.round(box!.height) };
	};
	const a4 = await size();
	expect(a4.width).toBe(794);
	expect(a4.height).toBe(1123);
	await expect(page.getByTestId('paper-a4')).toHaveAttribute('aria-checked', 'true');

	await page.getByTestId('paper-letter').click();
	await expect(page.getByTestId('paper-letter')).toHaveAttribute('aria-checked', 'true');
	await expect.poll(size).toEqual({ width: 816, height: 1056 });
	await expect(page.getByTestId('sheets')).toHaveAttribute('data-paper', 'letter');
	await expect.poll(async () => (await storedPlan(page)).paper).toBe('letter');
	// The page number still matches the sheet count at the new size.
	const count = await sheets(page).count();
	await expect(sheets(page).last().getByTestId('page-number')).toHaveText(`${count} / ${count}`);

	await page.reload();
	await previewButton(page).click();
	await expect(page.getByTestId('paper-letter')).toHaveAttribute('aria-checked', 'true');
	await expect.poll(size).toEqual({ width: 816, height: 1056 });
});

test('expanding a parent adds rows to the preview', async ({ page }) => {
	await openExample(page);
	await openPreview(page);
	const rows = page.getByTestId('sheets').getByTestId('sheet-task-row');
	const ganttRows = page.getByTestId('sheets').getByTestId('sheet-gantt-row');
	await expect(rows).toHaveCount(7);
	await expect(ganttRows).toHaveCount(7);
	await page.keyboard.press('Escape');

	await row(page, 'Soil preparation').getByTestId('task-toggle').click();
	await openPreview(page);
	await expect(rows).toHaveCount(9);
	await expect(ganttRows).toHaveCount(9);
	await expect(page.getByTestId('sheets').getByText('Soil test')).toHaveCount(2);
});

test('the Gantt continues on the next sheet with the month header, and the table header repeats', async ({
	page
}) => {
	await openExample(page);
	await addManyTasks(page, 100);
	await openPreview(page);
	const count = await sheets(page).count();
	expect(count).toBeGreaterThan(4);

	// The Gantt has 107 rows. It continues on sheet 2. Each Gantt sheet has the month header.
	let ganttSheets = 0;
	let ganttRows = 0;
	for (let i = 0; i < count; i++) {
		const sheet = sheets(page).nth(i);
		const n = await sheet.getByTestId('sheet-gantt-row').count();
		if (n === 0) continue;
		ganttSheets += 1;
		ganttRows += n;
		await expect(sheet.getByTestId('sheet-month-header')).toHaveCount(1);
	}
	expect(ganttSheets).toBeGreaterThanOrEqual(2);
	expect(ganttRows).toBe(107);
	await expect(sheets(page).nth(1).getByTestId('sheet-gantt-row').first()).toBeVisible();
	// The title of the timeline shows once.
	await expect(page.getByTestId('sheets').getByRole('heading', { name: 'Timeline' })).toHaveCount(
		1
	);

	// The first stage has 103 rows in the table. Its table continues, and the header repeats.
	let tableSheets = 0;
	let taskRows = 0;
	for (let i = 0; i < count; i++) {
		const sheet = sheets(page).nth(i);
		const n = await sheet.getByTestId('sheet-task-row').count();
		taskRows += n;
		if (n === 0) continue;
		const heads = sheet.getByTestId('sheet-table-head');
		await expect(heads).toHaveCount(await sheet.getByTestId('sheet-table').count());
		await expect(heads.first()).toContainText('Deliverable');
		tableSheets += 1;
	}
	expect(tableSheets).toBeGreaterThanOrEqual(3);
	expect(taskRows).toBe(107);
	// The stage header shows once. The work plan title shows once.
	await expect(
		page.getByTestId('sheets').getByRole('heading', { name: /Stage 1 · Prepare/ })
	).toHaveCount(1);
	await expect(page.getByTestId('sheets').getByRole('heading', { name: 'Work plan' })).toHaveCount(
		1
	);
	// No sheet starts with an orphan stage header: a header always has rows below it on its sheet.
	for (let i = 0; i < count; i++) {
		const sheet = sheets(page).nth(i);
		const tables = await sheet.getByTestId('sheet-table').count();
		const rowCount = await sheet.getByTestId('sheet-task-row').count();
		if (tables > 0) expect(rowCount).toBeGreaterThanOrEqual(tables);
	}
	// Every sheet stays inside its own box: no content below the footer.
	for (let i = 0; i < count; i++) {
		const sheet = sheets(page).nth(i);
		const box = (await sheet.boundingBox())!;
		const footer = (await sheet.getByTestId('sheet-footer').boundingBox())!;
		expect(footer.y + footer.height).toBeLessThanOrEqual(box.y + box.height);
		const content = (await sheet.locator('.sheet-content').boundingBox())!;
		const last = (await sheet.locator('[data-fragment]').last().boundingBox())!;
		expect(last.y + last.height).toBeLessThanOrEqual(content.y + content.height + 1);
	}
});

test('an empty plan has an overview sheet and a work plan sheet', async ({ page }) => {
	await openApp(page);
	await openPreview(page);
	await expect(sheets(page)).toHaveCount(2);
	await expect(sheets(page).first().getByRole('heading', { level: 1 })).toHaveText('Untitled plan');
	await expect(sheets(page).first().getByTestId('page-number')).toHaveText('1 / 2');
	// The empty stage shows the empty notice.
	await expect(sheets(page).nth(1)).toContainText('No tasks yet.');
	// An empty objective and an empty subheading do not show.
	await expect(sheets(page).first()).not.toContainText('Objective:');
});

test('print renders the sheets on beforeprint, hides the workspace and removes the sheets after', async ({
	page
}) => {
	await openExample(page);
	await expect(page.getByTestId('sheets')).toHaveCount(0);
	// The sheets exist in the same task as the event. The browser lays out the page right after it.
	const count = await page.evaluate(() => {
		window.dispatchEvent(new Event('beforeprint'));
		return document.querySelectorAll('[data-testid="sheet"]').length;
	});
	expect(count).toBeGreaterThan(1);
	// On screen, the print-only sheets do not show.
	await expect(sheets(page).first()).toBeHidden();
	await page.emulateMedia({ media: 'print' });
	await expect(page.locator('[data-workspace]')).toBeHidden();
	await expect(page.getByTestId('plan-heading')).toBeHidden();
	await expect(sheets(page).first()).toBeVisible();
	await expect(sheets(page)).toHaveCount(count);
	// Print sets the page size and has no page margin.
	const rule = await page.evaluate(() =>
		Array.from(document.querySelectorAll('style'))
			.map((style) => style.textContent ?? '')
			.find((text) => text.includes('@page'))
	);
	expect(rule).toContain('size: A4');
	expect(rule).toContain('margin: 0');

	await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
	await expect(page.getByTestId('sheets')).toHaveCount(0);
	await page.emulateMedia({ media: 'screen' });
	await expect(page.locator('[data-workspace]')).toBeVisible();
});

test('the printed PDF has one page for each sheet', async ({ page }) => {
	await openExample(page);
	await page.getByTestId('paper-letter').count();
	await openPreview(page);
	await page.getByTestId('paper-letter').click();
	await expect(page.getByTestId('sheets')).toHaveAttribute('data-paper', 'letter');
	const count = await sheets(page).count();
	await page.emulateMedia({ media: 'print' });
	// Only the sheets show in print, even when the preview is open.
	await expect(page.getByTestId('plan-heading')).toBeHidden();
	const pdf = await page.pdf({ preferCSSPageSize: true });
	const text = pdf.toString('latin1');
	const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
	expect(pages).toBe(count);
	// US Letter is 612 x 792 points.
	expect(text).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+612\s+792\s*\]/);
});

test('the Print button calls window.print', async ({ page }) => {
	await openExample(page);
	await page.evaluate(() => {
		window.__printed = 0;
		// The stub sends no `afterprint`. The sheets stay until the next input of the user.
		window.print = () => {
			window.__printed += 1;
		};
	});
	await page.getByTestId('print').click();
	await openPreview(page);
	await page.getByTestId('preview-print').click();
	expect(await page.evaluate(() => window.__printed)).toBe(2);
});

test('the print today line uses the footer date', async ({ page }) => {
	await openExample(page);
	// The footer date of the example is today. Move it outside the range: the line disappears.
	await writeStoredPlan(page, (plan) => {
		plan.footer.date = addDays(plan.range.end, 30);
	});
	await openPreview(page);
	await expect(sheets(page).first().getByTestId('sheet-gantt-today')).toHaveCount(0);
	await page.keyboard.press('Escape');
	await writeStoredPlan(page, (plan) => {
		plan.footer.date = addDays(plan.range.start, 10);
	});
	await openPreview(page);
	await expect(sheets(page).first().getByTestId('sheet-gantt-today')).toHaveCount(1);
});

test('the sheets use the UI language, whatever an old file says', async ({ page }) => {
	await openExample(page);
	// An old plan can still have a language key. It must change nothing. The UI stays English.
	await writeStoredPlan(page, (plan) => {
		plan.locale = 'ja';
	});
	await openPreview(page);
	const first = sheets(page).first();
	await expect(first).toContainText('Objective:');
	await expect(first).toContainText('Timeline');
	await expect(first).toContainText('Today');
	await expect(first).not.toContainText('目標');
	await expect(first.locator('.sheet-footer')).toContainText(
		formatted((await storedPlan(page)).footer.date)
	);
});

test('the sheets of an English plan show German labels and dates in the German UI', async ({
	page
}) => {
	await openExample(page);
	const plan = await storedPlan(page);
	await page.getByRole('button', { name: 'Language' }).click();
	await page.getByRole('menuitemradio', { name: 'Deutsch' }).click();
	// The plan has history, so the app asks before it reloads.
	await page.getByTestId('language-reload-confirm').click();
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await previewButton(page).click();
	await expect(sheets(page).first()).toBeVisible();
	const first = sheets(page).first();
	await expect(first).toContainText('Ziel:');
	await expect(first).toContainText('Zeitachse');
	await expect(first).toContainText('Heute');
	await expect(first).not.toContainText('Objective:');
	const german = new Intl.DateTimeFormat('de', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${plan.footer.date}T00:00:00Z`));
	await expect(first.locator('.sheet-footer')).toContainText(german);
});

test('open dialogs do not print, and the sheets do', async ({ page }) => {
	await openExample(page);
	await row(page, 'Sowing').getByTestId('task-details').click();
	await expect(page.getByTestId('task-dialog')).toBeVisible();
	await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
	await page.emulateMedia({ media: 'print' });
	await expect(page.getByTestId('task-dialog')).toBeHidden();
	await expect(page.getByTestId('sheet').first()).toBeVisible();
	await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
	await page.emulateMedia({ media: 'screen' });
});

test('print commits a field that is still in edit mode', async ({ page }) => {
	await openExample(page);
	await page.getByTestId('plan-heading').click();
	await page.getByTestId('plan-heading-input').fill('Typed but not saved');
	await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
	await expect(sheets(page).first()).toContainText('Typed but not saved');
	await expect(page.getByTestId('plan-heading')).toContainText('Typed but not saved');
});

test('printing from the preview keeps no screen shadow on the sheets', async ({ page }) => {
	await openExample(page);
	await openPreview(page);
	await expect(sheets(page).first()).not.toHaveCSS('box-shadow', 'none');
	await page.emulateMedia({ media: 'print' });
	await expect(sheets(page).first()).toHaveCSS('box-shadow', 'none');
});

test('the paper size control follows the radio keyboard pattern', async ({ page }) => {
	await openExample(page);
	await openPreview(page);
	const a4 = page.getByTestId('paper-a4');
	const letter = page.getByTestId('paper-letter');
	await expect(a4).toHaveAttribute('tabindex', '0');
	await expect(letter).toHaveAttribute('tabindex', '-1');
	await a4.focus();
	await page.keyboard.press('ArrowRight');
	await expect(letter).toBeFocused();
	await expect(letter).toHaveAttribute('aria-checked', 'true');
	await expect(letter).toHaveAttribute('tabindex', '0');
	await expect(page.getByTestId('sheets')).toHaveAttribute('data-paper', 'letter');
	await page.keyboard.press('Home');
	await expect(a4).toBeFocused();
	await expect(page.getByTestId('sheets')).toHaveAttribute('data-paper', 'a4');
	await page.keyboard.press('End');
	await expect(letter).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(a4).toBeFocused();
});

test('the target column of the sheets follows the workspace rule', async ({ page }) => {
	await openExample(page);
	// Keep the start dates and remove the end dates. A parent then has no derived end.
	await writeStoredPlan(page, (plan) => {
		for (const task of plan.tasks) {
			if (task.start) task.end = null;
		}
	});
	const workspace = new Map<string, string>();
	for (const item of await page.getByTestId('task-row').all()) {
		const title = await item.getByTestId('task-title').innerText();
		workspace.set(title, (await item.getByTestId('task-target').innerText()).trim());
	}
	await openPreview(page);
	let checked = 0;
	for (const item of await page.getByTestId('sheet-task-row').all()) {
		const cells = item.locator('td');
		const title = (await cells.nth(1).innerText()).trim();
		const target = (await cells.nth(3).innerText()).trim();
		const shown = workspace.get(title);
		// A task without a date has a placeholder text in the workspace and an en dash on paper.
		if (shown === undefined || !/–$/.test(shown)) continue;
		expect(target).toBe(shown);
		checked++;
	}
	expect(checked).toBeGreaterThan(0);
});

test('the today label does not cover the milestone row', async ({ page }) => {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		plan.footer.date = addDays(plan.range.start, 10);
	});
	await openPreview(page);
	const first = sheets(page).first();
	const label = (await first.getByTestId('sheet-gantt-today-label').boundingBox())!;
	const milestones = (await first.locator('[data-part="extra"]').boundingBox())!;
	expect(label.y).toBeGreaterThanOrEqual(milestones.y + milestones.height - 0.5);
});

test('the printed Gantt names points and marks tasks outside the range', async ({ page }) => {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		const point = plan.tasks.find((t) => t.title === 'Sowing')!;
		point.start = addDays(plan.range.start, 5);
		point.end = null;
		const outside = plan.tasks.find((t) => t.title === 'Watering rota')!;
		outside.start = addDays(plan.range.end, 20);
		outside.end = addDays(plan.range.end, 25);
	});
	await openPreview(page);
	const first = sheets(page).first();
	await expect(first.getByTestId('sheet-gantt-point')).toHaveCount(1);
	await expect(first.getByTestId('sheet-gantt-point')).toHaveAttribute('aria-label', /: /);
	await expect(first.getByTestId('sheet-gantt-outside')).toHaveCount(1);
});

test('a print dialog that is cancelled leaves the plan on screen without an error', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
	await openExample(page);
	// No stub: the real print runs. Headless Chromium returns at once, like a cancel. The test sends `afterprint`.
	await page.getByTestId('print').click();
	await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
	await expect(page.getByTestId('plan-heading')).toBeVisible();
	await expect(page.getByRole('heading', { name: '500' })).toHaveCount(0);
	await expect(sheets(page)).toHaveCount(0);
	expect(errors).toEqual([]);
});

/** Stubs window.print. It records how many sheets are in the page at the time of the call. */
async function recordSheetsAtPrint(page: Page) {
	await page.evaluate(() => {
		window.__printedSheets = [];
		window.print = () => {
			window.__printedSheets.push(document.querySelectorAll('[data-testid="sheet"]').length);
		};
	});
}

test('the sheets are in the page when the Print button opens the print dialog', async ({
	page
}) => {
	await openExample(page);
	await recordSheetsAtPrint(page);
	await page.getByTestId('print').click();
	expect((await page.evaluate(() => window.__printedSheets))[0]).toBeGreaterThan(0);
});

test('the sheets are in the page when Cmd/Ctrl+P opens the print dialog', async ({ page }) => {
	await openExample(page);
	await recordSheetsAtPrint(page);
	await page.keyboard.press('ControlOrMeta+p');
	expect((await page.evaluate(() => window.__printedSheets))[0]).toBeGreaterThan(0);
});

test('a field in edit mode is committed before the sheets render for print', async ({ page }) => {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		plan.objective = '';
	});
	await recordSheetsAtPrint(page);
	await page.getByTestId('plan-objective').click();
	await page.getByTestId('plan-objective-input').fill('Grow food together.');
	// The field keeps the focus. Print commits the draft first.
	await page.keyboard.press('ControlOrMeta+p');
	const sheetsAtPrint = (await page.evaluate(() => window.__printedSheets))[0];
	expect(sheetsAtPrint).toBeGreaterThan(0);
	expect((await storedPlan(page)).objective).toBe('Grow food together.');
	await expect(sheets(page).first()).toContainText('Grow food together.');
});

test('the sheets go away at the next input when the print sends no end event', async ({ page }) => {
	await openExample(page);
	// A no-op print: no `afterprint` and no change of the print media.
	await page.evaluate(() => {
		window.print = () => {};
	});
	await page.getByTestId('print').click();
	await expect(sheets(page).first()).toBeAttached();
	await page.getByTestId('plan-heading').click();
	await expect(sheets(page)).toHaveCount(0);
	await page.getByTestId('print').click();
	await expect(sheets(page).first()).toBeAttached();
	await page.keyboard.press('Shift');
	await expect(sheets(page)).toHaveCount(0);
});

test('the beforeprint fallback commits a field in edit mode', async ({ page }) => {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		plan.objective = '';
	});
	await page.getByTestId('plan-objective').click();
	await page.getByTestId('plan-objective-input').fill('Grow food together.');
	// A print from the browser menu sends only the events.
	await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
	expect((await storedPlan(page)).objective).toBe('Grow food together.');
	await expect(sheets(page).first()).toContainText('Grow food together.');
	await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
	await expect(sheets(page)).toHaveCount(0);
});
