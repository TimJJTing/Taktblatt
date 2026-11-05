import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Read constants without loading Svelte state or its browser-build aliases in Playwright.
const viewerSource = readFileSync(
	new URL('../src/lib/state/viewer.svelte.ts', import.meta.url),
	'utf8'
);
const heightSource = viewerSource.match(/export const GANTT_HEIGHT\s*=\s*\{([^}]+)\}/)?.[1];
function heightConstant(name: string): number {
	const value = heightSource?.match(new RegExp(String.raw`\b${name}:\s*([\d.]+)`))?.[1];
	if (!value) throw new Error(`Missing GANTT_HEIGHT.${name}`);
	return Number(value);
}
export const GANTT_HEIGHT = {
	default: heightConstant('default'),
	max: heightConstant('max'),
	minPx: heightConstant('minPx')
};
const layoutSource = readFileSync(
	new URL('../src/lib/components/timeline/gantt-layout.ts', import.meta.url),
	'utf8'
);
const rowMotion = layoutSource.match(/export const ROW_MOTION_MS\s*=\s*(\d+)/)?.[1];
if (!rowMotion) throw new Error('Missing ROW_MOTION_MS');
const ROW_MOTION_MS = Number(rowMotion);

/** The default height of the whole pinned section, in pixels. */
export const defaultPanelHeight = (page: Page) =>
	page.viewportSize()!.height * GANTT_HEIGHT.default;

/** Waits until the Timeline panel height is the same in two polls, then returns it. */
export async function settledPanelHeight(page: Page): Promise<number> {
	const panel = page.getByTestId('timeline-panel');
	let height = 0;
	await expect
		.poll(async () => {
			const previous = height;
			height = await panel.evaluate(
				(element) =>
					new Promise<number>((resolve) =>
						requestAnimationFrame(() => resolve(element.getBoundingClientRect().height))
					)
			);
			return height > 0 && height === previous;
		})
		.toBe(true);
	return height;
}

/** Retries the panel height check until the transition finishes. */
export async function expectPanelHeight(page: Page, height: number): Promise<void> {
	await expect
		.poll(() =>
			page
				.getByTestId('timeline-panel')
				.evaluate((element) => element.getBoundingClientRect().height)
		)
		.toBeCloseTo(height, 0);
}

/** Reads the sheet count and content in the same browser snapshot. */
export async function previewSheetSnapshot(page: Page) {
	const sheets = page.getByTestId('sheet');
	await expect(sheets.first()).toBeVisible();
	return sheets.evaluateAll((elements) => ({
		count: elements.length,
		content: elements.map((element) => element.textContent)
	}));
}

/** Checks legend headings and entries in sheets, including print media. */
export async function expectExampleSheetLegends(page: Page): Promise<void> {
	const sheets = page.getByTestId('sheet');
	for (const [name, entry] of [
		['Stages', 'Prepare'],
		['Milestones', 'Beds ready'],
		['Bands', 'Frost risk']
	]) {
		await expect(sheets.getByText(name, { exact: true }).last()).toBeVisible();
		const list = sheets.getByRole('list', { name, exact: true });
		await expect(list).toBeVisible();
		await expect(list).toContainText(entry);
	}
}

/** Derives a settling window from the effective CSS and chart motion durations. */
export async function timelineMotionWindow(page: Page): Promise<number> {
	return page.getByTestId('timeline-panel').evaluate((panel, chartDuration) => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 100;
		const durations = [panel, ...panel.querySelectorAll('*')].flatMap((element) => {
			const style = getComputedStyle(element);
			return [style.transitionDuration, style.animationDuration].flatMap((value) =>
				value.split(',').map((part) => parseFloat(part) * (part.trim().endsWith('ms') ? 1 : 1000))
			);
		});
		return Math.max(chartDuration, ...durations.filter(Number.isFinite)) + 100;
	}, ROW_MOTION_MS);
}

