import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	GANTT_HEIGHT,
	defaultPanelHeight,
	expectPanelHeight,
	settledPanelHeight,
	expectStickyBelowHeader,
	expectExampleSheetLegends,
	focusPreviousControl,
	nextFrameHeight,
	openExample,
	openPreview,
	previewSheetSnapshot,
	row,
	shorter,
	startTimelineFrameMonitor,
	taller,
	writeStoredPlan
} from './helpers.js';

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
				const section = element.closest('[data-testid="stage"]')!;
				const header = section.querySelector(':scope > header')!.getBoundingClientRect();
				const columns = section.querySelector('thead')!.getBoundingClientRect();
				const columnCell = section.querySelector('thead th')!.getBoundingClientRect();
				return (
					element.getBoundingClientRect().top -
					Math.max(header.bottom, columns.bottom, columnCell.bottom)
				);
			})
		)
		.toBeGreaterThanOrEqual(-1);
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

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
	test(`the mobile pin stays accessible during chart panning and legend overflow (${reducedMotion})`, async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.emulateMedia({ reducedMotion });
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
		const monitor = await startTimelineFrameMonitor(page);
		await row(page, 'First harvest')
			.getByTestId('task-done')
			.evaluate((element) => {
				(element as HTMLElement).focus({ preventScroll: true });
			});
		const label = page.getByTestId('gantt-label').filter({ hasText: /^First harvest$/ });
		await expect(label).toBeInViewport({ ratio: 1 });
		await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollY);
		const frames = await monitor.finish();
		expect(frames.every((frame) => Math.abs(frame.scrollY - scrollY) <= 1)).toBe(true);
		// Both scroll containers must reveal the row without an overshoot and return.
		for (const key of ['bodyScroll', 'chartScroll'] as const) {
			const first = frames[0][key];
			const last = frames.at(-1)![key];
			expect(
				frames.every(
					(frame) =>
						frame[key] >= Math.min(first, last) - 1 && frame[key] <= Math.max(first, last) + 1
				)
			).toBe(true);
		}
		await expect
			.poll(() =>
				label.evaluate((element) => {
					const chart = document
						.querySelector('[data-testid="gantt-scroller"]')!
						.getBoundingClientRect();
					const body = document
						.querySelector('[data-testid="timeline-body"]')!
						.getBoundingClientRect();
					const bounds = element.getBoundingClientRect();
					return (
						bounds.top >= Math.max(chart.top, body.top) - 1 &&
						bounds.bottom <= Math.min(chart.bottom, body.bottom) + 1
					);
				})
			)
			.toBe(true);
		await expect(pin).toBeInViewport();
		await pin.click();
		await expect(pin).toHaveAttribute('aria-pressed', 'false');
	});
}

test('the full section resizes with a pointer', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await openExample(page);
	await page.getByTestId('gantt-pin').click();
	const panel = page.getByTestId('timeline-panel');
	await expectPanelHeight(page, defaultPanelHeight(page));
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
	// Drag resize must follow the pointer before release.
	expect(await nextFrameHeight(page)).toBeCloseTo(before.height + 30, 0);
	await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 45);
	expect(await nextFrameHeight(page)).toBeCloseTo(before.height + 45, 0);
	await page.mouse.up();
	expect(await nextFrameHeight(page)).toBeCloseTo(before.height + 45, 0);
});

type TimelineFrames = Awaited<
	ReturnType<Awaited<ReturnType<typeof startTimelineFrameMonitor>>['finish']>
>;

