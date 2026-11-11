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
function layoutConstant(name: string): number {
	const expression = layoutSource.match(new RegExp(`export const ${name}\\s*=\\s*([^;]+);`))?.[1];
	if (!expression) throw new Error(`Missing ${name}`);
	return expression.split('+').reduce(
		(sum, term) =>
			sum +
			term.split('*').reduce((product, factor) => {
				const value = factor.trim();
				return product * (/^\d+$/.test(value) ? Number(value) : layoutConstant(value));
			}, 1),
		0
	);
}
const motionSource = readFileSync(new URL('../src/lib/motion.ts', import.meta.url), 'utf8');
const geometryMotion = motionSource.match(/export const GEOMETRY_MOTION_MS\s*=\s*(\d+);/)?.[1];
if (!geometryMotion) throw new Error('Missing GEOMETRY_MOTION_MS');
const GEOMETRY_MOTION_MS = Number(geometryMotion);
export const MIN_CHART_HEIGHT = layoutConstant('MIN_CHART_HEIGHT');
export const COLLAPSED_TIMELINE_HEIGHT = layoutConstant('COLLAPSED_TIMELINE_HEIGHT');

/** The section height that the default ganttHeight gives, in pixels. See storedPanelHeight. */
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

/**
 * Returns the section height that ganttHeight gives. The expanded tabs section adds a top space
 * to this height. This value does not include that space. A collapsed section gives its collapsed
 * height.
 */
export async function storedPanelHeight(page: Page): Promise<number> {
	return page.getByTestId('timeline-panel').evaluate((element) => {
		const content = element.querySelector<HTMLElement>('#timeline-content')!;
		const space = content.inert ? 0 : parseFloat(getComputedStyle(content).paddingTop);
		return element.getBoundingClientRect().height - space;
	});
}

/** Retries the section height check until the transition finishes. See storedPanelHeight. */
export async function expectPanelHeight(page: Page, height: number): Promise<void> {
	await expect.poll(() => storedPanelHeight(page)).toBeCloseTo(height, 0);
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
	}, GEOMETRY_MOTION_MS);
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
			const slot = panel.closest('#timeline')!.getBoundingClientRect();
			const toggle = panel
				.querySelector(
					document.querySelector<HTMLElement>('[data-testid="workspace-content"]')!.dataset
						.layout === 'split'
						? '[data-testid="timeline-legends-toggle"]'
						: '[data-testid="timeline-keep-open"]'
				)!
				.getBoundingClientRect();
			return {
				time: performance.now(),
				panel: bounds.height,
				top: bounds.top,
				chart: chart.getBoundingClientRect().height,
				legend: legend.getBoundingClientRect().top - bounds.top,
				slot: slot.height,
				slotTop: slot.top,
				pinned: panel.hasAttribute('data-pinned'),
				scrollY: window.scrollY,
				paneScroll: (document.querySelector<HTMLElement>('[data-testid="workspace-content"]')!
					.dataset.layout === 'split'
					? document.querySelector<HTMLElement>('#plan-pane')!
					: document.querySelector<HTMLElement>('[data-testid="workspace-content"]')!
				).scrollTop,
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

/** Reloads the app with the specified UI language. */
export async function reloadInLocale(
	page: Page,
	locale: 'en' | 'de' | 'zh-TW' | 'ja'
): Promise<void> {
	await page.evaluate((language) => localStorage.setItem('taktblatt:locale', language), locale);
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('lang', locale);
	await expect(page.getByTestId('plan-heading')).toBeVisible();
}

/** Imports text or a JSON value through the app's file field. */
export async function importJson(page: Page, content: unknown, name = 'plan.json'): Promise<void> {
	await page.getByTestId('import-input').setInputFiles({
		name,
		mimeType: 'application/json',
		buffer: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content))
	});
}

/** Reads the saved viewer preferences. */
export const storedViewer = (page: Page) =>
	page.evaluate(() => JSON.parse(localStorage.getItem('taktblatt:ui')!));