/** Samples all related geometry in each animation frame until the interaction settles. */
export async function startTimelineFrameMonitor(page: Page) {
	const windowMs = await timelineMotionWindow(page);
	const monitor = await page.evaluateHandle(() => {
		const read = () => {
			const panel = document.querySelector<HTMLElement>('[data-testid="timeline-panel"]')!;
			const chart = panel.querySelector('[data-testid="gantt"]')!;
			const legend = panel.querySelector('[data-testid="stage-legend"]')!;
			const body = panel.querySelector<HTMLElement>('[data-testid="timeline-body"]')!;
			const scroller = panel.querySelector<HTMLElement>('[data-testid="gantt-scroller"]')!;
			const bounds = panel.getBoundingClientRect();
			const slot = panel.parentElement!.getBoundingClientRect();
			const toggle = panel
				.querySelector('[data-testid="timeline-legends-toggle"]')!
				.getBoundingClientRect();
			return {
				time: performance.now(),
				panel: bounds.height,
				top: bounds.top,
				chart: chart.getBoundingClientRect().height,
				legend: legend.getBoundingClientRect().top - bounds.top,
				slot: slot.height,
				slotTop: slot.top,
				fixed: getComputedStyle(panel).position === 'fixed',
				scrollY: window.scrollY,
				bodyScroll: body.scrollTop,
				chartScroll: scroller.scrollTop,
				legendsX: toggle.x,
				legendsY: toggle.y - bounds.top,
				buttons: [
					...panel.querySelectorAll<HTMLButtonElement>(
						'button[aria-label="Make timeline shorter"], button[aria-label="Make timeline taller"]'
					)
				].map((button) => ({
					opacity: Number(getComputedStyle(button).opacity),
					height: button.getBoundingClientRect().height,
					animations: (() => {
						let count = 0;
						for (
							let node: HTMLElement | null = button;
							node && node !== panel;
							node = node.parentElement
						) {
							count += node
								.getAnimations()
								.filter((animation) => animation.playState === 'running').length;
						}
						return count;
					})()
				}))
			};
		};
		const state = { frames: [read()], stopped: false, done: false, until: Infinity };
		const sample = () => {
			state.frames.push(read());
			if (!state.stopped || performance.now() < state.until) requestAnimationFrame(sample);
			else state.done = true;
		};
		requestAnimationFrame(sample);
		return state;
	});
	return {
		async finish() {
			const frames = await monitor.evaluate(async (state, duration) => {
				state.stopped = true;
				state.until = performance.now() + duration;
				while (!state.done) await new Promise(requestAnimationFrame);
				return state.frames;
			}, windowMs);
			await monitor.dispose();
			return frames;
		}
	};
}

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

/** Opens Settings and waits for its opening animation. */
export async function openSettings(page: Page): Promise<Locator> {
	const trigger = page.getByTestId('settings-menu');
	await expect(trigger).toBeVisible();
	await trigger.click();
	const menu = page.getByRole('menu');
	await expect(menu).toBeVisible();
	await menu.evaluate(async (element) => {
		await Promise.all(
			element.getAnimations({ subtree: true }).map((animation) => animation.finished)
		);
	});
	return menu;
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

/** Opens a select and waits for focus and its opening animation. */
export async function openSelect(page: Page, testId: string): Promise<Locator> {
	const trigger = page.getByTestId(testId);
	await trigger.click();
	await expect(trigger).toBeFocused();
	const listbox = page.getByRole('listbox');
	await expect(listbox).toBeVisible();
	await listbox.evaluate(async (element) => {
		await Promise.all(
			element.getAnimations({ subtree: true }).map((animation) => animation.finished)
		);
	});
	return listbox;
}

/** Checks that a decorative preview comes before the text name in the DOM. */
export async function expectPreviewBeforeName(
	container: Locator,
	selector: string,
	name: string
): Promise<void> {
	const preview = container.locator(selector);
	await expect(preview).toHaveCount(1);
	await expect(preview).toHaveAttribute('aria-hidden', 'true');
	await expect
		.poll(() =>
			container.evaluate(
				(element, { selector, name }) => {
					const preview = element.querySelector(selector)!;
					const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
					while (walker.nextNode()) {
						const text = walker.currentNode;
						if (text.textContent?.trim() === name) {
							return Boolean(
								preview.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING
							);
						}
					}
					return false;
				},
				{ selector, name }
			)
		)
		.toBe(true);
}

/** The same format as formatDate in src/lib/domain/format.ts for English. */
export const formatted = (date: string) =>
	new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${date}T00:00:00Z`));
