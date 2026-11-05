import { expect, test, type Page } from '@playwright/test';
import { expectStickyBelowHeader, openExample, storedPlan } from './helpers';

const toggle = (page: Page) => page.getByTestId('timeline-legends-toggle');
const legends = (page: Page) => page.getByTestId('timeline-legends');

async function expectFullWidthDivider(page: Page) {
	await expect
		.poll(() =>
			page.getByTestId('gantt-resize').evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				const width = document.documentElement.clientWidth;
				return {
					left: Math.abs(bounds.left) <= 1,
					right: Math.abs(bounds.right - width) <= 1,
					overflow: document.documentElement.scrollWidth > width
				};
			})
		)
		.toEqual({ left: true, right: true, overflow: false });
}

test('the Legends button supports keyboard use and remembers the browser preference', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openExample(page);
	await page.reload();
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
	const before = await storedPlan(page);
	await expect(toggle(page)).toHaveAccessibleName('Legends');
	await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
	await expect(toggle(page)).toHaveAttribute('aria-controls', 'timeline-legends');
	await expect(legends(page)).toBeVisible();
	const expandedHeight = (await page.getByTestId('timeline-panel').boundingBox())!.height;
	await toggle(page).focus();
	await page.keyboard.press('Space');
	await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
	await expect(toggle(page)).toBeFocused();
	await expect(legends(page)).toBeHidden();
	await expect(page.getByTestId('gantt')).toBeVisible();
	await expect
		.poll(async () => (await page.getByTestId('timeline-panel').boundingBox())!.height)
		.toBeLessThan(expandedHeight - 100);
	await expect(page.getByRole('button', { name: 'Add milestone', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Add band', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
	expect(await storedPlan(page)).toEqual(before);

	// Saving another viewer preference must keep the collapsed state.
	await page.getByTestId('gantt-pin').click();
	await page.reload();
	await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
	await expect(legends(page)).toBeHidden();
	await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'true');
	await toggle(page).focus();
	await page.keyboard.press('Enter');
	await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
	await expect(legends(page)).toBeVisible();
	await page.reload();
	await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
});

test('collapsing the pinned legends gives their space to the chart without an empty gap', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openExample(page);
	await page.getByTestId('gantt-pin').click();
	const panel = page.getByTestId('timeline-panel');
	await expect.poll(async () => (await panel.boundingBox())!.height).toBeCloseTo(315, 0);
	const before = await panel.evaluate((element) => ({
		height: element.getBoundingClientRect().height,
		chart: element.querySelector('[data-testid="gantt"]')!.getBoundingClientRect().height
	}));
	await toggle(page).click();
	await expect(legends(page)).toBeHidden();
	await expect
		.poll(() =>
			panel.evaluate((element, before) => {
				const chart = element.querySelector('[data-testid="gantt"]')!.getBoundingClientRect();
				const body = element
					.querySelector('[data-testid="timeline-body"]')!
					.getBoundingClientRect();
				return {
					sameHeight: Math.abs(element.getBoundingClientRect().height - before.height) <= 1,
					chartGrew: chart.height > before.chart + 100,
					noGap: Math.abs(body.bottom - chart.bottom) <= 1
				};
			}, before)
		)
		.toEqual({ sameHeight: true, chartGrew: true, noGap: true });
	await toggle(page).click();
	await expect(legends(page)).toBeVisible();
	await expect
		.poll(async () => (await page.getByTestId('gantt').boundingBox())!.height)
		.toBeCloseTo(before.chart, 0);
});

