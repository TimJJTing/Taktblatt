import { expect, test } from '@playwright/test';
import { expectStickyBelowHeader, openExample, row, writeStoredPlan } from './helpers';

test('the pin keeps the heading, chart and legends together and clears row jumps', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openExample(page);
	const panel = page.getByTestId('timeline-panel');
	const pin = page.getByTestId('gantt-pin');
	await expect(panel.getByRole('heading', { name: 'Timeline', exact: true })).toBeVisible();
	await expect(panel.getByTestId('gantt-pin')).toHaveCount(1);
	await expect(page.getByTestId('gantt').getByTestId('gantt-pin')).toHaveCount(0);
	await pin.click();
	await page.getByTestId('gantt-resize').press('End');
	await expectStickyBelowHeader(panel);
	await expect
		.poll(() =>
			panel.evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				const parts = element.querySelectorAll(
					'#timeline-title, [data-testid="gantt"], [data-testid$="-legend"]'
				);
				const offset = parseFloat(
					getComputedStyle(document.documentElement).getPropertyValue('--gantt-pinned-h')
				);
				return {
					parts: parts.length,
					contained: [...parts].every((part) => {
						const rect = part.getBoundingClientRect();
						return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
					}),
					offsetMatches: Math.abs(offset - bounds.height) <= 1
				};
			})
		)
		.toEqual({ parts: 5, contained: true, offsetMatches: true });

	await page
		.getByTestId('gantt-label')
		.filter({ hasText: /^Site survey$/ })
		.click();
	await expect
		.poll(() =>
			row(page, 'Site survey').evaluate((element) => {
				const panel = document.querySelector('[data-testid="timeline-panel"]')!;
				return element.getBoundingClientRect().top - panel.getBoundingClientRect().bottom;
			})
		)
		.toBeGreaterThanOrEqual(0);
	await expectStickyBelowHeader(panel);
	await pin.click();
	await expect(pin).toHaveAttribute('aria-pressed', 'false');
	await expect(panel).not.toHaveCSS('position', 'fixed');
	await expect(page.getByTestId('gantt-resize')).toHaveCount(0);
	await expect
		.poll(() =>
			page.evaluate(() => document.documentElement.style.getPropertyValue('--gantt-pinned-h'))
		)
		.toBe('');
	await page.evaluate(() => window.scrollTo(0, 0));
	await expect(panel.getByRole('heading', { name: 'Timeline', exact: true })).toBeInViewport();
});

test('the mobile pin stays accessible during chart panning and legend overflow', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		plan.stages[0].title = 'A long stage title that wraps on a small screen';
		for (let i = 0; i < 8; i++) {
			plan.bands.push({ ...plan.bands[0], id: `extra-band-${i}`, title: `Season ${i + 1}` });
		}
	});
	const panel = page.getByTestId('timeline-panel');
	const pin = page.getByTestId('gantt-pin');
	await pin.click();
	await expectStickyBelowHeader(panel);
	const pinBefore = (await pin.boundingBox())!;
	await page.getByTestId('gantt-scroller').evaluate((element) => (element.scrollLeft = 200));
	await expect
		.poll(() => page.getByTestId('gantt-scroller').evaluate((element) => element.scrollLeft))
		.toBeGreaterThan(0);
	await expect.poll(async () => (await pin.boundingBox())!.x).toBeCloseTo(pinBefore.x, 0);
	await page.getByTestId('gantt-resize').press('Home');
	const body = page.getByTestId('timeline-body');
	await expect
		.poll(() =>
			panel.evaluate((element) => {
				const body = element.querySelector<HTMLElement>('[data-testid="timeline-body"]')!;
				return {
					minimumHeight: Math.abs(element.getBoundingClientRect().height - 120) <= 1,
					overflow: body.scrollHeight > body.clientHeight
				};
			})
		)
		.toEqual({ minimumHeight: true, overflow: true });
	await body.evaluate((element) => (element.scrollTop = element.scrollHeight));
	await expect(panel.getByRole('button', { name: 'Add band', exact: true })).toBeInViewport();
	await expect(pin).toBeInViewport();
	await expect
		.poll(async () => (await page.getByTestId('gantt').boundingBox())!.height)
		.toBeGreaterThanOrEqual(83);

	// Reveal the linked chart label inside both scrollers without moving the page.
	await row(page, 'First harvest').scrollIntoViewIfNeeded();
	await body.evaluate((element) => (element.scrollTop = element.scrollHeight));
	const scrollY = await page.evaluate(() => window.scrollY);
	await row(page, 'First harvest')
		.getByTestId('task-done')
		.evaluate((element) => {
			(element as HTMLElement).focus({ preventScroll: true });
		});
	const label = page.getByTestId('gantt-label').filter({ hasText: /^First harvest$/ });
	await expect(label).toBeInViewport({ ratio: 1 });
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollY);
	await expect(pin).toBeInViewport();
	await pin.click();
	await expect(pin).toHaveAttribute('aria-pressed', 'false');
});

