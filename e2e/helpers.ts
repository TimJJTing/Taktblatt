import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the app and waits until the SPA has mounted. */
export async function openApp(page: Page): Promise<void> {
	await page.goto('/');
	await expect(page.getByTestId('plan-heading')).toBeVisible();
}

/** Opens the app with the example plan. */
export async function openExample(page: Page): Promise<void> {
	await openApp(page);
	await page.getByRole('button', { name: 'Load example' }).click();
	await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
}

/** Reads the active plan from localStorage. */
export async function storedPlan(page: Page) {
	return page.evaluate(() => {
		const index = JSON.parse(localStorage.getItem('taktblatt:index')!);
		return JSON.parse(localStorage.getItem(`taktblatt:plan:${index.activeId}`)!).plan;
	});
}

/** The ids of all stored plans, in list order. */
export const planIds = (page: Page) =>
	page.evaluate(() => JSON.parse(localStorage.getItem('taktblatt:index')!).planIds as string[]);

type StoredPlan = Awaited<ReturnType<typeof storedPlan>>;

/** Reads the contrast of a dependency stroke against its chart background. */
export async function dependencyContrast(line: Locator, paper = false): Promise<number> {
	return line.evaluate((element, onPaper) => {
		const style = getComputedStyle(element);
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const context = canvas.getContext('2d')!;
		const luminance = () => {
			const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
				const channel = value / 255;
				return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
			});
			return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
		};
		context.fillStyle = style.getPropertyValue(onPaper ? '--color-paper' : '--background');
		context.fillRect(0, 0, 1, 1);
		const background = luminance();
		context.globalAlpha = Number(style.opacity);
		context.fillStyle = style.stroke;
		context.fillRect(0, 0, 1, 1);
		const stroke = luminance();
		return (Math.max(background, stroke) + 0.05) / (Math.min(background, stroke) + 0.05);
	}, paper);
}

/**
 * Checks that a dependency arrow fades with its line.
 * The arrow must be the end marker of the line, so the line opacity applies to it.
 * The marker and its path must not set their own opacity.
 */
export async function dependencyArrowFades(line: Locator): Promise<boolean> {
	return line.evaluate((element) => {
		const markerId = getComputedStyle(element).markerEnd.match(/#([^")]+)/)?.[1];
		const marker = markerId ? document.getElementById(markerId) : null;
		const arrow = marker?.querySelector('path');
		if (!(marker instanceof SVGMarkerElement) || !arrow) return false;
		return [marker, arrow].every((node) => {
			const style = getComputedStyle(node);
			return Number(style.opacity) === 1 && Number(style.fillOpacity) === 1;
		});
	});
}

/** Changes the stored plan in localStorage, then reloads the app. */
export async function writeStoredPlan(
	page: Page,
	change: (plan: StoredPlan) => void
): Promise<void> {
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

export const stage = (page: Page, index: number) => page.getByTestId('stage').nth(index);

/** Scrolls a sticky band below the app header and checks their current positions together. */
export async function expectStickyBelowHeader(band: Locator): Promise<void> {
	await band.evaluate((element) => {
		const header = document.querySelector('[data-app-header]')!.getBoundingClientRect();
		// Put the natural place of the band 25 px above the bottom of the app header.
		window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - header.bottom + 25);
	});
	await expect
		.poll(() =>
			band.evaluate((element) => {
				const header = document.querySelector('[data-app-header]')!.getBoundingClientRect();
				return Math.abs(element.getBoundingClientRect().top - header.bottom);
			})
		)
		.toBeLessThanOrEqual(1);
}

/** Finds a row by the exact text of its title cell. */
export const row = (page: Page, title: string) =>
	page.getByTestId('task-row').filter({
		has: page.getByTestId('task-title').and(page.getByText(title, { exact: true }))
	});

/** The task titles of a stage, in display order. */
export const titles = (page: Page, stageIndex: number) =>
	stage(page, stageIndex).getByTestId('task-title');

/** Opens a select by its test id and picks the option with the exact name. */
export async function chooseOption(page: Page, testId: string, name: string): Promise<void> {
	await page.getByTestId(testId).click();
	await page.getByRole('option', { name, exact: true }).click();
}

/** The same format as formatDate in src/lib/domain/format.ts for English. */
export const formatted = (date: string) =>
	new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${date}T00:00:00Z`));
