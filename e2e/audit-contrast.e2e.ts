import { expect, test } from '@playwright/test';
import { openApp } from './helpers.ts';

test('empty objective placeholder has sufficient contrast in both themes', async ({ page }) => {
	await openApp(page);
	const placeholder = page.getByText('Add an objective', { exact: true });
	for (const theme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: theme });
		await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
		const contrast = await placeholder.evaluate((element) => {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 1;
			const ctx = canvas.getContext('2d')!;
			const sample = (color: string, background?: number[]) => {
				ctx.clearRect(0, 0, 1, 1);
				if (background) {
					ctx.fillStyle = `rgb(${background.join(' ')})`;
					ctx.fillRect(0, 0, 1, 1);
				}
				ctx.fillStyle = color;
				ctx.fillRect(0, 0, 1, 1);
				return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
			};
			let parent: Element | null = element;
			while (parent && getComputedStyle(parent).backgroundColor === 'rgba(0, 0, 0, 0)')
				parent = parent.parentElement;
			const background = sample(getComputedStyle(parent!).backgroundColor);
			const foreground = sample(getComputedStyle(element).color, background);
			const luminance = (rgb: number[]) =>
				rgb
					.map((value) => {
						const channel = value / 255;
						return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
					})
					.reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
			const a = luminance(foreground);
			const b = luminance(background);
			return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
		});
		expect(contrast, `${theme} placeholder contrast`).toBeGreaterThanOrEqual(4.5);
	}
});