test('the full section resizes with a pointer', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openExample(page);
	await page.getByTestId('gantt-pin').click();
	const panel = page.getByTestId('timeline-panel');
	await expect
		.poll(async () => (await panel.boundingBox())!.height)
		.toBeCloseTo(page.viewportSize()!.height * 0.35, 0);
	const { before, handle } = await panel.evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		const separator = element
			.querySelector('[data-testid="gantt-resize"]')!
			.getBoundingClientRect();
		return {
			before: { height: bounds.height },
			handle: { x: separator.x, y: separator.y, width: separator.width, height: separator.height }
		};
	});
	await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
	await page.mouse.down();
	await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 30);
	await page.mouse.up();
	await expect
		.poll(async () => (await panel.boundingBox())!.height)
		.toBeCloseTo(before.height + 30, 0);
});

test('unpinning moves the chart and legends with the section height', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await openExample(page);
	const pin = page.getByTestId('gantt-pin');
	const panel = page.getByTestId('timeline-panel');
	await pin.click();
	await expect.poll(async () => (await panel.boundingBox())!.height).toBeCloseTo(315, 0);
	const monitor = await page.evaluateHandle(() => ({
		frames: [] as { panel: number; chart: number; legend: number }[],
		done: false
	}));
	await monitor.evaluate((state) => {
		const panel = document.querySelector('[data-testid="timeline-panel"]')!;
		const chart = document.querySelector('[data-testid="gantt"]')!;
		const legend = document.querySelector('[data-testid="stage-legend"]')!;
		const started = performance.now();
		const sample = () => {
			const bounds = panel.getBoundingClientRect();
			state.frames.push({
				panel: bounds.height,
				chart: chart.getBoundingClientRect().height,
				legend: legend.getBoundingClientRect().top - bounds.top
			});
			if (performance.now() - started < 600) requestAnimationFrame(sample);
			else state.done = true;
		};
		sample();
	});
	await pin.click();
	await expect(pin).toHaveAttribute('aria-pressed', 'false');
	const frames = await monitor.evaluate(async (state) => {
		while (!state.done) await new Promise(requestAnimationFrame);
		return state.frames;
	});
	await monitor.dispose();
	const first = frames[0];
	const last = frames.at(-1)!;
	expect(last.chart - first.chart).toBeGreaterThan(80);
	expect(last.legend - first.legend).toBeGreaterThan(80);
	expect(
		frames.some((frame) => frame.panel > first.panel + 1 && frame.panel < last.panel - 1)
	).toBe(true);
	const jumps = frames.slice(1).map((frame, i) => {
		const previous = frames[i];
		const panelChange = frame.panel - previous.panel;
		return Math.max(
			Math.abs(frame.chart - previous.chart - panelChange),
			Math.abs(frame.legend - previous.legend - panelChange)
		);
	});
	// Content follows the section. Allow 20 px for the resize handle and 4 px for rounding.
	expect(Math.max(...jumps)).toBeLessThanOrEqual(24);
});

test('pinning does not change Preview pagination or printed sheets', async ({ page }) => {
	await openExample(page);
	await page.getByTestId('preview-open').click();
	const sheets = page.getByTestId('sheet');
	await expect(sheets.first()).toBeVisible();
	const count = await sheets.count();
	const content = await sheets.allTextContents();
	await page.keyboard.press('Escape');
	await page.getByTestId('gantt-pin').click();
	await page.getByTestId('preview-open').click();
	await expect(sheets).toHaveCount(count);
	await expect.poll(() => sheets.allTextContents()).toEqual(content);
	await expect(sheets.getByTestId('gantt-pin')).toHaveCount(0);
	await page.emulateMedia({ media: 'print' });
	await expect(sheets.first()).toBeVisible();
	await expect(page.getByTestId('timeline-panel')).toBeHidden();
	await expect(sheets).toHaveCount(count);
	await expect.poll(() => sheets.allTextContents()).toEqual(content);
});