/** Checks whether the primary pointer is coarse. */
export const isCoarse = (page: Page) =>
	page.evaluate(() => matchMedia('(pointer: coarse)').matches);

/** Opens a scope menu and waits for its presentation to settle. */
async function openScope(page: Page, scope: 'plans' | 'menu'): Promise<Locator> {
	await page.getByTestId(scope === 'plans' ? 'plan-switcher' : 'app-menu').click();
	const coarse = await isCoarse(page);
	const surface = coarse ? page.getByTestId(`${scope}-sheet`) : page.getByRole('menu');
	await expect(surface).toBeVisible();
	await waitForAnimations(surface);
	return surface;
}

/** Opens the This plan menu or sheet. */
export const openMenu = (page: Page) => openScope(page, 'menu');

/** Opens the Plans menu or sheet. */
export const openPlans = (page: Page) => openScope(page, 'plans');

/** Opens the language submenu for the current UI language. */
export async function openLanguageMenu(page: Page): Promise<Locator> {
	const menu = await openMenu(page);
	await menu.getByTestId('menu-language').click();
	const languages = page.getByRole('menu').filter({
		has: page.getByRole('menuitemradio', { name: 'English', exact: true })
	});
	await expect(languages).toBeVisible();
	await waitForAnimations(languages);
	return languages;
}

/** Chooses a UI language through the scope menu. */
export async function chooseLanguage(
	page: Page,
	name: 'English' | 'Deutsch' | '繁體中文' | '日本語'
) {
	if (await isCoarse(page)) {
		await openMenu(page);
		await chooseOption(page, 'menu-language', name);
	} else {
		const languages = await openLanguageMenu(page);
		await languages.getByRole('menuitemradio', { name, exact: true }).click();
	}
}

/** Chooses a theme. A sheet stays open after the choice. */
export async function chooseTheme(page: Page, name: 'Light' | 'Dark' | 'System') {
	const menu = await openMenu(page);
	const coarse = await isCoarse(page);
	await menu.getByRole(coarse ? 'radio' : 'menuitemradio', { name, exact: true }).click();
	if (!coarse) await expect(menu).toHaveCount(0);
}

export const timelineHandle = (page: Page) => page.locator('button#timeline-collapse');

export async function collapseTimeline(page: Page) {
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	await timelineHandle(page).click();
	await expectTimelineCollapsed(page);
}

export async function expandTimeline(page: Page) {
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'false');
	await timelineHandle(page).click();
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	await waitForAnimations(page.locator('#timeline'));
}

export async function expectTimelineCollapsed(page: Page) {
	await expect(timelineHandle(page)).toHaveAccessibleName('Expand timeline');
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'false');
	await waitForAnimations(page.locator('#timeline'));
	await expect
		.poll(async () => (await page.locator('#timeline').boundingBox())!.height)
		.toBeCloseTo(COLLAPSED_TIMELINE_HEIGHT, 0);
	await expect(page.getByTestId('gantt')).toBeHidden();
}

/** Scrolls a pane with real user input. It does not move the window. */
export async function userScroll(page: Page, pane: Locator, delta: number) {
	const box = (await pane.boundingBox())!;
	await page.mouse.move(box.x + box.width - 12, box.y + box.height - 24);
	await page.mouse.wheel(0, delta);
	await pane.evaluate(async () => {
		await new Promise(requestAnimationFrame);
		await new Promise(requestAnimationFrame);
	});
}

/** Returns evenly spaced points for a vertical drag. */
export function dragSteps(start: { x: number; y: number }, distance: number, count = 12) {
	return Array.from({ length: count }, (_, i) => ({
		x: start.x,
		y: start.y + (distance * (i + 1)) / count
	}));
}

