import { expect, test, type Page } from '@playwright/test';
import {
	addWorkspaceOverflow,
	COLLAPSED_TIMELINE_HEIGHT,
	storedViewer,
	expectPanelHeight,
	storedPanelHeight,
	openExample,
	selectTab,
	shorter,
	taller,
	waitForAnimations,
	workspaceContent,
	timelineHandle,
	collapseTimeline,
	expandTimeline,
	expectTimelineCollapsed,
	writeStoredPlan
} from './helpers.ts';

async function dragHandle(page: Page, delta: number) {
	// A keyboard resize animates the height. Read the position after the animation.
	await waitForAnimations(page.getByTestId('timeline-panel'));
	const bounds = (await timelineHandle(page).boundingBox())!;
	// Drag at the edge to check the full-width target.
	await page.mouse.move(bounds.x + 4, bounds.y + bounds.height / 2);
	await page.mouse.down();
	await page.mouse.move(bounds.x + 4, bounds.y + bounds.height / 2 + delta, { steps: 8 });
	await page.mouse.up();
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

test('the expanded Timeline heading has 16 pixels of space below the app header', async ({
	page
}) => {
	await openExample(page);
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'tabs');
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	await waitForAnimations(page.locator('#timeline'));
	await expect
		.poll(() =>
			page.getByTestId('timeline-keep-open').evaluate((toggle) => {
				const header = document.querySelector('[data-app-header]')!.getBoundingClientRect();
				return toggle.getBoundingClientRect().top - header.bottom;
			})
		)
		.toBeCloseTo(16, 0);
});

test('the full-width handle toggles with a name, state, description and decorative stage edge', async ({
	page
}) => {
	await openExample(page);
	const handle = timelineHandle(page);
	await expect(handle).toHaveAccessibleName('Collapse timeline');
	await expect(handle).toHaveAttribute('aria-expanded', 'true');
	await expect(handle).toHaveAccessibleDescription(/drag.*arrow keys/i);
	await expect(page.locator(`#${await handle.getAttribute('aria-controls')}`)).toBeVisible();
	const box = (await handle.boundingBox())!;
	expect(box.width).toBeCloseTo(390, 0);
	await handle.hover();
	await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText('Collapse timeline');
	await collapseTimeline(page);
	const edge = page.getByTestId('timeline-stage-edge');
	await expect(edge).toBeVisible();
	await expect(edge).toHaveAttribute('aria-hidden', 'true');
	expect((await edge.boundingBox())!.height).toBeCloseTo(4, 0);
	await expect(page.getByTestId('timeline-stage-segment')).toHaveCount(3);
	const tick = page.getByTestId('timeline-today-tick');
	await expect(tick).toBeVisible();
	expect((await tick.boundingBox())!.width).toBeCloseTo(2, 0);
	expect((await tick.boundingBox())!.height).toBeCloseTo(10, 0);
	for (const id of ['stage-legend', 'milestone-legend', 'band-legend'])
		await expect(page.getByTestId(id)).toBeHidden();
	const content = page.locator(`#${await handle.getAttribute('aria-controls')}`);
	if (await content.count()) {
		expect(
			await content.locator('button, input, select, textarea, [tabindex]').evaluateAll((controls) =>
				controls.every((control) => {
					(control as HTMLElement).focus({ preventScroll: true });
					return document.activeElement !== control;
				})
			)
		).toBe(true);
	}
	await expect(page.locator('#timeline-title')).toBeHidden();
	await expandTimeline(page);
	await expect(page.getByTestId('gantt')).toBeVisible();
});

test('collapse persists without changing height or the split pin preference', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await openExample(page);
	await page.getByTestId('gantt-pin').click();
	await page.getByTestId('gantt-resize').press('PageUp');
	const saved = await storedViewer(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await timelineHandle(page).click();
	await expectTimelineCollapsed(page);
	expect(await storedViewer(page)).toMatchObject({
		timelineCollapsed: true,
		ganttHeight: saved.ganttHeight,
		ganttPinned: true
	});
	await page.reload();
	await expectTimelineCollapsed(page);
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(page.locator('#timeline-title')).toBeVisible();
	await expect(page.getByTestId('gantt')).toBeVisible();
	await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'true');
	await expectPanelHeight(page, saved.ganttHeight * 900);
	expect((await storedViewer(page)).timelineCollapsed).toBe(true);
	await page.setViewportSize({ width: 390, height: 844 });
	await expectTimelineCollapsed(page);
	await timelineHandle(page).click();
	await expectPanelHeight(page, saved.ganttHeight * 844);
	await page.reload();
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	expect(await storedViewer(page)).toMatchObject({
		timelineCollapsed: false,
		ganttHeight: saved.ganttHeight,
		ganttPinned: true
	});
});

