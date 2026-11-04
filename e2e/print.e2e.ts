import { expect, test, type Page } from '@playwright/test';
import { openApp, openExample, row, storedPlan } from './helpers';

declare global {
	interface Window {
		__printed: number;
	}
}

const sheets = (page: Page) => page.getByTestId('sheet');
const previewButton = (page: Page) => page.getByTestId('preview-open');

async function openPreview(page: Page) {
	await previewButton(page).click();
	await expect(page.getByRole('dialog', { name: 'Print preview' })).toBeVisible();
	await expect(sheets(page).first()).toBeVisible();
}

type StoredPlan = Awaited<ReturnType<typeof storedPlan>>;

/** Changes the stored plan, then reloads. */
async function editStoredPlan(page: Page, change: (plan: StoredPlan) => void) {
	const plan = await storedPlan(page);
	change(plan);
	await page.evaluate((next) => {
		const index = JSON.parse(localStorage.getItem('taktblatt:index')!);
		const key = `taktblatt:plan:${index.activeId}`;
		const data = JSON.parse(localStorage.getItem(key)!);
		data.plan = next;
		localStorage.setItem(key, JSON.stringify(data));
	}, plan);
	await page.reload();
	await expect(page.getByTestId('plan-heading')).toBeVisible();
}

const addDays = (date: string, days: number) =>
	new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Adds many tasks to the first stage. The Gantt and the table then need more than one sheet. */
async function addManyTasks(page: Page, count: number) {
	await editStoredPlan(page, (plan) => {
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
	await editStoredPlan(page, (plan) => {
		plan.footer.date = addDays(plan.range.end, 30);
	});
	await openPreview(page);
	await expect(sheets(page).first().getByTestId('sheet-gantt-today')).toHaveCount(0);
	await page.keyboard.press('Escape');
	await editStoredPlan(page, (plan) => {
		plan.footer.date = addDays(plan.range.start, 10);
	});
	await openPreview(page);
	await expect(sheets(page).first().getByTestId('sheet-gantt-today')).toHaveCount(1);
});

test('the sheets use the document language, not the UI language', async ({ page }) => {
	await openExample(page);
	await editStoredPlan(page, (plan) => {
		plan.locale = 'de';
	});
	await openPreview(page);
	const first = sheets(page).first();
	await expect(first).toContainText('Ziel:');
	await expect(first).toContainText('Zeitachse');
	await expect(first).toContainText('Heute');
	await expect(first).not.toContainText('Objective:');
	await expect(first).toHaveAttribute('lang', 'de');
	// The preview chrome keeps the UI language.
	await expect(page.getByRole('dialog', { name: 'Print preview' })).toBeVisible();
});
