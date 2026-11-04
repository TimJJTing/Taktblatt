/**
 * Makes the PNG icons of the web app from the SVG files in static/icons.
 * Run it with `node scripts/make-icons.mjs` after a change to an SVG file.
 * It uses the Chromium of Playwright, so it needs no extra package.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const dir = new URL('../static/icons/', import.meta.url);
const jobs = [
	{ from: 'icon.svg', to: 'icon-192.png', size: 192 },
	{ from: 'icon.svg', to: 'icon-512.png', size: 512 },
	{ from: 'icon.svg', to: 'apple-touch-icon.png', size: 180, opaque: true },
	{ from: 'icon-maskable.svg', to: 'icon-maskable-512.png', size: 512 }
];

const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	for (const { from, to, size, opaque } of jobs) {
		let svg = await readFile(new URL(from, dir), 'utf8');
		// iOS rounds the corners itself and shows transparent pixels black. So draw them full-bleed.
		if (opaque) svg = svg.replace(/ rx="112"/, '');
		await page.setViewportSize({ width: size, height: size });
		await page.setContent(
			`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
		);
		await writeFile(new URL(to, dir), await page.screenshot({ omitBackground: !opaque }));
	}
} finally {
	await browser.close();
}