test('handle keys toggle collapse and restore the stored height', async ({ page }) => {
	await openExample(page);
	const handle = timelineHandle(page);
	await handle.press('Home');
	await expectPanelHeight(page, 120);
	await handle.press('ArrowDown');
	await expectPanelHeight(page, 120 + 844 * 0.02);
	await handle.press('ArrowUp');
	await expectPanelHeight(page, 120);
	await handle.press('PageDown');
	await expectPanelHeight(page, 120 + 844 * 0.1);
	await handle.press('End');
	await expectPanelHeight(page, 844 * 0.4);
	await handle.press('PageUp');
	const saved = await storedViewer(page);
	await handle.press('Enter');
	await expectTimelineCollapsed(page);
	for (const key of ['ArrowUp', 'PageUp', 'Home']) {
		await handle.press(key);
		await expectTimelineCollapsed(page);
		expect((await storedViewer(page)).ganttHeight).toBe(saved.ganttHeight);
	}
	for (const key of ['ArrowDown', 'PageDown', 'End', 'Enter', 'Space']) {
		await handle.press(key);
		await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
		await expectPanelHeight(page, saved.ganttHeight * 844);
		expect((await storedViewer(page)).ganttHeight).toBe(saved.ganttHeight);
		await handle.press('Enter');
		await expectTimelineCollapsed(page);
	}
});

test('drag collapse transfers content focus and drag expansion respects the minimum and maximum', async ({
	page
}) => {
	await openExample(page);
	await timelineHandle(page).press('PageUp');
	const saved = await storedViewer(page);
	const height = await storedPanelHeight(page);
	const contentControl = page.getByTestId('timeline-keep-open');
	const controlHandle = await contentControl.elementHandle();
	await contentControl.focus();
	await expect(contentControl).toBeFocused();
	// Leave less than half the 120 px minimum.
	await dragHandle(page, 40 - height);
	await expectTimelineCollapsed(page);
	await expect(timelineHandle(page)).toBeFocused();
	expect((await storedViewer(page)).ganttHeight).toBe(saved.ganttHeight);
	await controlHandle!.evaluate((element) => (element as HTMLElement).focus());
	await controlHandle!.dispose();
	await expect(contentControl).not.toBeFocused();
	await expect(timelineHandle(page)).toBeFocused();
	await dragHandle(page, 20);
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	await expectPanelHeight(page, 120);
	// Above half the minimum, a short drag still clamps to the minimum.
	await dragHandle(page, -50);
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	await expectPanelHeight(page, 120);
	await dragHandle(page, 400);
	await expectPanelHeight(page, 844 * 0.4);
	await dragHandle(page, -10);
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
		const collapsedHeight = COLLAPSED_TIMELINE_HEIGHT;
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
			await timelineHandle(page).click();
			await waitForAnimations(section);
			await expect
				.poll(async () => (await section.boundingBox())!.height)
				.toBeCloseTo(collapse ? collapsedHeight : expanded, 0);
			const heights = await monitor.evaluate((state) => {
				state.stopped = true;
				return state.heights;
			});
			await monitor.dispose();
			const intermediate = heights.filter(
				(height) => height > collapsedHeight + 1 && height < expanded - 1
			);
			if (reducedMotion === 'reduce') expect(intermediate).toEqual([]);
			else expect(intermediate.length).toBeGreaterThan(1);
			await expect
				.poll(async () => (await page.locator('#work-plan').boundingBox())!.y)
				.toBeCloseTo(collapse ? workTop - expanded + collapsedHeight : workTop, 0);
		}
	});
}

test('narrowing to a saved collapsed Timeline moves focus from its content to the handle', async ({
	page
}) => {
	await openExample(page);
	await timelineHandle(page).click();
	await expectTimelineCollapsed(page);
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'split');
	await expect(timelineHandle(page)).toHaveCount(0);
	await waitForAnimations(page.getByTestId('timeline-panel'));
	const legends = page.getByTestId('timeline-legends-toggle');
	await legends.focus();
	await expect(legends).toBeFocused();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'tabs');
	await expectTimelineCollapsed(page);
	await expect(timelineHandle(page)).toBeFocused();
});

test('tabs always show the legend rail and ignore the removed narrow legend preference', async ({
	page
}) => {
	await page.addInitScript(() =>
		localStorage.setItem('taktblatt:ui', JSON.stringify({ narrowLegendsCollapsed: true }))
	);
	await openExample(page);
	await expect(page.getByTestId('timeline-legends-toggle')).toHaveCount(0);
	for (const id of ['stage-legend', 'milestone-legend', 'band-legend'])
		await expect(page.getByTestId(id)).toBeVisible();
	await page.setViewportSize({ width: 1280, height: 900 });
	const toggle = page.getByTestId('timeline-legends-toggle');
	await toggle.click();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByTestId('milestone-legend')).toBeVisible();
	expect((await storedViewer(page)).timelineLegendsCollapsed).toBe(true);
});

test('narrowing moves focus from the removed Legends button to the handle', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await openExample(page);
	await page.getByTestId('timeline-legends-toggle').focus();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(timelineHandle(page)).toBeFocused();
});