function expectHeightAnimation(frames: TimelineFrames) {
	const first = frames[0];
	const last = frames.at(-1)!;
	const min = Math.min(first.panel, last.panel);
	const max = Math.max(first.panel, last.panel);
	expect(max - min).toBeGreaterThan(80);
	expect(frames.some((frame) => frame.panel > min + 1 && frame.panel < max - 1)).toBe(true);
	const direction = Math.sign(last.panel - first.panel);
	const changes = frames.slice(1).map((frame, i) => {
		const previous = frames[i];
		const panelChange = frame.panel - previous.panel;
		expect(direction * panelChange).toBeGreaterThanOrEqual(-1);
		// ResizeObserver can update the slot after this frame's geometry read.
		expect(frame.slot).toBeGreaterThanOrEqual(Math.min(previous.panel, frame.panel) - 1);
		expect(frame.slot).toBeLessThanOrEqual(Math.max(previous.panel, frame.panel) + 1);
		expect(Math.abs(frame.slotTop - first.slotTop)).toBeLessThanOrEqual(1);
		expect(frame.top).toBeGreaterThanOrEqual(Math.min(first.top, last.top) - 1);
		expect(frame.top).toBeLessThanOrEqual(Math.max(first.top, last.top) + 1);
		return {
			panel: Math.abs(panelChange),
			content: Math.max(
				Math.abs(frame.chart - previous.chart - panelChange),
				Math.abs(frame.legend - previous.legend - panelChange)
			)
		};
	});
	// A keyword jump puts the entire change into one frame.
	expect(Math.max(...changes.map((change) => change.panel))).toBeLessThan((max - min) * 0.8);
	// Allow 20 px for the resize handle and 4 px for rounding.
	expect(Math.max(...changes.map((change) => change.content))).toBeLessThanOrEqual(24);
	expect(Math.abs(last.chart - first.chart)).toBeGreaterThan(80);
	expect(Math.abs(last.legend - first.legend)).toBeGreaterThan(80);
	expect(Math.abs(first.slot - first.panel)).toBeLessThanOrEqual(1);
	expect(Math.abs(last.slot - last.panel)).toBeLessThanOrEqual(1);
}

/**
 * Clicks at the element position. Locator clicks scroll the target out of the root scroll padding first.
 * That scroll would move the slot below the header, so the section would not become fixed.
 */
async function clickInPlace(page: Page, target: Locator) {
	const box = (await target.boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function checkPinAnimations(page: Page) {
	const pin = page.getByTestId('gantt-pin');
	const panel = page.getByTestId('timeline-panel');
	// The chart rows animate in after load. Start from the final natural height.
	await settledPanelHeight(page);
	// Start at a scroll position where the panel becomes fixed when pinned.
	await panel.evaluate((element) => {
		const header = document.querySelector('[data-app-header]')!.getBoundingClientRect();
		window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - header.bottom + 4);
	});
	const pinMonitor = await startTimelineFrameMonitor(page);
	await clickInPlace(page, pin);
	await expectPanelHeight(page, defaultPanelHeight(page));
	const pinFrames = await pinMonitor.finish();
	expect(pinFrames.some((frame) => frame.fixed)).toBe(true);
	expectHeightAnimation(pinFrames);
	const unpinMonitor = await startTimelineFrameMonitor(page);
	await clickInPlace(page, pin);
	await expect(pin).toHaveAttribute('aria-pressed', 'false');
	const unpinFrames = await unpinMonitor.finish();
	expect(unpinFrames.at(-1)!.fixed).toBe(false);
	expectHeightAnimation(unpinFrames);
}

test('unpinning moves the chart and legends with the section height', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await openExample(page);
	const pin = page.getByTestId('gantt-pin');
	const panel = page.getByTestId('timeline-panel');
	await pin.click();
	await expect(panel).toHaveAttribute('data-pinned', 'true');
	await expectPanelHeight(page, defaultPanelHeight(page));
	// Monitor the settled pinned section before unpinning, as in the original regression.
	const monitor = await startTimelineFrameMonitor(page);
	await pin.click();
	await expect(panel).not.toHaveAttribute('data-pinned');
	const frames = await monitor.finish();
	expect(frames[0].panel).toBeCloseTo(defaultPanelHeight(page), 0);
	expect(frames.at(-1)!.panel - frames[0].panel).toBeGreaterThan(80);
	expectHeightAnimation(frames);
});

test('pinning and unpinning animate without interpolate-size support', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await openExample(page);
	await page.addStyleTag({
		content: '[data-testid="timeline-panel"] { interpolate-size: numeric-only !important; }'
	});
	await checkPinAnimations(page);
	const panel = page.getByTestId('timeline-panel');
	const naturalHeight = (await panel.boundingBox())!.height;
	await page.getByTestId('timeline-legends-toggle').click();
	await expect
		.poll(async () => (await panel.boundingBox())!.height)
		.toBeLessThan(naturalHeight - 100);
	await page.getByTestId('timeline-legends-toggle').click();
	await expectPanelHeight(page, naturalHeight);
});