/** Drags one finger with raw touch input. The callback runs before the finger lifts. */
export async function touchDrag(
	page: Page,
	start: { x: number; y: number },
	steps: { x: number; y: number }[],
	stepWait: number | (() => Promise<unknown>),
	beforeRelease?: () => Promise<void>,
	timestampIntervalMs?: number
) {
	const session = await page.context().newCDPSession(page);
	let released = false;
	// CDP timestamps use seconds since the Unix epoch. Keep the whole gesture in the past.
	let timestamp = Date.now() / 1000 - ((steps.length + 1) * (timestampIntervalMs ?? 0)) / 1000;
	const eventTimestamp = () => (timestampIntervalMs === undefined ? {} : { timestamp });
	try {
		await session.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [start],
			...eventTimestamp()
		});
		for (const point of steps) {
			if (typeof stepWait === 'number' && stepWait > 0) await page.waitForTimeout(stepWait);
			timestamp += (timestampIntervalMs ?? 0) / 1000;
			await session.send('Input.dispatchTouchEvent', {
				type: 'touchMove',
				touchPoints: [point],
				...eventTimestamp()
			});
			if (typeof stepWait === 'function') await stepWait();
		}
		await beforeRelease?.();
		timestamp += (timestampIntervalMs ?? 0) / 1000;
		await session.send('Input.dispatchTouchEvent', {
			type: 'touchEnd',
			touchPoints: [],
			...eventTimestamp()
		});
		released = true;
	} finally {
		if (!released)
			await session
				.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
				.catch(() => {});
		await session.detach();
	}
}

/**
 * Drags one finger upward over a pane with raw CDP touch events, so the pane scrolls down.
 * Chromium headless shell ignores touch input from Input.synthesizeScrollGesture.
 */
export async function touchScroll(page: Page, pane: Locator, distance: number, steps = 12) {
	const box = (await pane.boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + box.height - 100;
	await touchDrag(page, { x, y }, dragSteps({ x, y }, -distance, steps), () =>
		pane.evaluate(() => new Promise(requestAnimationFrame))
	);
}

/**
 * Opens a menu with the keyboard and waits for its opening animation.
 * Checks initial Print focus for the app menu.
 */
export async function openMenuWithKeyboard(
	page: Page,
	triggerId: 'app-menu' | 'plan-switcher' = 'app-menu'
): Promise<Locator> {
	const trigger = page.getByTestId(triggerId);
	await trigger.focus();
	await page.keyboard.press('Enter');
	const menu = page.getByRole('menu');
	await expect(menu).toBeVisible();
	await waitForAnimations(menu);
	if (triggerId === 'app-menu') await expect(menu.getByTestId('menu-print')).toBeFocused();
	return menu;
}

/** Waits until all finite animations of an element and its descendants finish. */
export async function waitForAnimations(locator: Locator): Promise<void> {
	await locator.evaluate(async (element) => {
		const animations = element
			.getAnimations({ subtree: true })
			.filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime));
		// A canceled or replaced transition rejects its promise. It is also complete.
		await Promise.allSettled(animations.map((animation) => animation.finished));
	});
}

/** Chooses Print in the app menu. This opens the print preview. */
export async function choosePrint(page: Page): Promise<void> {
	const menu = await openMenu(page);
	await menu.getByTestId('menu-print').click();
}

/** Opens the print preview and waits until the first sheet is visible. */
export async function openPreview(page: Page): Promise<Locator> {
	await choosePrint(page);
	const preview = page.getByRole('dialog', { name: 'Print preview' });
	await expect(preview).toBeVisible();
	await expect(preview.getByTestId('sheet').first()).toBeVisible();
	await page.evaluate(async () => {
		await document.fonts.ready;
		await new Promise(requestAnimationFrame);
	});
	await expect(preview.getByTestId('sheets')).toHaveAttribute('data-sheet-count', /^[1-9]\d*$/);
	return preview;
}

