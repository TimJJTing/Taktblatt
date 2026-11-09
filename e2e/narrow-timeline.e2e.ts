import { expect, test, type Page } from '@playwright/test';
import {
	addWorkspaceOverflow,
	expectPanelHeight,
	openExample,
	selectTab,
	shorter,
	taller,
	waitForAnimations,
	workspaceContent
} from './helpers.ts';

const collapseButton = (page: Page) =>
	page.getByRole('button', { name: 'Collapse timeline', exact: true });
const expandButton = (page: Page) =>
	page.getByRole('button', { name: 'Expand timeline', exact: true });
const storedViewer = (page: Page) =>
	page.evaluate(() => JSON.parse(localStorage.getItem('taktblatt:ui')!));

async function dragDivider(page: Page, delta: number) {
	// A keyboard resize animates the height. Read the position after the animation.
	await waitForAnimations(page.getByTestId('timeline-panel'));
	const bounds = (await page.getByTestId('gantt-resize').boundingBox())!;
	// Use the edge so the pointer does not activate the chevron.
	await page.mouse.move(bounds.x + 4, bounds.y + bounds.height / 2);
	await page.mouse.down();
	await page.mouse.move(bounds.x + 4, bounds.y + bounds.height / 2 + delta, { steps: 8 });
	await page.mouse.up();
}

async function expectCollapsed(page: Page) {
	await expect(expandButton(page)).toHaveAttribute('aria-expanded', 'false');
	await expect(page.getByTestId('gantt-resize')).toHaveAttribute('aria-valuenow', '0');
	await expect(page.getByTestId('gantt-resize')).toHaveAttribute('aria-valuemin', '0');
	await waitForAnimations(page.locator('#timeline'));
	const contentId = await expandButton(page).getAttribute('aria-controls');
	expect(contentId).toBeTruthy();
	expect(
		await page.evaluate((id) => {
			const content = document.getElementById(id!);
			if (!content) return true;
			const controls = content.querySelectorAll<HTMLElement>(
				'button, input, select, textarea, a[href], [tabindex]'
			);
			for (const control of controls) {
				control.focus({ preventScroll: true });
				if (content.contains(document.activeElement)) return false;
			}
			return true;
		}, contentId)
	).toBe(true);
	await expect(page.locator('#timeline-title')).toBeHidden();
	await expect(page.getByTestId('gantt')).toBeHidden();
	for (const id of ['stage-legend', 'milestone-legend', 'band-legend']) {
		await expect(page.getByTestId(id)).toBeHidden();
	}
	await expect
		.poll(() =>
			page.locator('#timeline').evaluate((section) => {
				const divider = section
					.querySelector('[data-testid="gantt-resize"]')!
					.getBoundingClientRect();
				const bounds = section.getBoundingClientRect();
				return Math.abs(bounds.height - divider.height) <= 1;
			})
		)
		.toBe(true);
}

test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 800, height: 900 }
]) {
	test(`Timeline stays full width below the header through both tab scrolls at ${viewport.width}px`, async ({
		page
	}) => {
		await page.setViewportSize(viewport);
		await openExample(page);
		await addWorkspaceOverflow(page);
		await expect(page.getByTestId('gantt-pin')).toBeHidden();
		await expect(shorter(page)).toBeHidden();
		await expect(taller(page)).toBeHidden();
		for (const name of ['Overview', 'Work plan'] as const) {
			await selectTab(page, name);
			await expect(page.getByRole('region', { name: 'Timeline', exact: true })).toBeVisible();
			const samples = await workspaceContent(page).evaluate(async (content) => {
				const samples: { top: number; header: number; x: number; width: number }[] = [];
				for (const top of [0, 100, 250, 400]) {
					content.scrollTop = top;
					await new Promise(requestAnimationFrame);
					const timeline = document.querySelector('#timeline')!.getBoundingClientRect();
					const header = document.querySelector('[data-app-header]')!.getBoundingClientRect();
					samples.push({
						top: timeline.top,
						header: header.bottom,
						x: timeline.x,
						width: timeline.width
					});
				}
				return samples;
			});
			await expect.poll(() => workspaceContent(page).evaluate((e) => e.scrollTop)).toBe(400);
			expect(
				samples.every(
					(sample) =>
						Math.abs(sample.top - sample.header) <= 1 &&
						Math.abs(sample.x) <= 1 &&
						Math.abs(sample.width - viewport.width) <= 1
				)
			).toBe(true);
		}
		// A tab save must not turn the implicit pin into a stored preference.
		expect((await storedViewer(page)).ganttPinned).toBe(false);
		await page.setViewportSize({ width: 1280, height: 900 });
		await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'false');
	});
}