test('a drag starts at four pixels and a return to its origin does not toggle', async ({
	page
}) => {
	await openExample(page);
	const handle = timelineHandle(page);
	await waitForAnimations(page.locator('#timeline'));
	const box = (await handle.boundingBox())!;
	const original = await storedPanelHeight(page);
	const x = box.x + 5,
		y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x, y + 3);
	await expectPanelHeight(page, original);
	await page.mouse.move(x, y - 20);
	await expectPanelHeight(page, original - 20);
	await page.mouse.move(x, y);
	await page.mouse.up();
	await expect(handle).toHaveAttribute('aria-expanded', 'true');
	await expectPanelHeight(page, original);
});

test('pointer cancellation keeps the current drag height without toggling', async ({ page }) => {
	await openExample(page);
	const box = (await timelineHandle(page).boundingBox())!;
	const height = await storedPanelHeight(page);
	await page.mouse.move(5, box.y + 10);
	await page.mouse.down();
	await page.mouse.move(5, box.y - 20);
	await timelineHandle(page).dispatchEvent('pointercancel', { pointerId: 1 });
	await page.mouse.move(5, box.y - 60);
	await page.mouse.up();
	await expectPanelHeight(page, height - 30);
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
});

test('handle hit regions include the upper reserve and the entire collapsed strip', async ({
	page
}) => {
	await openExample(page);
	for (const offset of [-11, 19]) {
		const box = (await timelineHandle(page).boundingBox())!;
		await page.mouse.click(5, box.y + offset);
		await expectTimelineCollapsed(page);
		const strip = (await page.locator('#timeline').boundingBox())!;
		await page.mouse.click(5, strip.y + (offset < 0 ? 1 : 23));
		await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	}
	await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.keyboard.press('Escape');
	await selectTab(page, 'Work plan');
	await page.getByTestId('task-title').first().click();
	await expect(page.getByTestId('task-title-input').first()).toBeVisible();
});

test('stage edge omits undated stages and an out-of-range today', async ({ page }) => {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		plan.range = { start: '2000-01-01', end: '2000-01-10' };
		for (const task of plan.tasks) {
			task.start = null;
			task.end = null;
		}
		const task = plan.tasks.find((task) => task.parentId === null)!;
		task.start = '1999-12-25';
		task.end = '2000-01-05';
	});
	await collapseTimeline(page);
	await expect(page.getByTestId('timeline-stage-segment')).toHaveCount(1);
	await expect(page.getByTestId('timeline-today-tick')).toHaveCount(0);
	const geometry = await page.getByTestId('timeline-stage-segment').evaluate((segment) => {
		const edge = document
			.querySelector('[data-testid="timeline-stage-edge"]')!
			.getBoundingClientRect();
		const box = segment.getBoundingClientRect();
		return { left: box.left - edge.left, fraction: box.width / edge.width };
	});
	expect(geometry.left).toBeCloseTo(0, 0);
	expect(geometry.fraction).toBeCloseTo(0.5, 2);
});

test('lost pointer capture ends a drag at its current height', async ({ page }) => {
	await openExample(page);
	const handle = timelineHandle(page);
	const box = (await handle.boundingBox())!;
	const height = await storedPanelHeight(page);
	await page.mouse.move(5, box.y + 10);
	await page.mouse.down();
	await page.mouse.move(5, box.y - 20);
	await handle.evaluate((element) => {
		if (element.hasPointerCapture(1)) element.releasePointerCapture(1);
	});
	await page.mouse.move(5, box.y - 60);
	await page.mouse.up();
	await expectPanelHeight(page, height - 30);
	await expect(handle).toHaveAttribute('aria-expanded', 'true');
});

test('a second Timeline pointer cannot replace or end the first drag', async ({ page }) => {
	await openExample(page);
	await waitForAnimations(page.getByTestId('timeline-panel'));
	const handle = timelineHandle(page);
	const box = (await handle.boundingBox())!;
	const original = await storedPanelHeight(page);
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
	const first = { id: 1, x: 30, y: box.y + box.height / 2 };
	const second = { id: 2, x: 100, y: first.y + 16 };
	try {
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [{ ...first, y: first.y + 10 }]
		});
		await expectPanelHeight(page, original + 10);
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [{ ...first, y: first.y + 10 }, second]
		});
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [{ ...first, y: first.y + 20 }, second]
		});
		await expect.soft.poll(() => storedPanelHeight(page)).toBeCloseTo(original + 20, 0);
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [
				{ ...first, y: first.y + 20 },
				{ ...second, y: second.y + 10 }
			]
		});
		await expect.soft.poll(() => storedPanelHeight(page)).toBeCloseTo(original + 20, 0);
		// CDP releases a touch point that is absent from the next event. touchEnd releases all points.
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [{ ...first, y: first.y + 20 }]
		});
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [{ ...first, y: first.y + 30 }]
		});
		await expect.soft.poll(() => storedPanelHeight(page)).toBeCloseTo(original + 30, 0);
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await expect(handle).toHaveAttribute('aria-expanded', 'true');
	} finally {
		// The touch sequence can already be complete. Then CDP rejects the cancel.
		await cdp
			.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
			.catch(() => {});
		await cdp.detach();
	}
});