test('pinning does not change Preview pagination or printed sheets', async ({ page }) => {
	await openExample(page);
	await openPreview(page);
	const sheets = page.getByTestId('sheet');
	const before = await previewSheetSnapshot(page);
	await expectExampleSheetLegends(page);
	await page.emulateMedia({ media: 'print' });
	await expect.poll(() => previewSheetSnapshot(page)).toEqual(before);
	await expectExampleSheetLegends(page);
	await page.emulateMedia({ media: 'screen' });
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.getByTestId('gantt-pin').click();
	await expect(shorter(page)).toBeVisible();
	await expect(taller(page)).toBeVisible();
	await openPreview(page);
	await expect.poll(() => previewSheetSnapshot(page)).toEqual(before);
	await expectExampleSheetLegends(page);
	await expect(sheets.getByRole('button', { name: /Make timeline (shorter|taller)/ })).toHaveCount(
		0
	);
	await expect(sheets.getByTestId('gantt-pin')).toHaveCount(0);
	await page.emulateMedia({ media: 'print' });
	await expect(sheets.first()).toBeVisible();
	await expect(page.getByTestId('timeline-panel')).toBeHidden();
	await expect.poll(() => previewSheetSnapshot(page)).toEqual(before);
	await expectExampleSheetLegends(page);
	await expect(sheets.getByRole('button', { name: /Make timeline (shorter|taller)/ })).toHaveCount(
		0
	);
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
	test(`keyboard focus below the pinned Timeline section stays visible (${reducedMotion})`, async ({
		page
	}) => {
		await page.emulateMedia({ reducedMotion });
		await openExample(page);
		await page.getByTestId('gantt-pin').click();
		await expectPanelHeight(page, defaultPanelHeight(page));
		const panel = page.getByTestId('timeline-panel');
		await expectStickyBelowHeader(panel);
		const target = row(page, 'First harvest').getByTestId('task-done');
		await target.evaluate((element) => {
			const panel = document
				.querySelector('[data-testid="timeline-panel"]')!
				.getBoundingClientRect();
			const bounds = element.getBoundingClientRect();
			// Cover the target with the middle of the pinned section, away from its edges.
			window.scrollBy(0, bounds.top - (panel.top + panel.height / 2));
		});
		await expect
			.poll(() =>
				target.evaluate((element) => {
					const bounds = element.getBoundingClientRect();
					const panel = document
						.querySelector('[data-testid="timeline-panel"]')!
						.getBoundingClientRect();
					return bounds.top >= panel.top && bounds.bottom <= panel.bottom;
				})
			)
			.toBe(true);
		await focusPreviousControl(target);
		await page.keyboard.press('Tab');
		await expect(target).toBeFocused();
		await expect
			.poll(() =>
				target.evaluate((element) => {
					const bounds = element.getBoundingClientRect();
					const panel = document
						.querySelector('[data-testid="timeline-panel"]')!
						.getBoundingClientRect();
					return {
						belowPanel: bounds.top >= panel.bottom - 1,
						inViewport: bounds.bottom <= innerHeight
					};
				})
			)
			.toEqual({ belowPanel: true, inViewport: true });
	});

	test(`keyboard focus inside the pinned Timeline section stays usable (${reducedMotion})`, async ({
		page
	}) => {
		await page.emulateMedia({ reducedMotion });
		await openExample(page);
		await page.getByTestId('gantt-pin').click();
		await expectPanelHeight(page, defaultPanelHeight(page));
		await expectStickyBelowHeader(page.getByTestId('timeline-panel'));
		const controls = [
			page.getByTestId('gantt-pin'),
			page.getByTestId('timeline-legends-toggle'),
			page.getByTestId('milestone-legend').getByRole('button').first()
		];
		for (const control of controls) {
			await focusPreviousControl(control);
			await page.keyboard.press('Tab');
			await expect(control).toBeFocused();
			await expect
				.poll(() =>
					control.evaluate((element) => {
						const bounds = element.getBoundingClientRect();
						const panel = document
							.querySelector('[data-testid="timeline-panel"]')!
							.getBoundingClientRect();
						const header = document.querySelector('[data-app-header]')!.getBoundingClientRect();
						const hit = document.elementFromPoint(
							bounds.x + bounds.width / 2,
							bounds.y + bounds.height / 2
						);
						return (
							bounds.top >= Math.max(panel.top, header.bottom) - 1 &&
							bounds.bottom <= panel.bottom + 1 &&
							hit !== null &&
							element.contains(hit)
						);
					})
				)
				.toBe(true);
		}
	});
}

test('pin and resize height changes are immediate with reduced motion', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openExample(page);
	const pin = page.getByTestId('gantt-pin');
	const panel = page.getByTestId('timeline-panel');
	const viewport = page.viewportSize()!.height;
	// Wait until the example plan has rendered, so the natural height is final.
	const natural = await settledPanelHeight(page);
	const height = defaultPanelHeight(page);
	const monitor = await startTimelineFrameMonitor(page);
	await pin.click();
	await expect(panel).toHaveAttribute('data-pinned', 'true');
	await expectPanelHeight(page, height);
	const handle = page.getByTestId('gantt-resize');
	// The divider and its top margin can add to the natural height for one frame before the pinned height applies.
	const divider = await handle.evaluate(
		(element) =>
			element.getBoundingClientRect().height + parseFloat(getComputedStyle(element).marginTop)
	);
	await handle.press('ArrowDown');
	const resized = height + viewport * 0.02;
	await expect(handle).toHaveAttribute(
		'aria-valuenow',
		String(Math.round((resized / viewport) * 100))
	);
	await expectPanelHeight(page, resized);
	await pin.click();
	await expect(panel).not.toHaveAttribute('data-pinned');
	await expectPanelHeight(page, natural);
	// Reduced motion: no frame shows an interpolated height between the end states.
	const frames = await monitor.finish();
	const allowed = [natural, natural + divider, height, resized];
	const unexpected = frames
		.map((frame) => frame.panel)
		.filter((value) => !allowed.some((end) => Math.abs(value - end) <= 1));
	expect(unexpected).toEqual([]);
});

