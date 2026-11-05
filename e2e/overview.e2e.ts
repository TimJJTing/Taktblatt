import { expect, test } from '@playwright/test';
import {
	chooseOption,
	formatted,
	openApp,
	openExample,
	row,
	stage,
	storedPlan,
	titles,
	writeStoredPlan
} from './helpers';

test('header fields commit, cancel and keep the previous required heading', async ({ page }) => {
	await openApp(page);
	await page.getByTestId('plan-heading').click();
	await page.getByTestId('plan-heading-input').fill('Neighbourhood garden');
	await page.getByTestId('plan-heading-input').press('Enter');
	await expect(page.getByTestId('plan-heading')).toHaveText('Neighbourhood garden');
	await page.getByTestId('plan-heading').click();
	await page.getByTestId('plan-heading-input').fill('');
	await page.getByTestId('plan-heading-input').press('Tab');
	await expect(page.getByTestId('plan-heading')).toHaveText('Neighbourhood garden');
	await page.getByTestId('plan-heading').click();
	await page.getByTestId('plan-heading-input').fill('Cancel this');
	await page.getByTestId('plan-heading-input').press('Escape');
	await expect(page.getByTestId('plan-heading')).toHaveText('Neighbourhood garden');
	await page.getByTestId('plan-subheading').click();
	await page.getByTestId('plan-subheading-input').fill(' Mixed Case  ');
	await page.getByTestId('plan-subheading-input').press('Enter');
	await expect(page.getByTestId('plan-subheading')).toHaveCSS('text-transform', 'uppercase');
	await page.getByTestId('plan-objective').click();
	await page.getByTestId('plan-objective-input').fill('Grow food together.');
	await page.getByTestId('plan-objective-input').press('Tab');
	await expect(page.getByTestId('plan-objective')).toHaveText('Grow food together.');
	const plan = await storedPlan(page);
	expect(plan.subheading).toBe(' Mixed Case  ');
	expect(plan.objective).toBe('Grow food together.');
	await page.reload();
	await expect(page.getByTestId('plan-heading')).toHaveText('Neighbourhood garden');
});

test('Fit to tasks uses task dates and is disabled without dates', async ({ page }) => {
	await openApp(page);
	await expect(page.getByRole('button', { name: 'Fit to tasks' })).toBeDisabled();
	await stage(page, 0).hover();
	await stage(page, 0).getByTestId('add-task').click();
	await page.keyboard.type('Plant seeds');
	await page.keyboard.press('Enter');
	await expect(titles(page, 0)).toHaveText(['Plant seeds']);
	await row(page, 'Plant seeds').getByTestId('task-target').click();
	await page.getByTestId('date-start').fill('2027-01-02');
	await page.getByTestId('date-start').press('Enter');
	await page.getByTestId('date-end').fill('2027-01-05');
	await page.getByTestId('date-end').press('Enter');
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await page.getByRole('button', { name: 'Fit to tasks' }).click();
	expect((await storedPlan(page)).range).toEqual({ start: '2027-01-02', end: '2027-01-05' });
	await expect(page.getByTestId('plan-range')).toContainText('2027');
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	expect((await storedPlan(page)).range).not.toEqual({ start: '2027-01-02', end: '2027-01-05' });
});

test('stage titles stay in sync between the overview and work plan', async ({ page }) => {
	await openApp(page);
	const overview = page.getByTestId('overview-stage-title').first();
	await overview.click();
	await page.getByTestId('overview-stage-title-input').fill('Preparation');
	await page.getByTestId('overview-stage-title-input').press('Enter');
	await expect(stage(page, 0).getByTestId('stage-title')).toHaveText('Preparation');
	await stage(page, 0).getByTestId('stage-title').click();
	await page.getByTestId('stage-title-input').fill('');
	await page.getByTestId('stage-title-input').press('Enter');
	await expect(overview).toHaveText('Stage 1');
	await expect(stage(page, 0).getByTestId('stage-title')).toHaveText('Stage 1');
});

