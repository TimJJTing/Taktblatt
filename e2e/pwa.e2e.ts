import { expect, test } from '@playwright/test';
import { expectStickyBelowHeader, openApp, openExample } from './helpers';

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
		await expect(page.getByTestId('timeline-panel').getByTestId('band-legend')).toBeAttached();
		await context.setOffline(false);
	});
});
