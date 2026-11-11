import { expect, test } from '@playwright/test';
import {
	addWorkspaceOverflow,
	dragSteps,
	dragThumb,
	expectTimelineCollapsed,
	isCoarse,
	openExample,
	openPlans,
	openPreview,
	overlayLayer,
	selectTab,
	timelineHandle,
	touchDrag,
	userScroll,
	waitForAnimations,
	workspaceContent
} from './helpers.ts';

test.describe('split view overlay scrollbars', () => {
	test.use({ viewport: { width: 1440, height: 900 } });
	test.beforeEach(async ({ page }) => {
		await openExample(page);
		await addWorkspaceOverflow(page);
	});

	test('hides the native bar and fades the overlay after wheel input stops', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		const pane = page.locator('#work-pane');
		await expect(pane).toHaveCSS('scrollbar-width', 'none');
		const layer = await overlayLayer(page, pane);
		await expect(layer).toHaveAttribute('data-visible', 'false');
		await userScroll(page, pane, 120);
		await expect.poll(() => pane.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
		await expect(layer).toHaveAttribute('data-visible', 'true');
		await expect
			.poll(() => layer.getAttribute('data-visible'), {
				timeout: 5000,
				intervals: [50]
			})
			.toBe('false');
		await expect
			.poll(() => layer.evaluate((element) => getComputedStyle(element).opacity), {
				timeout: 5000,
				intervals: [25]
			})
			.toBe('0');
	});

	test('maps thumb travel to pane scroll and keeps the position after release', async ({
		page
	}) => {
		const pane = page.locator('#work-pane');
		const layer = await overlayLayer(page, pane);
		await pane.hover({ position: { x: 30, y: 100 } });
		await expect(layer).toHaveAttribute('data-visible', 'true');
		const thumb = layer.locator('[data-overlay-thumb="y"]');
		await expect(layer.locator('[data-overlay-thumb="x"]')).toHaveCount(0);
		const size = (await thumb.boundingBox())!.height;
		const track = (await layer.boundingBox())!.height - 4;
		const before = await pane.evaluate((element) => ({
			position: element.scrollTop,
			range: element.scrollHeight - element.clientHeight
		}));
		const distance = Math.min(40, (track - size) / 4);
		expect(distance).toBeGreaterThan(0);
		const target = before.position + (distance * before.range) / (track - size);
		const expectTarget = async () => {
			await expect
				.poll(async () => Math.abs((await pane.evaluate((e) => e.scrollTop)) - target))
				.toBeLessThanOrEqual(3);
		};
		await dragThumb(page, thumb, distance, async () => {
			await expect(thumb).toHaveAttribute('data-active', 'true');
			await expectTarget();
		});
		await page.mouse.move(10, 10);
		await waitForAnimations(pane);
		await expectTarget();
	});

	test('keeps one layer per scroller when switching between split view and tabs', async ({
		page
	}) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		const content = workspaceContent(page);
		const workspace = page.locator('[data-workspace]');
		const nestedLayers = (await page.getByTestId('stage').count()) + 3;

		for (const width of [1440, 800, 1440]) {
			await page.setViewportSize({ width, height: 900 });
			const split = width >= 1024;
			await expect(content).toHaveAttribute('data-layout', split ? 'split' : 'tabs');
			if (!split) {
				const keepOpen = page.getByTestId('timeline-keep-open');
				if ((await keepOpen.getAttribute('aria-pressed')) !== 'true') await keepOpen.click();
			}
			await selectTab(page, 'Work plan');
			await waitForAnimations(workspace);
			await expect(workspace.locator('[data-overlay-scrollbar]')).toHaveCount(
				nestedLayers + (split ? 2 : 1)
			);
			await expect(content.locator(':scope > [data-overlay-scrollbar]')).toHaveCount(split ? 2 : 0);
			await expect(workspace.locator(':scope > [data-overlay-scrollbar]')).toHaveCount(
				split ? 0 : 1
			);

			const pane = split ? page.locator('#work-pane') : content;
			await pane.evaluate((element) => {
				element.scrollTop = 0;
			});
			await expect.poll(() => pane.evaluate((element) => element.scrollTop)).toBe(0);
			await userScroll(page, pane, 1);
			await expect.poll(() => pane.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
			const beforeDrag = await pane.evaluate((element) => element.scrollTop);
			const layer = await overlayLayer(page, pane);
			await expect(layer).toHaveAttribute('data-visible', 'true');
			await dragThumb(page, layer.locator('[data-overlay-thumb="y"]'), 40);
			await expect
				.poll(() => pane.evaluate((element) => element.scrollTop))
				.toBeGreaterThan(beforeDrag);
		}
	});

	test('pointer movement shows the Plan pane overlay without scrolling', async ({ page }) => {
		const pane = page.locator('#plan-pane');
		const layer = await overlayLayer(page, pane);
		await expect(layer).toHaveAttribute('data-visible', 'false');
		const before = await pane.evaluate((element) => element.scrollTop);
		await pane.hover({ position: { x: 30, y: 100 } });
		await expect(layer).toHaveAttribute('data-visible', 'true');
		expect(await pane.evaluate((element) => element.scrollTop)).toBe(before);
	});

	test('Preview sheets contain no overlay and print media hides every layer', async ({ page }) => {
		const preview = await openPreview(page);
		await expect(preview.getByTestId('sheet').locator('[data-overlay-scrollbar]')).toHaveCount(0);
		const layers = preview.locator('[data-overlay-scrollbar]');
		await expect(layers.first()).toBeAttached();
		await preview.hover();
		await expect(
			preview.locator('[data-overlay-scrollbar][data-visible="true"]').first()
		).toBeVisible();
		await page.emulateMedia({ media: 'print' });
		await expect(page.locator('[data-overlay-scrollbar]:visible')).toHaveCount(0);
	});

	test('reduced motion removes overlay transition durations', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		const pane = page.locator('#work-pane');
		const layer = await overlayLayer(page, pane);
		await pane.hover({ position: { x: 30, y: 100 } });
		await expect(layer).toHaveAttribute('data-visible', 'true');
		await expect
			.poll(() =>
				layer.evaluate((element) =>
					getComputedStyle(element)
						.transitionDuration.split(',')
						.every((duration) => parseFloat(duration) === 0)
				)
			)
			.toBe(true);
	});
});