/** Sets the keyboard starting point without revealing the target. */
export async function focusPreviousControl(target: Locator): Promise<void> {
	await target.evaluate((element) => {
		const controls = [
			...document.querySelectorAll<HTMLElement>(
				'button, input, select, textarea, a[href], [tabindex]'
			)
		].filter(
			(control) =>
				control.tabIndex >= 0 &&
				!control.matches(':disabled') &&
				!control.closest('[inert]') &&
				control.getClientRects().length > 0
		);
		const previous = controls[controls.indexOf(element as HTMLElement) - 1];
		if (!previous) throw new Error('The target has no preceding keyboard control');
		previous.focus({ preventScroll: true });
	});
}

/** Reads the Timeline panel height in the next animation frame. */
export async function nextFrameHeight(page: Page): Promise<number> {
	return page.getByTestId('timeline-panel').evaluate(
		(element) =>
			new Promise<number>((resolve) => {
				requestAnimationFrame(() => resolve(element.getBoundingClientRect().height));
			})
	);
}

/** The button that makes the pinned Timeline shorter. */
export const shorter = (page: Page) =>
	page.getByRole('button', { name: 'Make timeline shorter', exact: true });

/** The button that makes the pinned Timeline taller. */
export const taller = (page: Page) =>
	page.getByRole('button', { name: 'Make timeline taller', exact: true });

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
	await expect(page.getByTestId('plan-heading')).toBeAttached();
}

/** Adds enough task rows and remarks to exercise both workspace scrollers. */
export async function addWorkspaceOverflow(page: Page): Promise<void> {
	await writeStoredPlan(page, (plan) => {
		const template = plan.tasks.find((task) => task.parentId === null);
		for (let i = 0; i < 36; i++) {
			plan.tasks.push({
				...template,
				id: `scroll-task-${i}`,
				title: `Scroll task ${i + 1}`,
				parentId: null,
				stageId: plan.stages[i < 24 ? 0 : plan.stages.length - 1].id,
				dependsOn: []
			});
		}
		plan.remarks.push({
			id: 'scroll-remarks',
			title: 'Scroll notes',
			bullets: Array.from({ length: 30 }, (_, i) => `Scroll note ${i + 1}`)
		});
	});
}

export const stage = (page: Page, index: number) => page.getByTestId('stage').nth(index);

export const workspaceContent = (page: Page) => page.getByTestId('workspace-content');
export const workspaceTabs = (page: Page) => page.getByTestId('workspace-tabs');