test('pinned resize buttons change height by ten percent and keep it after reload', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openExample(page);
	await page.getByTestId('gantt-pin').click();
	const start = defaultPanelHeight(page);
	const step = page.viewportSize()!.height * 0.1;
	await expectPanelHeight(page, start);
	await taller(page).click();
	await expectPanelHeight(page, start + step);
	await shorter(page).click();
	await expectPanelHeight(page, start);
	// Save a non-default value so reload cannot pass by restoring the default.
	await shorter(page).click();
	await expectPanelHeight(page, start - step);
	await page.reload();
	await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'true');
	await expectPanelHeight(page, start - step);
	await expect(taller(page)).toBeVisible();
	await expect(shorter(page)).toBeVisible();
});

// 667 px: the stored fraction times the viewport is not exactly the minimum.
for (const viewport of [900, 667, 220]) {
	test(`pinned resize buttons stop and disable at both height limits (${viewport}px)`, async ({
		page
	}) => {
		await page.setViewportSize({ width: 1280, height: viewport });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await openExample(page);
		await page.getByTestId('gantt-pin').click();
		await expect(shorter(page)).toBeVisible();
		await expect(taller(page)).toBeVisible();
		const max = viewport * GANTT_HEIGHT.max;
		const min = Math.min(GANTT_HEIGHT.minPx, max);
		const step = viewport * 0.1;
		let current = Math.min(max, Math.max(min, defaultPanelHeight(page)));
		for (let i = 0; i < 10 && current > min; i++) {
			await expect(shorter(page)).toBeEnabled();
			await shorter(page).click();
			current = Math.max(min, current - step);
			await expectPanelHeight(page, current);
		}
		await expectPanelHeight(page, min);
		await expect(shorter(page)).toBeDisabled();
		if (min === max) {
			await expect(taller(page)).toBeDisabled();
			return;
		}
		await expect(taller(page)).toBeEnabled();
		for (let i = 0; i < 10 && current < max; i++) {
			await taller(page).click();
			current = Math.min(max, current + step);
			await expectPanelHeight(page, current);
			await expect(shorter(page)).toBeEnabled();
		}
		await expectPanelHeight(page, max);
		await expect(taller(page)).toBeDisabled();
		await shorter(page).click();
		await expectPanelHeight(page, max - step);
		await expect(taller(page)).toBeEnabled();
	});
}