test('the divider has a separate round chevron with an accessible target and hint', async ({
	page
}) => {
	await openExample(page);
	const divider = page.getByTestId('gantt-resize');
	const button = collapseButton(page);
	await expect(divider).toHaveRole('separator');
	await expect(button).toHaveAttribute('aria-expanded', 'true');
	const contentId = await button.getAttribute('aria-controls');
	expect(contentId).toBeTruthy();
	await expect(page.locator(`[id="${contentId}"]`)).toBeVisible();
	const geometry = await button.evaluate((button) => {
		const divider = document.querySelector('[data-testid="gantt-resize"]')!;
		const target = button.getBoundingClientRect();
		const bounds = divider.getBoundingClientRect();
		return {
			siblings: button.parentElement === divider.parentElement,
			dividerHeight: bounds.height,
			width: target.width,
			height: target.height,
			center: Math.abs(target.x + target.width / 2 - bounds.x - bounds.width / 2),
			radius: parseFloat(getComputedStyle(button).borderTopLeftRadius)
		};
	});
	expect(geometry.siblings).toBe(true);
	expect(geometry.dividerHeight).toBeGreaterThanOrEqual(24);
	expect(geometry.width).toBeGreaterThanOrEqual(24);
	expect(geometry.height).toBeGreaterThanOrEqual(24);
	expect(geometry.center).toBeLessThanOrEqual(1);
	expect(geometry.radius).toBeGreaterThanOrEqual(Math.min(geometry.width, geometry.height) / 2);
	await button.hover();
	await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText('Collapse timeline');
	await button.click();
	await expectCollapsed(page);
	await expandButton(page).hover();
	await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText('Expand timeline');
});

test('collapse persists without changing height or the split pin preference', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await openExample(page);
	await page.getByTestId('gantt-pin').click();
	await page.getByTestId('gantt-resize').press('PageUp');
	const saved = await storedViewer(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await collapseButton(page).click();
	await expectCollapsed(page);
	expect(await storedViewer(page)).toMatchObject({
		timelineCollapsed: true,
		ganttHeight: saved.ganttHeight,
		ganttPinned: true
	});
	await page.reload();
	await expectCollapsed(page);
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(page.locator('#timeline-title')).toBeVisible();
	await expect(page.getByTestId('gantt')).toBeVisible();
	await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'true');
	await expectPanelHeight(page, saved.ganttHeight * 900);
	expect((await storedViewer(page)).timelineCollapsed).toBe(true);
	await page.setViewportSize({ width: 390, height: 844 });
	await expectCollapsed(page);
	await expandButton(page).click();
	await expectPanelHeight(page, saved.ganttHeight * 844);
	await page.reload();
	await expect(collapseButton(page)).toHaveAttribute('aria-expanded', 'true');
	expect(await storedViewer(page)).toMatchObject({
		timelineCollapsed: false,
		ganttHeight: saved.ganttHeight,
		ganttPinned: true
	});
});

test('separator keys toggle collapse and restore the stored height', async ({ page }) => {
	await openExample(page);
	const divider = page.getByTestId('gantt-resize');
	await divider.press('PageUp');
	const saved = await storedViewer(page);
	await divider.press('Enter');
	await expectCollapsed(page);
	for (const key of ['ArrowUp', 'PageUp', 'Home']) {
		await divider.press(key);
		await expectCollapsed(page);
		expect((await storedViewer(page)).ganttHeight).toBe(saved.ganttHeight);
	}
	for (const key of ['ArrowDown', 'PageDown', 'End', 'Enter']) {
		await divider.press(key);
		await expect(collapseButton(page)).toHaveAttribute('aria-expanded', 'true');
		await expectPanelHeight(page, saved.ganttHeight * 844);
		expect((await storedViewer(page)).ganttHeight).toBe(saved.ganttHeight);
		await divider.press('Enter');
		await expectCollapsed(page);
	}
});