/** Samples workspace motion before input. Each frame contains all related geometry. */
export async function startWorkspaceFrameMonitor(page: Page) {
	const monitor = await page.evaluateHandle(() => {
		const read = () => {
			const content = document.querySelector<HTMLElement>('[data-testid="workspace-content"]')!;
			const bounds = (selector: string) => {
				const element = document.querySelector<HTMLElement>(selector)!;
				const box = element.getBoundingClientRect();
				return {
					x: box.x,
					y: box.y,
					width: box.width,
					opacity: Number(getComputedStyle(element).opacity),
					visible: element.getClientRects().length > 0
				};
			};
			return {
				left: bounds('#plan-pane'),
				right: bounds('#work-pane'),
				divider: bounds('[data-testid="split-resize"]'),
				indicator: bounds('[data-testid="workspace-tab-indicator"]'),
				selected: bounds('[role="tab"][aria-selected="true"]'),
				groups: ['#header', '#stage-overview', '#remarks', '#work-pane'].map(bounds),
				tab: content.dataset.tab,
				scroll: content.scrollTop,
				max: content.scrollHeight - content.clientHeight
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
			const frames = await monitor.evaluate(async (state) => {
				state.stopped = true;
				state.until = performance.now() + 400;
				while (!state.done) await new Promise(requestAnimationFrame);
				return state.frames;
			});
			await monitor.dispose();
			return frames;
		}
	};
}

/** Changes the active plan in a second browser tab without remounting the first. */
export async function changePlanInOtherTab(
	page: Page,
	change: (plan: StoredPlan) => void
): Promise<void> {
	const plan = await storedPlan(page);
	change(plan);
	const other = await page.context().newPage();
	try {
		await openApp(other);
		await other.evaluate((next) => {
			const index = JSON.parse(localStorage.getItem('taktblatt:index')!);
			const key = `taktblatt:plan:${index.activeId}`;
			const data = JSON.parse(localStorage.getItem(key)!);
			data.plan = next;
			localStorage.setItem(key, JSON.stringify(data));
		}, plan);
	} finally {
		await other.close();
	}
}

/** Waits for browser frames without changing focus or scroll position. */
export async function waitForFrames(page: Page, count = 6): Promise<void> {
	await page.evaluate(async (frames) => {
		for (let frame = 0; frame < frames; frame++) {
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		}
	}, count);
}

/** Sends a user scroll to the group, clear of the Timeline and floating tabs. */
export async function wheelWorkspace(page: Page, delta: number): Promise<void> {
	const content = workspaceContent(page);
	const bounds = (await content.boundingBox())!;
	const before = await content.evaluate((element) => element.scrollTop);
	await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
	await page.mouse.wheel(0, delta);
	await expect
		.poll(() =>
			content.evaluate((element, top) => Math.abs(element.scrollTop - top), before + delta)
		)
		.toBeLessThanOrEqual(1);
	await waitForFrames(page, 2);
}

/** Reads island and selected-tab sizes in the same frame. */
export async function workspaceTabSize(page: Page) {
	return workspaceTabs(page).evaluate((island) => {
		const tab = island.querySelector('[role="tab"][aria-selected="true"]')!;
		const icon = tab.querySelector('svg')!.getBoundingClientRect();
		return {
			island: island.getBoundingClientRect().height,
			tab: tab.getBoundingClientRect().height,
			iconWidth: icon.width,
			iconHeight: icon.height
		};
	});
}

export const planPane = (page: Page) => page.getByTestId('plan-pane');
export const workPane = (page: Page) => page.getByTestId('work-pane');

/** Selects a group when the workspace uses tabs. */
export async function selectTab(page: Page, name: 'Overview' | 'Work plan'): Promise<void> {
	if ((await workspaceContent(page).getAttribute('data-layout')) === 'tabs') {
		const tab = page.getByRole('tab', { name, exact: true });
		if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
		await expect(tab).toHaveAttribute('aria-selected', 'true');
		await waitForAnimations(workspaceContent(page));
	}
}

/** Returns the vertical scroller for the selected group. */
export async function groupScroller(page: Page, group: 'plan' | 'work-plan'): Promise<Locator> {
	return (await workspaceContent(page).getAttribute('data-layout')) === 'tabs'
		? workspaceContent(page)
		: group === 'plan'
			? planPane(page)
			: workPane(page);
}

/** Scrolls the Timeline to the top of its region and checks its sticky position. */
export async function expectStickyBelowHeader(band: Locator): Promise<void> {
	await band.evaluate((element) => {
		const content = document.querySelector<HTMLElement>('[data-testid="workspace-content"]')!;
		const scroller =
			content.dataset.layout === 'split'
				? document.querySelector<HTMLElement>('#plan-pane')!
				: content;
		scroller.scrollTop +=
			element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + 25;
	});
	await expect
		.poll(() =>
			band.evaluate((element) => {
				const content = document.querySelector<HTMLElement>('[data-testid="workspace-content"]')!;
				const scroller =
					content.dataset.layout === 'split' ? document.querySelector('#plan-pane')! : content;
				return Math.abs(element.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
			})
		)
		.toBeLessThanOrEqual(1);
}

/** Scrolls into a stage and checks its complete sticky header stack in one snapshot. */
export async function expectStickyStageStack(section: Locator): Promise<void> {
	await selectTab(section.page(), 'Work plan');
	await section.evaluate((element) => {
		const content = document.querySelector<HTMLElement>('[data-testid="workspace-content"]')!;
		const split = content.dataset.layout === 'split';
		const scroller = split ? document.querySelector<HTMLElement>('#work-pane')! : content;
		const panel = document.querySelector<HTMLElement>('[data-testid="timeline-panel"]')!;
		const pinned = !split ? panel.getBoundingClientRect().height : 0;
		scroller.scrollTop +=
			element.getBoundingClientRect().top - scroller.getBoundingClientRect().top - pinned + 60;
	});
	await expect
		.poll(() =>
			section.evaluate((element) => {
				const content = document.querySelector<HTMLElement>('[data-testid="workspace-content"]')!;
				const split = content.dataset.layout === 'split';
				const scroller = split ? document.querySelector('#work-pane')! : content;
				const panel = document.querySelector<HTMLElement>('[data-testid="timeline-panel"]')!;
				const top = !split
					? panel.getBoundingClientRect().bottom
					: scroller.getBoundingClientRect().top;
				const header = element.querySelector(':scope > header')!.getBoundingClientRect();
				const narrow = element.getBoundingClientRect().width < 640;
				const band = element
					.querySelector(narrow ? '[data-testid="stage-band"]' : 'thead th')!
					.getBoundingClientRect();
				return {
					headerAligned: Math.abs(header.top - top) <= 1,
					bandAligned: Math.abs(band.top - header.bottom) <= 1
				};
			})
		)
		.toEqual({ headerAligned: true, bandAligned: true });
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
	await waitForAnimations(listbox);
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

/** Opens a task status select and chooses its named option. */
export async function setTaskStatus(
	page: Page,
	container: Locator,
	status: 'todo' | 'in_progress' | 'done' | 'canceled'
): Promise<void> {
	const labels = { todo: 'Todo', in_progress: 'In progress', done: 'Done', canceled: 'Canceled' };
	const trigger = container.getByTestId('task-status');
	await trigger.click();
	const listbox = page.getByRole('listbox');
	await expect(listbox).toBeVisible();
	await waitForAnimations(listbox);
	await page.getByRole('option', { name: labels[status], exact: true }).click();
	await expect(listbox).toHaveCount(0);
	await expect(trigger).toBeFocused();
}

/** Selects Duplicate and reopens the same surface during its exit animation. */
export async function expectDuplicateOnceAfterReopen(page: Page): Promise<void> {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	const before = await planIds(page);
	const menu = await openMenu(page);
	await menu.evaluate(async (surface) => {
		const action = surface.querySelector<HTMLButtonElement>('[data-testid="menu-duplicate"]')!;
		action.click();
		// Let Svelte commit the close, but reopen before the exit animation ends.
		await new Promise(requestAnimationFrame);
		if (!surface.isConnected || surface.getAttribute('data-state') !== 'closed') {
			throw new Error('The menu must still be mounted in its closing state');
		}
		document.querySelector<HTMLButtonElement>('[data-testid="app-menu"]')!.click();
	});
	await expect(menu).toBeVisible();
	await expect(menu).toHaveAttribute('data-state', 'open');
	await waitForAnimations(menu);
	// Keep the reopened menu open while checking that the first action has finished.
	await expect.soft.poll(async () => (await planIds(page)).length).toBe(before.length + 1);
	const beforeDismissal = await planIds(page);
	await page.keyboard.press('Escape');
	await expect(menu).toHaveCount(0);
	await expect(page.getByTestId('app-menu')).toBeFocused();
	await expect.poll(() => planIds(page)).toEqual(beforeDismissal);
	expect(await planIds(page)).toHaveLength(before.length + 1);
}

/** The app font family. `document.fonts.check` also returns true for a family that no rule declares, so read the loaded faces. */
export const APP_FONT_FAMILY = 'Source Sans 3 Variable';

/** Returns true when a declared face of the app font has loaded. */
export async function appFontLoaded(page: Page): Promise<boolean> {
	return page.evaluate(async (family) => {
		await document.fonts.ready;
		await document.fonts.load(`12px "${family}"`);
		return [...document.fonts].some(
			(face) => face.family.replace(/"/g, '') === family && face.status === 'loaded'
		);
	}, APP_FONT_FAMILY);
}