test('pinned resize buttons support Enter and Space', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openExample(page);
	await page.getByTestId('gantt-pin').click();
	const start = defaultPanelHeight(page);
	const step = page.viewportSize()!.height * 0.1;
	for (const button of [shorter(page), taller(page)]) {
		await expect(button).toBeVisible();
		const bounds = (await button.boundingBox())!;
		expect(bounds.width).toBeGreaterThanOrEqual(24);
		expect(bounds.height).toBeGreaterThanOrEqual(24);
		expect(await button.locator('svg').count()).toBeGreaterThan(0);
		for (const icon of await button.locator('svg').all()) {
			await expect(icon).toHaveAttribute('aria-hidden', 'true');
		}
	}
	for (const key of ['Enter', 'Space']) {
		await focusPreviousControl(taller(page));
		await page.keyboard.press('Tab');
		await expect(taller(page)).toBeFocused();
		await page.keyboard.press(key);
		await expectPanelHeight(page, start + step);
		await focusPreviousControl(shorter(page));
		await page.keyboard.press('Tab');
		await expect(shorter(page)).toBeFocused();
		await page.keyboard.press(key);
		await expectPanelHeight(page, start);
	}
});

for (const width of [1280, 390]) {
	for (const reducedMotion of ['reduce', 'no-preference'] as const) {
		test(`resize buttons appear only while pinned and keep Legends in position (${width}px, ${reducedMotion})`, async ({
			page
		}) => {
			await page.setViewportSize({ width, height: 900 });
			await page.emulateMedia({ reducedMotion });
			await openExample(page);
			const toggle = page.getByTestId('timeline-legends-toggle');
			const before = await toggle.evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				const panel = document
					.querySelector('[data-testid="timeline-panel"]')!
					.getBoundingClientRect();
				return { x: bounds.x, y: bounds.y - panel.top };
			});
			const monitor = await startTimelineFrameMonitor(page);
			await page.getByTestId('gantt-pin').click();
			if (reducedMotion === 'reduce') {
				await nextFrameHeight(page);
				expect(await shorter(page).count()).toBe(1);
				expect(await taller(page).count()).toBe(1);
			}
			await expect(shorter(page)).toBeVisible();
			await expect(taller(page)).toBeVisible();
			await expectPanelHeight(page, defaultPanelHeight(page));
			const appearing = await monitor.finish();
			const disappearingMonitor = await startTimelineFrameMonitor(page);
			await page.getByTestId('gantt-pin').click();
			if (reducedMotion === 'reduce') {
				await nextFrameHeight(page);
				expect(await shorter(page).count()).toBe(0);
				expect(await taller(page).count()).toBe(0);
			}
			await expect(shorter(page)).toHaveCount(0);
			await expect(taller(page)).toHaveCount(0);
			const disappearing = await disappearingMonitor.finish();
			const frames = [...appearing, ...disappearing];
			expect(
				frames.every(
					(frame) =>
						Math.abs(frame.legendsX - before.x) <= 1 && Math.abs(frame.legendsY - before.y) <= 1
				)
			).toBe(true);
			const hasButtonMotion = (samples: TimelineFrames) =>
				samples.some((frame) =>
					frame.buttons.some(
						(button) => button.animations > 0 || (button.opacity > 0 && button.opacity < 1)
					)
				);
			if (reducedMotion === 'no-preference') {
				expect(hasButtonMotion(appearing)).toBe(true);
				expect(hasButtonMotion(disappearing)).toBe(true);
			} else {
				expect(hasButtonMotion(frames)).toBe(false);
			}
		});
	}
}