test('a tab scroller thumb drag counts as user input and collapses the Timeline', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openExample(page);
	await addWorkspaceOverflow(page);
	await selectTab(page, 'Work plan');
	await expect(page.getByTestId('timeline-keep-open')).toHaveAttribute('aria-pressed', 'false');
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	const pane = workspaceContent(page);
	const layer = await overlayLayer(page, pane);
	await pane.hover({ position: { x: 30, y: 400 } });
	await expect(layer).toHaveAttribute('data-visible', 'true');
	await dragThumb(page, layer.locator('[data-overlay-thumb="y"]'), 60);
	await expect.poll(() => pane.evaluate((element) => element.scrollTop)).toBeGreaterThan(48);
	await expectTimelineCollapsed(page);
});

test.describe('bottom sheet overlay scrollbar', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
	test('a touch thumb drag scrolls Plans without moving or closing the sheet', async ({ page }) => {
		await openExample(page);
		expect(await isCoarse(page)).toBe(true);
		for (let i = 0; i < 12; i++) {
			const sheet = await openPlans(page);
			await sheet.getByTestId('plans-new').click();
			await expect(sheet).toHaveCount(0);
		}
		await page.setViewportSize({ width: 844, height: 390 });
		const sheet = await openPlans(page);
		const content = sheet.getByRole('list').locator('..');
		expect(
			await content.evaluate((element) => element.scrollHeight - element.clientHeight)
		).toBeGreaterThan(100);
		const layer = await overlayLayer(page, content);
		// An app scroll reveals the thumb before the touch press.
		await content.evaluate((element) => {
			element.scrollTop = 1;
		});
		await expect(layer).toHaveAttribute('data-visible', 'true');
		await content.evaluate((element) => {
			element.scrollTop = 0;
		});
		await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBe(0);
		const thumb = layer.locator('[data-overlay-thumb="y"]');
		const box = (await thumb.boundingBox())!;
		const sheetTop = (await sheet.boundingBox())!.y;
		const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		await touchDrag(
			page,
			start,
			dragSteps(start, 60),
			async () => {
				await expect(sheet).toBeVisible();
				expect((await sheet.boundingBox())!.y).toBeCloseTo(sheetTop, 0);
			},
			async () => {
				await expect(thumb).toHaveAttribute('data-active', 'true');
				await expect
					.poll(() => content.evaluate((element) => element.scrollTop))
					.toBeGreaterThan(20);
			}
		);
		await expect(sheet).toBeVisible();
		await waitForAnimations(sheet);
		expect((await sheet.boundingBox())!.y).toBeCloseTo(sheetTop, 0);
		expect(await content.evaluate((element) => element.scrollTop)).toBeGreaterThan(20);
	});
});