test('milestones can be added, edited and deleted through the legend', async ({ page }) => {
	await openApp(page);
	await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
	let dialog = page.getByRole('dialog');
	await dialog.getByLabel('Title', { exact: true }).fill('Review');
	await dialog.getByLabel('Description', { exact: true }).fill('Review the first results.');
	await dialog.getByTestId('milestone-date').click();
	await page.getByTestId('date-value').fill('2027-03-01');
	await page.getByTestId('date-value').press('Enter');
	await page.getByRole('button', { name: 'Done', exact: true }).last().click();
	await chooseOption(page, 'milestone-symbol', 'Star');
	await dialog.getByRole('button', { name: 'OK', exact: true }).click();
	const legend = page.getByTestId('milestone-legend');
	await expect(legend).toContainText('M1 Review');
	expect((await storedPlan(page)).milestones[0]).toMatchObject({
		description: 'Review the first results.',
		date: '2027-03-01',
		symbol: 'star'
	});
	await legend.getByRole('button', { name: /M1 Review/ }).click();
	dialog = page.getByRole('dialog');
	await dialog.getByLabel('Title', { exact: true }).fill('Final review');
	await dialog.getByTestId('milestone-date').click();
	await page.getByTestId('date-value').fill('2027-04-02');
	await page.getByTestId('date-value').press('Enter');
	await page.getByRole('button', { name: 'Done', exact: true }).last().click();
	await dialog.getByRole('button', { name: 'OK', exact: true }).click();
	await expect(legend).toContainText('M1 Final review');
	expect((await storedPlan(page)).milestones[0].date).toBe('2027-04-02');
	await legend.getByRole('button', { name: /M1 Final review/ }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete…', exact: true }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(legend).toContainText('M1 Final review');
	await page.getByRole('dialog').getByRole('button', { name: 'Delete…', exact: true }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(legend.getByRole('button', { name: /M1/ })).toHaveCount(0);
	expect((await storedPlan(page)).milestones).toEqual([]);
});

test('bands can be added, edited and deleted through the legend', async ({ page }) => {
	await openApp(page);
	await page.getByRole('button', { name: 'Add band', exact: true }).click();
	let dialog = page.getByRole('dialog');
	await dialog.getByLabel('Title', { exact: true }).fill('Field work');
	await chooseOption(page, 'band-tint', 'green');
	await dialog.getByRole('button', { name: /^Dates/ }).click();
	await page.getByTestId('date-start').fill('2027-03-01');
	await page.getByTestId('date-start').press('Enter');
	await page.getByTestId('date-end').fill('2027-03-31');
	await page.getByTestId('date-end').press('Enter');
	await page.getByRole('button', { name: 'Done', exact: true }).last().click();
	await dialog.getByRole('button', { name: 'OK', exact: true }).click();
	const legend = page.getByTestId('band-legend');
	await expect(legend).toContainText('Field work');
	expect((await storedPlan(page)).bands[0]).toMatchObject({
		start: '2027-03-01',
		end: '2027-03-31',
		color: 'green'
	});
	await legend.getByRole('button', { name: /Field work/ }).click();
	dialog = page.getByRole('dialog');
	await dialog.getByLabel('Title', { exact: true }).fill('Site work');
	await chooseOption(page, 'band-tint', 'blue');
	await dialog.getByRole('button', { name: 'OK', exact: true }).click();
	await expect(legend).toContainText('Site work');
	expect((await storedPlan(page)).bands[0].color).toBe('blue');
	await legend.getByRole('button', { name: /Site work/ }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete…', exact: true }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(legend.getByRole('button', { name: /Site work/ })).toHaveCount(0);
	expect((await storedPlan(page)).bands).toEqual([]);
});

test('section navigation scrolls below the sticky app header', async ({ page }) => {
	await openExample(page);
	await page
		.getByRole('navigation', { name: 'Plan sections' })
		.getByRole('link', { name: 'Remarks', exact: true })
		.click();
	await expect(page).toHaveURL(/#remarks$/);
	await expect(page.locator('#remarks')).toBeInViewport();
	const top = await page
		.locator('#remarks')
		.evaluate((element) => element.getBoundingClientRect().top);
	const bottom = await page
		.locator('body > header, header.sticky')
		.first()
		.evaluate((element) => element.getBoundingClientRect().bottom);
	expect(top).toBeGreaterThanOrEqual(bottom);
});

test('an outside click does not add a new milestone', async ({ page }) => {
	await openApp(page);
	await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
	await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Checkpoint');
	await page.mouse.click(5, 5);
	await expect(page.getByTestId('milestone-dialog')).toHaveCount(0);
	const legend = page.getByTestId('milestone-legend');
	await expect(legend.getByRole('button', { name: /Checkpoint/ })).toHaveCount(0);
	expect((await storedPlan(page)).milestones).toEqual([]);
});

test('an outside click saves a milestone edit and Escape cancels it', async ({ page }) => {
	await openApp(page);
	await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
	await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Checkpoint');
	await page.getByTestId('milestone-ok').click();
	const legend = page.getByTestId('milestone-legend');
	await expect(legend).toContainText('M1 Checkpoint');
	await legend.getByRole('button', { name: /M1 Checkpoint/ }).click();
	await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Gate');
	await page.mouse.click(5, 5);
	await expect(legend).toContainText('M1 Gate');
	await legend.getByRole('button', { name: /M1 Gate/ }).click();
	await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Cancelled');
	await page.keyboard.press('Escape');
	await expect(legend).toContainText('M1 Gate');
	expect((await storedPlan(page)).milestones[0].title).toBe('Gate');
});

test('an outside click does not add a new band', async ({ page }) => {
	await openApp(page);
	await page.getByRole('button', { name: 'Add band', exact: true }).click();
	await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Draft');
	await page.mouse.click(5, 5);
	await expect(page.getByTestId('band-dialog')).toHaveCount(0);
	expect((await storedPlan(page)).bands).toEqual([]);
});

test('legend dates use the UI language, whatever an old file says', async ({ page }) => {
	await openExample(page);
	// An old plan can still have a language key. It must change nothing. The UI stays English.
	await writeStoredPlan(page, (plan) => {
		plan.locale = 'ja';
	});
	await expect(page.getByRole('button', { name: 'Add milestone', exact: true })).toBeVisible();
	const milestone = (await storedPlan(page)).milestones[0];
	await expect(page.getByTestId('milestone-legend')).toContainText(
		`${milestone.title} (${formatted(milestone.date)})`
	);
	// The stage card keeps a space before the dot.
	await expect(page.getByTestId('stage-card-label').first()).toHaveText(/^Stage 1 · \S/);
});

test('the dates follow the UI language when it changes', async ({ page }) => {
	await openExample(page);
	const milestone = (await storedPlan(page)).milestones[0];
	await page.getByRole('button', { name: 'Language' }).click();
	await page.getByRole('menuitemradio', { name: 'Deutsch' }).click();
	const german = new Intl.DateTimeFormat('de', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${milestone.date}T00:00:00Z`));
	await expect(page.getByTestId('milestone-legend')).toContainText(
		`${milestone.title} (${german})`
	);
	expect((await storedPlan(page)).locale).toBeUndefined();
});

test('section navigation stops below the pinned Gantt', async ({ page }) => {
	await openExample(page);
	await page.getByTestId('gantt-pin').click();
	await page
		.getByRole('navigation', { name: 'Plan sections' })
		.getByRole('link', { name: 'Work plan', exact: true })
		.click();
	await expect(page).toHaveURL(/#work-plan$/);
	const heading = page.locator('#work-plan-title');
	await expect
		.poll(async () => {
			const top = (await heading.boundingBox())!.y;
			const gantt = (await page.getByTestId('gantt').boundingBox())!;
			return top >= gantt.y + gantt.height - 1;
		})
		.toBe(true);
	await expect(heading).toBeInViewport();
});

test('Escape closes the band date picker before it cancels the dialog', async ({ page }) => {
	await openApp(page);
	await page.getByRole('button', { name: 'Add band', exact: true }).click();
	await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Draft');
	await page
		.getByRole('dialog')
		.getByRole('button', { name: /^Dates/ })
		.click();
	await page.getByTestId('date-start').fill('2027-01-01');
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('date-start')).toHaveCount(0);
	await expect(page.getByRole('dialog')).toBeVisible();
	await expect(page.getByRole('dialog').getByLabel('Title', { exact: true })).toHaveValue('Draft');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	expect((await storedPlan(page)).bands).toEqual([]);
});