test('resize buttons use the keyboard height transition', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await openExample(page);
	await page.getByTestId('gantt-pin').click();
	const start = defaultPanelHeight(page);
	const target = start + page.viewportSize()!.height * 0.1;
	await expectPanelHeight(page, start);
	const buttonMonitor = await startTimelineFrameMonitor(page);
	await taller(page).click();
	await expectPanelHeight(page, target);
	const buttonFrames = await buttonMonitor.finish();
	await shorter(page).click();
	await expectPanelHeight(page, start);
	const keyMonitor = await startTimelineFrameMonitor(page);
	await page.getByTestId('gantt-resize').press('PageDown');
	await expectPanelHeight(page, target);
	const keyFrames = await keyMonitor.finish();
	const transition = (frames: TimelineFrames) => {
		const intermediate = frames.filter(
			(frame) => frame.panel > start + 1 && frame.panel < target - 1
		);
		expect(intermediate.length).toBeGreaterThan(1);
		expect(frames.at(-1)!.panel).toBeCloseTo(target, 0);
		const midpoint = (intermediate[0].time + intermediate.at(-1)!.time) / 2;
		const middle = intermediate.reduce((nearest, frame) =>
			Math.abs(frame.time - midpoint) < Math.abs(nearest.time - midpoint) ? frame : nearest
		);
		return {
			duration: intermediate.at(-1)!.time - intermediate[0].time,
			progress: (middle.panel - start) / (target - start)
		};
	};
	const button = transition(buttonFrames);
	const key = transition(keyFrames);
	expect(Math.abs(button.duration - key.duration)).toBeLessThanOrEqual(50);
	expect(Math.abs(button.progress - key.progress)).toBeLessThanOrEqual(0.15);
});

test('a resize during the pin animation does not scroll the page', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await openExample(page);
	const naturalHeight = await settledPanelHeight(page);
	const pin = page.getByTestId('gantt-pin');
	const panel = page.getByTestId('timeline-panel');
	// Start at a scroll position where the panel becomes fixed when pinned.
	await panel.evaluate((element) => {
		const header = document.querySelector('[data-app-header]')!.getBoundingClientRect();
		window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - header.bottom + 4);
	});
	const monitor = await startTimelineFrameMonitor(page);
	await clickInPlace(page, pin);
	// Interrupt the running height transition with a replacement transition.
	await panel.evaluate(
		(element, start) =>
			new Promise<void>((resolve) => {
				const check = () => {
					const height = element.getBoundingClientRect().height;
					if (height < start - 1 && element.getAnimations().length > 0) resolve();
					else requestAnimationFrame(check);
				};
				check();
			}),
		naturalHeight
	);
	await page.getByTestId('gantt-resize').press('PageUp');
	const viewport = page.viewportSize()!.height;
	await expectPanelHeight(page, defaultPanelHeight(page) - viewport * 0.1);
	const frames = await monitor.finish();
	const after = frames.filter((frame) => frame.fixed);
	expect(after.length).toBeGreaterThan(0);
	expect(frames.at(-1)!.fixed).toBe(true);
	expect(Math.max(...frames.map((frame) => Math.abs(frame.scrollY - frames[0].scrollY)))).toBe(0);
});

test('unpinning a scrolled chart scrolls it back with the animation', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await openExample(page);
	await settledPanelHeight(page);
	const pin = page.getByTestId('gantt-pin');
	await pin.click();
	await expectPanelHeight(page, defaultPanelHeight(page));
	const scroller = page.getByTestId('gantt-scroller');
	await scroller.evaluate((element) => (element.scrollTop = element.scrollHeight));
	await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(40);
	const monitor = await startTimelineFrameMonitor(page);
	await pin.click();
	await expect(page.getByTestId('timeline-panel')).not.toHaveAttribute('data-pinned');
	const frames = await monitor.finish();
	const start = frames[0].chartScroll;
	expect(frames.at(-1)!.chartScroll).toBe(0);
	// A jump puts the full offset change into one frame.
	const drops = frames.slice(1).map((frame, i) => frames[i].chartScroll - frame.chartScroll);
	expect(Math.max(...drops)).toBeLessThan(start * 0.6);
});
