import { expect, test } from '@playwright/test';
import {
	expectStickyBelowHeader,
	expectStickyStageStack,
	openApp,
	openExample,
	stage,
	collapseTimeline,
	expandTimeline,
	expectTimelineCollapsed,
	openPreview,
	expectExampleSheetLegends
} from './helpers.ts';

test.describe('PWA', () => {
	test('the manifest is linked and describes the app', async ({ page, request }) => {
		await openApp(page);
		const href = await page.locator('link[rel="manifest"]').getAttribute('href');
		expect(href).toBeTruthy();
		const response = await request.get(new URL(href!, page.url()).href);
		expect(response.ok()).toBe(true);
		const manifest = await response.json();
		expect(manifest).toMatchObject({
			name: 'Taktblatt',
			start_url: '.',
			display: 'standalone'
		});
		expect(manifest.theme_color).toBeTruthy();
		const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
		expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
		expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(
			true
		);
		for (const icon of manifest.icons) {
			const png = await request.get(new URL(icon.src, response.url()).href);
			expect(png.ok()).toBe(true);
			expect(png.headers()['content-type']).toContain('image/png');
		}
	});

	test('the app loads offline after the first visit', async ({ page, context }) => {
		await openExample(page);
		await page.getByTestId('gantt-pin').click();
		await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
		// The worker takes control of the page after it activates.
		await expect
			.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
			.toBe(true);
		await context.setOffline(true);
		await page.reload();
		await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
		await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'true');
		await expectStickyBelowHeader(page.getByTestId('timeline-panel'));
		const panel = page.getByTestId('timeline-panel');
		const toggle = page.getByTestId('timeline-legends-toggle');
		const bands = panel.getByRole('list', { name: 'Bands', exact: true });
		await bands.scrollIntoViewIfNeeded();
		await expect(bands).toBeVisible();
		await expect(bands).toBeInViewport();
		await expect(bands).toContainText('Frost risk');
		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await page.reload();
		await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
		await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'true');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(page.getByTestId('timeline-legends')).toBeHidden();
		await toggle.click();
		await bands.scrollIntoViewIfNeeded();
		await expect(bands).toBeVisible();
		await expect(bands).toBeInViewport();
		await expect(bands).toContainText('Frost risk');
		await expectStickyStageStack(stage(page, 0));
		await context.setOffline(false);
	});
});

test('tabs Keep open, handle collapse and Preview work after an offline reload', async ({
	page,
	context
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openExample(page);
	const keep = page.getByTestId('timeline-keep-open');
	await keep.click();
	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);
	try {
		await context.setOffline(true);
		await page.reload();
		await expect(keep).toHaveAttribute('aria-pressed', 'true');
		await collapseTimeline(page);
		await page.reload();
		await expectTimelineCollapsed(page);
		await expandTimeline(page);
		await expect(keep).toHaveAttribute('aria-pressed', 'true');
		await openPreview(page);
		await expectExampleSheetLegends(page);
	} finally {
		await context.setOffline(false);
	}
});