for (const width of [1280, 390]) {
	test(`legend rows have equal gaps and compact add buttons at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await openExample(page);
		await expect
			.poll(() =>
				page.getByTestId('timeline-panel').evaluate((element) => {
					const rows = ['stage-legend', 'milestone-legend', 'band-legend'].map((id) =>
						element.querySelector(`[data-testid="${id}"]`)!.parentElement!.getBoundingClientRect()
					);
					const gaps = rows.slice(1).map((row, i) => row.top - rows[i].bottom);
					return {
						minimumHeight: rows.every((row) => row.height >= 32),
						equalGap: Math.abs(gaps[0] - gaps[1]) <= 1,
						gap: Math.round(gaps[0])
					};
				})
			)
			.toEqual({ minimumHeight: true, equalGap: true, gap: 12 });
		for (const name of ['Add milestone', 'Add band']) {
			const button = page.getByRole('button', { name, exact: true });
			await expect(button).toBeVisible();
			const bounds = (await button.boundingBox())!;
			expect(bounds.width).toBe(24);
			expect(bounds.height).toBe(24);
			await button.click();
			await expect(page.getByRole('dialog')).toBeVisible();
			await page.keyboard.press('Escape');
		}
	});
}

for (const width of [390, 1280, 1920]) {
	test(`the pinned divider spans the app and resizes from its edges at ${width}px`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height: 900 });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await openExample(page);
		await expect(page.getByTestId('gantt-resize')).toHaveCount(0);
		const chartWidth = (await page.getByTestId('gantt').boundingBox())!.width;
		await page.getByTestId('gantt-pin').click();
		const panel = page.getByTestId('timeline-panel');
		await expect.poll(async () => (await panel.boundingBox())!.height).toBeCloseTo(315, 0);
		await expectFullWidthDivider(page);
		await expectStickyBelowHeader(panel);
		await expectFullWidthDivider(page);
		await expect
			.poll(async () => (await page.getByTestId('gantt').boundingBox())!.width)
			.toBeCloseTo(chartWidth, 0);
		for (const edge of ['left', 'right']) {
			const bounds = await page.getByTestId('gantt-resize').evaluate((element) => {
				const separator = element.getBoundingClientRect();
				return {
					left: separator.left,
					right: separator.right,
					y: separator.top + separator.height / 2,
					height: document.querySelector('[data-testid="timeline-panel"]')!.getBoundingClientRect()
						.height
				};
			});
			const x = edge === 'left' ? bounds.left + 2 : bounds.right - 2;
			await page.mouse.move(x, bounds.y);
			await page.mouse.down();
			await page.mouse.move(x, bounds.y + 24);
			await page.mouse.up();
			await expect
				.poll(async () => (await panel.boundingBox())!.height)
				.toBeCloseTo(bounds.height + 24, 0);
		}
		await toggle(page).click();
		await expectFullWidthDivider(page);
		await page.evaluate(() => (document.documentElement.style.overflowY = 'hidden'));
		await expectFullWidthDivider(page);
		await page.evaluate(() => document.documentElement.style.removeProperty('overflow-y'));
		await page.setViewportSize({ width: width + 80, height: 900 });
		await expectFullWidthDivider(page);
		await page.getByTestId('gantt-pin').click();
		await expect(page.getByTestId('gantt-resize')).toHaveCount(0);
	});
}

test('legend collapse animates chart space and immediately removes hidden entries from focus', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await openExample(page);
	await page.getByTestId('gantt-pin').click();
	await expect
		.poll(async () => (await page.getByTestId('timeline-panel').boundingBox())!.height)
		.toBeCloseTo(315, 0);
	const monitor = await page.evaluateHandle(() => ({ frames: [] as number[], done: false }));
	await monitor.evaluate((state) => {
		const chart = document.querySelector('[data-testid="gantt"]')!;
		const started = performance.now();
		const sample = () => {
			state.frames.push(chart.getBoundingClientRect().height);
			if (performance.now() - started < 600) requestAnimationFrame(sample);
			else state.done = true;
		};
		sample();
	});
	await toggle(page).click();
	await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
	expect(
		await legends(page)
			.locator('button')
			.evaluateAll((buttons) =>
				buttons.every((button) => {
					button.focus();
					return document.activeElement !== button;
				})
			)
	).toBe(true);
	const frames = await monitor.evaluate(async (state) => {
		while (!state.done) await new Promise(requestAnimationFrame);
		return state.frames;
	});
	await monitor.dispose();
	const first = frames[0];
	const last = frames.at(-1)!;
	expect(last - first).toBeGreaterThan(100);
	expect(frames.some((height) => height > first + 1 && height < last - 1)).toBe(true);
});

test('collapsed workspace legends and the divider do not change Preview or print', async ({
	page
}) => {
	await openExample(page);
	await page.getByTestId('preview-open').click();
	const sheets = page.getByTestId('sheet');
	await expect(sheets.first()).toBeVisible();
	const count = await sheets.count();
	const content = await sheets.allTextContents();
	await page.keyboard.press('Escape');
	await toggle(page).click();
	await page.getByTestId('gantt-pin').click();
	await page.getByTestId('preview-open').click();
	await expect(sheets).toHaveCount(count);
	await expect.poll(() => sheets.allTextContents()).toEqual(content);
	await expect(sheets.first().getByText('Stages', { exact: true })).toBeVisible();
	await expect(sheets.first().getByText('Milestones', { exact: true }).last()).toBeVisible();
	await expect(sheets.first().getByText('Bands', { exact: true })).toBeVisible();
	await expect(sheets.getByTestId('timeline-legends-toggle')).toHaveCount(0);
	await expect(sheets.getByRole('separator', { name: 'Timeline height' })).toHaveCount(0);
	await page.emulateMedia({ media: 'print' });
	await expect(sheets.first()).toBeVisible();
	await expect(page.getByTestId('timeline-panel')).toBeHidden();
	await expect(sheets).toHaveCount(count);
	await expect.poll(() => sheets.allTextContents()).toEqual(content);
});