test('drag collapse transfers content focus and drag expansion respects the minimum and maximum', async ({
	page
}) => {
	await openExample(page);
	await page.getByTestId('gantt-resize').press('PageUp');
	const saved = await storedViewer(page);
	const height = (await page.getByTestId('timeline-panel').boundingBox())!.height;
	const contentControl = page.getByTestId('timeline-legends-toggle');
	const controlHandle = await contentControl.elementHandle();
	await contentControl.focus();
	await expect(contentControl).toBeFocused();
	// Leave less than half the 120 px minimum.
	await dragDivider(page, 40 - height);
	await expectCollapsed(page);
	await expect(expandButton(page)).toBeFocused();
	expect((await storedViewer(page)).ganttHeight).toBe(saved.ganttHeight);
	await controlHandle!.evaluate((element) => (element as HTMLElement).focus());
	await controlHandle!.dispose();
	await expect(contentControl).not.toBeFocused();
	await expect(expandButton(page)).toBeFocused();
	await dragDivider(page, 20);
	await expect(collapseButton(page)).toHaveAttribute('aria-expanded', 'true');
	await expectPanelHeight(page, 120);
	// Above half the minimum, a short drag still clamps to the minimum.
	await dragDivider(page, -50);
	await expect(collapseButton(page)).toHaveAttribute('aria-expanded', 'true');
	await expectPanelHeight(page, 120);
	await dragDivider(page, 400);
	await expectPanelHeight(page, 844 * 0.4);
	await dragDivider(page, -10);
	await expectPanelHeight(page, 844 * 0.4 - 10);
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
	test(`collapse and expansion give the selected group space (${reducedMotion})`, async ({
		page
	}) => {
		await page.emulateMedia({ reducedMotion });
		await openExample(page);
		await selectTab(page, 'Work plan');
		await waitForAnimations(workspaceContent(page));
		const section = page.locator('#timeline');
		const expanded = (await section.boundingBox())!.height;
		const dividerHeight = (await page.getByTestId('gantt-resize').boundingBox())!.height;
		const workTop = (await page.locator('#work-plan').boundingBox())!.y;
		for (const collapse of [true, false]) {
			// Sample all frames. Hidden content can be removed from the DOM.
			const monitor = await section.evaluateHandle((element) => {
				const state = { heights: [element.getBoundingClientRect().height], stopped: false };
				const sample = () => {
					state.heights.push(element.getBoundingClientRect().height);
					if (!state.stopped) requestAnimationFrame(sample);
				};
				requestAnimationFrame(sample);
				return state;
			});
			await (collapse ? collapseButton(page) : expandButton(page)).click();
			await waitForAnimations(section);
			await expect
				.poll(async () => (await section.boundingBox())!.height)
				.toBeCloseTo(collapse ? dividerHeight : expanded, 0);
			const heights = await monitor.evaluate((state) => {
				state.stopped = true;
				return state.heights;
			});
			await monitor.dispose();
			const intermediate = heights.filter(
				(height) => height > dividerHeight + 1 && height < expanded - 1
			);
			if (reducedMotion === 'reduce') expect(intermediate).toEqual([]);
			else expect(intermediate.length).toBeGreaterThan(1);
			await expect
				.poll(async () => (await page.locator('#work-plan').boundingBox())!.y)
				.toBeCloseTo(collapse ? workTop - expanded + dividerHeight : workTop, 0);
		}
	});
}

test('narrowing to a saved collapsed Timeline moves focus from its content to the chevron', async ({
	page
}) => {
	await openExample(page);
	await collapseButton(page).click();
	await expectCollapsed(page);
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'split');
	await expect(expandButton(page)).toHaveCount(0);
	await waitForAnimations(page.getByTestId('timeline-panel'));
	const legends = page.getByTestId('timeline-legends-toggle');
	await legends.focus();
	await expect(legends).toBeFocused();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'tabs');
	await expectCollapsed(page);
	await expect(expandButton(page)).toBeFocused();
});

test('the legends start collapsed with tabs and keep a state separate from split view', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openExample(page);
	const toggle = page.getByTestId('timeline-legends-toggle');
	const legends = page.getByTestId('timeline-legends');
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(legends).toHaveAttribute('inert', '');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await page.reload();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	// Split view keeps its own state: expanded by default. A change there does not change tabs.
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'split');
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'tabs');
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	const stored = await storedViewer(page);
	expect(stored.narrowLegendsCollapsed).toBe(false);
	expect(stored.timelineLegendsCollapsed).toBe(true);
});

test('narrowing moves focus from a legend entry that the tabs state hides to the Legends button', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await openExample(page);
	const entry = page.getByTestId('milestone-legend').getByRole('button').first();
	await entry.focus();
	await expect(entry).toBeFocused();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'tabs');
	const toggle = page.getByTestId('timeline-legends-toggle');
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(toggle).toBeFocused();
});
