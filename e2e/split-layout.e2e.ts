import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	addWorkspaceOverflow,
	expectJumpTarget,
	expectStickyBelowHeader,
	expectStickyStageStack,
	openExample,
	openPreview,
	planPane,
	row,
	selectTab,
	stage,
	waitForAnimations,
	waitForFrames,
	wheelWorkspace,
	workPane,
	workspaceContent,
	workspaceTabs,
	workspaceTabSize,
	storedPanelHeight
} from './helpers.ts';

test.beforeEach(async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 1280, height: 900 });
});

async function scrollTo(scroller: Locator, top: number) {
	await scroller.evaluate((element, value) => (element.scrollTop = value), top);
	await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeCloseTo(top, 0);
}

async function expectPaneWidths(page: Page, leftPercent: number) {
	await expect
		.poll(() =>
			workspaceContent(page).evaluate((content, ratio) => {
				const left = content.querySelector('#plan-pane')!.getBoundingClientRect();
				const right = content.querySelector('#work-pane')!.getBoundingClientRect();
				return {
					left: Math.abs((left.width / (left.width + right.width)) * 100 - ratio) <= 1,
					minimums: left.width >= 359 && right.width >= 359
				};
			}, leftPercent)
		)
		.toEqual({ left: true, minimums: true });
}

test('split groups keep their order and scroll independently without document scrolling', async ({
	page
}) => {
	await openExample(page);
	await addWorkspaceOverflow(page);
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'split');
	await expect(planPane(page)).toBeVisible();
	await expect(workPane(page)).toBeVisible();
	expect(
		await planPane(page)
			.locator('#header, #timeline, #stage-overview, #remarks')
			.evaluateAll((sections) => sections.map((section) => section.id))
	).toEqual(['header', 'timeline', 'stage-overview', 'remarks']);
	await expect(workPane(page).locator('#work-plan')).toBeVisible();
	await expect
		.poll(() =>
			workspaceContent(page).evaluate((content) => {
				const left = content.querySelector('#plan-pane')!.getBoundingClientRect();
				const right = content.querySelector('#work-pane')!.getBoundingClientRect();
				const root = document.scrollingElement!;
				return {
					sideBySide: left.right <= right.left && Math.abs(left.top - right.top) <= 1,
					documentFits: root.scrollHeight <= root.clientHeight
				};
			})
		)
		.toEqual({ sideBySide: true, documentFits: true });
	await scrollTo(workPane(page), 150);
	expect(await planPane(page).evaluate((element) => element.scrollTop)).toBe(0);
	await scrollTo(planPane(page), 150);
	expect(await workPane(page).evaluate((element) => element.scrollTop)).toBe(150);
	await scrollTo(workPane(page), 250);
	expect(await planPane(page).evaluate((element) => element.scrollTop)).toBe(150);
	expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('the separator supports keyboard steps, limits, reset, pointer drag and persistence', async ({
	page
}) => {
	await openExample(page);
	const separator = page.getByTestId('split-resize');
	await expect(separator).toHaveRole('separator');
	await expect(separator).toHaveAccessibleName('Resize panes');
	await expect(separator).toHaveAttribute('aria-orientation', 'vertical');
	expect((await separator.boundingBox())!.width).toBeGreaterThanOrEqual(12);
	await expect(separator).toHaveAttribute('aria-valuenow', '50');
	for (const [key, value] of [
		['ArrowLeft', 48],
		['ArrowRight', 50],
		['PageUp', 40],
		['PageDown', 50]
	] as const) {
		await separator.press(key);
		await expect(separator).toHaveAttribute('aria-valuenow', String(value));
		await expectPaneWidths(page, value);
	}
	for (const [key, limit, pane] of [
		['Home', 'aria-valuemin', planPane(page)],
		['End', 'aria-valuemax', workPane(page)]
	] as const) {
		await separator.press(key);
		await expect(separator).toHaveAttribute(
			'aria-valuenow',
			(await separator.getAttribute(limit))!
		);
		await expect.poll(async () => (await pane.boundingBox())!.width).toBeCloseTo(360, 0);
	}
	await separator.dblclick();
	await expect(separator).toHaveAttribute('aria-valuenow', '50');
	await expectPaneWidths(page, 50);
	const handle = (await separator.boundingBox())!;
	await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
	await page.mouse.down();
	await page.mouse.move(handle.x + handle.width / 2 + 100, handle.y + handle.height / 2);
	await expect
		.poll(async () => Number(await separator.getAttribute('aria-valuenow')))
		.toBeGreaterThan(55);
	const draggedWidth = (await planPane(page).boundingBox())!.width;
	expect(draggedWidth).toBeGreaterThan(700);
	await page.mouse.move(0, handle.y + handle.height / 2);
	await expect.poll(async () => (await planPane(page).boundingBox())!.width).toBeCloseTo(360, 0);
	await page.mouse.move(1279, handle.y + handle.height / 2);
	await expect.poll(async () => (await workPane(page).boundingBox())!.width).toBeCloseTo(360, 0);
	await page.mouse.up();
	await separator.dblclick();
	await separator.press('PageDown');
	await expectPaneWidths(page, 60);
	await page.reload();
	await expect(separator).toHaveAttribute('aria-valuenow', '60');
	await expectPaneWidths(page, 60);
});

test('a viewport clamp preserves the preferred ratio for a wider screen', async ({ page }) => {
	await page.setViewportSize({ width: 1600, height: 900 });
	await openExample(page);
	const separator = page.getByTestId('split-resize');
	await separator.press('PageDown');
	await separator.press('PageDown');
	await expectPaneWidths(page, 70);
	await page.setViewportSize({ width: 1024, height: 900 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'split');
	await expect.poll(async () => (await workPane(page).boundingBox())!.width).toBeCloseTo(360, 0);
	await page.reload();
	await page.setViewportSize({ width: 1600, height: 900 });
	await expectPaneWidths(page, 70);
	await expect(separator).toHaveAttribute('aria-valuenow', '70');
});

for (const viewport of [
	{ width: 800, height: 900 },
	{ width: 390, height: 844 }
]) {
	test(`tabs expose linked panels and automatic keyboard activation at ${viewport.width}px`, async ({
		page
	}) => {
		await page.setViewportSize(viewport);
		await openExample(page);
		await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'tabs');
		await expect(page.getByTestId('split-resize')).toBeHidden();
		const tabs = page.getByRole('tablist', { name: 'Workspace view' });
		await expect(tabs).toBeVisible();
		await expect(page.locator('[data-app-header]').getByRole('tablist')).toHaveCount(0);
		await expect(tabs.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute(
			'id',
			'workspace-tab-plan'
		);
		await expect(tabs.getByRole('tab', { name: 'Work plan', exact: true })).toHaveAttribute(
			'id',
			'workspace-tab-work-plan'
		);
		for (const tab of await tabs.getByRole('tab').all()) {
			const bounds = (await tab.boundingBox())!;
			expect(bounds.width).toBeGreaterThanOrEqual(44);
			expect(bounds.height).toBeGreaterThanOrEqual(40);
		}

		const plan = tabs.getByRole('tab', { name: 'Overview', exact: true });
		const work = tabs.getByRole('tab', { name: 'Work plan', exact: true });
		await expect(plan).toHaveAttribute('aria-selected', 'true');
		await expect(plan).toHaveAttribute('aria-controls', 'plan-pane');
		await expect(work).toHaveAttribute('aria-controls', 'work-pane');
		await expect(page.getByRole('tabpanel')).toHaveCount(1);
		await expect(page.getByRole('tabpanel', { name: 'Overview', exact: true })).toHaveAttribute(
			'id',
			'plan-pane'
		);
		await expect(workPane(page)).not.toHaveRole('tabpanel');
		await expect(page.locator('#header')).toBeVisible();
		await expect(page.locator('#work-plan')).toBeHidden();
		await plan.focus();
		for (const [key, selected] of [
			['ArrowRight', work],
			['ArrowLeft', plan],
			['End', work],
			['Home', plan]
		] as const) {
			await page.keyboard.press(key);
			await expect(selected).toBeFocused();
			await expect(selected).toHaveAttribute('aria-selected', 'true');
			await expect(page.getByRole('tabpanel')).toHaveCount(1);
			const panel = page.getByRole('tabpanel', {
				name: (await selected.getAttribute('aria-label'))!,
				exact: true
			});
			await expect(panel).toHaveAttribute('id', (await selected.getAttribute('aria-controls'))!);
			await expect(panel).toHaveAttribute('aria-labelledby', (await selected.getAttribute('id'))!);
		}
		await selectTab(page, 'Work plan');
		await expect(page.locator('#header')).toBeHidden();
		await expect(page.locator('#stage-overview')).toBeHidden();
		await expect(page.locator('#remarks')).toBeHidden();
		await expect(planPane(page)).not.toHaveRole('tabpanel');
		await expect(page.getByTestId('timeline-panel')).toHaveAttribute('data-pinned', 'true');
		await expect(page.getByRole('region', { name: 'Timeline', exact: true })).toBeVisible();
		await expect(page.getByTestId('gantt-pin')).toBeHidden();
		await expect(page.locator('#work-plan')).toBeVisible();
		await page.reload();
		await expect(work).toHaveAttribute('aria-selected', 'true');
		await expect(page.locator('#work-plan')).toBeVisible();
	});
}

test('icon-only workspace tabs keep their names and show hints on hover and keyboard focus', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openExample(page);
	for (const name of ['Overview', 'Work plan'] as const) {
		const hint = page
			.locator('[data-slot="tooltip-content"]:visible')
			// The hint text can end with a space from the tooltip arrow.
			.filter({ hasText: new RegExp(`^${name}\\s*$`) });
		const tab = page.getByRole('tab', { name, exact: true });
		await expect(tab).toHaveAccessibleName(name);
		await expect(tab).toHaveAttribute('aria-label', name);
		expect(await tab.innerText()).toBe('');
		const icon = tab.locator('svg');
		await expect(icon).toHaveCount(1);
		await expect(icon).toBeVisible();
		await expect(icon).toHaveAttribute('aria-hidden', 'true');
		await tab.hover();
		await expect(hint).toHaveText(name);
		await expect(hint).toBeVisible();
		await page.mouse.move(0, 0);
		await expect(hint).toBeHidden();

		await selectTab(page, name);
		await page.mouse.move(0, 0);
		await tab.focus();
		await page.keyboard.press('Shift+Tab');
		await expect(tab).not.toBeFocused();
		await expect(hint).toBeHidden();
		await page.keyboard.press('Tab');
		await expect(tab).toBeFocused();
		await expect(hint).toHaveText(name);
		await expect(hint).toBeVisible();
		await page.keyboard.press('Shift+Tab');
		await expect(hint).toBeHidden();
	}
});

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 800, height: 900 }
]) {
	test(`the workspace island floats above the scroller at ${viewport.width}px`, async ({
		page
	}) => {
		await page.setViewportSize(viewport);
		await openExample(page);
		await expect(workspaceTabs(page)).toBeVisible();
		await expect
			.poll(() =>
				workspaceTabs(page).evaluate((island) => {
					const bounds = island.getBoundingClientRect();
					const style = getComputedStyle(island);
					const content = document.querySelector('[data-testid="workspace-content"]')!;
					return {
						narrower: bounds.width < innerWidth,
						centered: Math.abs(bounds.x + bounds.width / 2 - innerWidth / 2) <= 1,
						bottomGap: Math.abs(innerHeight - bounds.bottom - 12) <= 1,
						rounded: [
							style.borderTopLeftRadius,
							style.borderTopRightRadius,
							style.borderBottomLeftRadius,
							style.borderBottomRightRadius
						].every((radius) => parseFloat(radius) >= bounds.height / 2),
						frosted: style.backdropFilter !== 'none' && style.backdropFilter !== '',
						overlays: Math.abs(content.getBoundingClientRect().bottom - innerHeight) <= 1
					};
				})
			)
			.toEqual({
				narrower: true,
				centered: true,
				bottomGap: true,
				rounded: true,
				frosted: true,
				overlays: true
			});
	});

	test(`each group ends above the workspace island at ${viewport.width}px`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await openExample(page);
		await addWorkspaceOverflow(page);
		await expect(workspaceTabs(page)).toBeVisible();
		for (const name of ['Overview', 'Work plan'] as const) {
			await selectTab(page, name);
			await workspaceContent(page).evaluate(
				(content) => (content.scrollTop = content.scrollHeight)
			);
			await waitForFrames(page);
			await waitForAnimations(workspaceContent(page));
			await waitForAnimations(workspaceTabs(page));
			await expect
				.poll(() =>
					workspaceContent(page).evaluate((content, tab) => {
						const island = document.querySelector('[data-testid="workspace-tabs"]')!;
						const last = content.querySelector(tab === 'Overview' ? '#remarks' : '#work-plan')!;
						const gap = island.getBoundingClientRect().top - last.getBoundingClientRect().bottom;
						return {
							overflows: content.scrollHeight > content.clientHeight,
							atEnd: Math.abs(content.scrollHeight - content.clientHeight - content.scrollTop) <= 1,
							clear: tab === 'Work plan' ? Math.abs(gap - 16) <= 1 : gap >= 16 - 1
						};
					}, name)
				)
				.toEqual({ overflows: true, atEnd: true, clear: true });
		}
	});

	test(`the workspace island stays above the window edge while either group scrolls at ${viewport.width}px`, async ({
		page
	}) => {
		await page.setViewportSize(viewport);
		await openExample(page);
		await addWorkspaceOverflow(page);
		const tabs = workspaceTabs(page);
		await expect(tabs).toBeVisible();
		for (const name of ['Overview', 'Work plan'] as const) {
			await selectTab(page, name);
			const samples = await workspaceContent(page).evaluate(async (content) => {
				const read = () => {
					const tabs = document
						.querySelector('[data-testid="workspace-tabs"]')!
						.getBoundingClientRect();
					const root = document.scrollingElement!;
					return {
						top: tabs.top,
						bottom: tabs.bottom,
						fits: root.scrollHeight <= root.clientHeight
					};
				};
				const samples = [read()];
				for (const top of [100, 250, 400]) {
					content.scrollTop = top;
					await new Promise(requestAnimationFrame);
					samples.push(read());
				}
				return samples;
			});
			await expect.poll(() => workspaceContent(page).evaluate((e) => e.scrollTop)).toBe(400);
			expect(
				samples.every(
					(sample) =>
						Math.abs(sample.top - samples[0].top) <= 1 &&
						Math.abs(sample.bottom - (viewport.height - 12)) <= 1 &&
						sample.fits
				)
			).toBe(true);
			await expect(tabs).toBeInViewport({ ratio: 1 });
		}
	});
}

test.describe('workspace island scroll and selection', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await page.setViewportSize({ width: 390, height: 844 });
		await openExample(page);
		await addWorkspaceOverflow(page);
		// Keep the Timeline height fixed while testing island scroll and selection.
		await page.getByTestId('timeline-keep-open').click();
		await expect(workspaceTabs(page)).toBeVisible();
		await page.evaluate(() => document.fonts.ready.then(() => undefined));
		await waitForAnimations(workspaceTabs(page));
		await waitForAnimations(workspaceContent(page));
	});

	test('size follows scroll distance and stays at its last size when scrolling stops', async ({
		page
	}) => {
		const full = await workspaceTabSize(page);
		expect(full.tab).toBeGreaterThanOrEqual(40);
		// App scroll sets the starting position without changing the full size.
		await scrollTo(workspaceContent(page), 200);
		await waitForFrames(page);
		expect(await workspaceTabSize(page)).toEqual(full);
		for (let step = 0; step < 2; step++) await wheelWorkspace(page, 12);
		await expect
			.poll(async () => {
				const size = await workspaceTabSize(page);
				return size.island < full.island && size.tab > 29 && size.tab < full.tab;
			})
			.toBe(true);
		const downIntermediate = await workspaceTabSize(page);
		for (let step = 0; step < 3; step++) await wheelWorkspace(page, 12);
		await expect
			.poll(async () => Math.abs((await workspaceTabSize(page)).tab - 28))
			.toBeLessThanOrEqual(1);
		const compact = await workspaceTabSize(page);
		expect(compact.tab).toBeGreaterThanOrEqual(24);
		expect(compact.island).toBeLessThan(full.island);
		expect(compact.iconWidth).toBeGreaterThan(0);
		expect(compact.iconHeight).toBeGreaterThan(0);
		expect(compact.iconWidth).toBeLessThan(full.iconWidth);
		expect(compact.iconHeight).toBeLessThan(full.iconHeight);
		expect(downIntermediate.island).toBeGreaterThan(compact.island);
		await waitForFrames(page, 12);
		expect(await workspaceTabSize(page)).toEqual(compact);
		for (let step = 0; step < 2; step++) await wheelWorkspace(page, -12);
		await expect
			.poll(async () => {
				const size = await workspaceTabSize(page);
				return (
					size.island > compact.island &&
					size.island < full.island &&
					size.tab > compact.tab &&
					size.tab < full.tab
				);
			})
			.toBe(true);
		const intermediate = await workspaceTabSize(page);
		await waitForFrames(page, 12);
		expect(await workspaceTabSize(page)).toEqual(intermediate);
		const top = await workspaceContent(page).evaluate((content) => content.scrollTop);
		await wheelWorkspace(page, -top);
		await expect.poll(() => workspaceTabSize(page)).toEqual(full);
	});

	test('app scroll and tab restoration keep the size; keyboard Tab restores full size', async ({
		page
	}) => {
		const full = await workspaceTabSize(page);
		await selectTab(page, 'Work plan');
		await scrollTo(workspaceContent(page), 320);
		await selectTab(page, 'Overview');
		await scrollTo(workspaceContent(page), 200);
		await wheelWorkspace(page, 60);
		await expect
			.poll(async () => Math.abs((await workspaceTabSize(page)).tab - 28))
			.toBeLessThanOrEqual(1);
		const compact = await workspaceTabSize(page);
		await scrollTo(workspaceContent(page), 400);
		await waitForFrames(page);
		expect(await workspaceTabSize(page)).toEqual(compact);
		await selectTab(page, 'Work plan');
		await expect
			.poll(() => workspaceContent(page).evaluate((content) => content.scrollTop))
			.toBe(320);
		await waitForFrames(page);
		expect(await workspaceTabSize(page)).toEqual(compact);
		await selectTab(page, 'Overview');
		await expect
			.poll(() => workspaceContent(page).evaluate((content) => content.scrollTop))
			.toBe(400);
		await waitForFrames(page);
		expect(await workspaceTabSize(page)).toEqual(compact);

		// Start one keyboard stop before the selected tab, then shrink with pointer input.
		const tab = page.getByRole('tab', { name: 'Overview', exact: true });
		await tab.focus();
		await page.keyboard.press('Shift+Tab');
		await expect(tab).not.toBeFocused();
		// The previous stop is the last control of the group, so the app scrolled to the end.
		await scrollTo(workspaceContent(page), 200);
		await wheelWorkspace(page, 60);
		await expect
			.poll(async () => Math.abs((await workspaceTabSize(page)).tab - 28))
			.toBeLessThanOrEqual(1);
		await page.keyboard.press('Tab');
		await expect(tab).toBeFocused();
		await expect.poll(() => workspaceTabSize(page)).toEqual(full);
	});

	test('reduced motion keeps the island full size during user scroll', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		const full = await workspaceTabSize(page);
		expect(full.tab).toBeGreaterThanOrEqual(40);
		await wheelWorkspace(page, 200);
		await waitForFrames(page, 12);
		expect(await workspaceTabSize(page)).toEqual(full);
	});

	test('forced colors gives the island an opaque background and a solid outline without changing its height', async ({
		page
	}) => {
		await page.emulateMedia({ forcedColors: 'active' });
		await waitForFrames(page);
		await waitForAnimations(workspaceTabs(page));
		expect((await workspaceTabSize(page)).island).toBe(48);
		await expect
			.poll(() =>
				workspaceTabs(page).evaluate((island) => {
					const style = getComputedStyle(island);
					const color = style.backgroundColor;
					const opaque =
						color.startsWith('rgb(') ||
						(color.startsWith('rgba(') && Number(color.slice(5, -1).split(',')[3]) === 1);
					return {
						opaque,
						backdropFilter: style.backdropFilter,
						outlineStyle: style.outlineStyle,
						outlineWidth: style.outlineWidth,
						outlineVisible:
							style.outlineColor !== 'rgba(0, 0, 0, 0)' &&
							style.outlineColor !== style.backgroundColor
					};
				})
			)
			.toEqual({
				opaque: true,
				backdropFilter: 'none',
				outlineStyle: 'solid',
				outlineWidth: '1px',
				outlineVisible: true
			});
	});

	for (const reducedMotion of ['no-preference', 'reduce'] as const) {
		test(`the selected pill follows the tab with ${reducedMotion} motion`, async ({ page }) => {
			await page.emulateMedia({ reducedMotion });
			const indicator = page.getByTestId('workspace-tab-indicator');
			await expect(indicator).toBeVisible();
			const read = () =>
				workspaceTabs(page).evaluate((island) => {
					const pill = island.querySelector('[data-testid="workspace-tab-indicator"]')!;
					const tab = island.querySelector('[role="tab"][aria-selected="true"]')!;
					return {
						x: pill.getBoundingClientRect().x,
						tabX: tab.getBoundingClientRect().x,
						running: island
							.getAnimations({ subtree: true })
							.filter((animation) => animation.playState === 'running' || animation.pending).length
					};
				});
			await expect
				.poll(async () => {
					const geometry = await read();
					return Math.abs(geometry.x - geometry.tabX);
				})
				.toBeLessThanOrEqual(1);
			const before = await read();
			// Do not wait for transitions before checking reduced motion.
			await page.getByRole('tab', { name: 'Work plan', exact: true }).click();
			if (reducedMotion === 'reduce') {
				const after = await read();
				expect(after.running).toBe(0);
				expect(Math.abs(after.x - after.tabX)).toBeLessThanOrEqual(1);
			}
			await waitForAnimations(workspaceTabs(page));
			await expect
				.poll(async () => {
					const after = await read();
					return after.x > before.x + 1 && Math.abs(after.x - after.tabX) <= 1;
				})
				.toBe(true);
		});
	}
});

test('focus reveals the last task control between the Timeline and workspace island', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openExample(page);
	await addWorkspaceOverflow(page);
	await selectTab(page, 'Work plan');
	await scrollTo(workspaceContent(page), 0);
	const lastRow = page.getByTestId('task-row').last();
	const control = lastRow.getByTestId('task-title');
	await control.focus();
	await expect(control).toBeFocused();
	await waitForFrames(page);
	await waitForAnimations(workspaceContent(page));
	await waitForAnimations(workspaceTabs(page));
	await expect
		.poll(() =>
			control.evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				const timeline = document.querySelector('#timeline')!.getBoundingClientRect();
				const island = document
					.querySelector('[data-testid="workspace-tabs"]')!
					.getBoundingClientRect();
				return bounds.top >= timeline.bottom && bounds.bottom <= island.top;
			})
		)
		.toBe(true);
});

test('a focused Timeline height button transfers focus to the handle when the layout narrows', async ({
	page
}) => {
	await openExample(page);
	await page.getByTestId('gantt-pin').click();
	const taller = page.getByRole('button', { name: 'Make timeline taller', exact: true });
	await taller.focus();
	await expect(taller).toBeFocused();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'tabs');
	await expect(taller).toBeHidden();
	await expect(page.getByRole('button', { name: 'Collapse timeline', exact: true })).toBeFocused();
});

test('a focused Timeline handle transfers focus to the pin when the layout widens', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openExample(page);
	const handle = page.getByRole('button', { name: 'Collapse timeline', exact: true });
	await handle.focus();
	await expect(handle).toBeFocused();
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'split');
	await expect(handle).toBeHidden();
	await expect(page.getByTestId('gantt-pin')).toBeFocused();
});

test('a focused Keep open toggle transfers focus to the unpinned toggle when the layout widens', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openExample(page);
	const keepOpen = page.getByTestId('timeline-keep-open');
	await keepOpen.focus();
	await expect(keepOpen).toBeFocused();
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'split');
	await expect(keepOpen).toHaveCount(0);
	await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByTestId('gantt-pin')).toBeFocused();
});

test('a focused Gantt label keeps focus and the selected Work plan tab when the layout narrows', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openExample(page);
	await selectTab(page, 'Work plan');
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'split');
	const label = page.getByTestId('gantt-label').filter({ hasText: /^Site survey$/ });
	await label.focus();
	await expect(label).toBeFocused();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'tabs');
	await expect(page.getByRole('tab', { name: 'Work plan', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(label).toBeFocused();
});

test('a focused separator returns focus to the selected tab when the layout narrows', async ({
	page
}) => {
	await openExample(page);
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'split');
	const separator = page.getByTestId('split-resize');
	await separator.focus();
	await expect(separator).toBeFocused();
	await page.setViewportSize({ width: 800, height: 900 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'tabs');
	await expect(separator).toBeHidden();
	await expect(page.getByRole('tab', { selected: true })).toBeFocused();
	await expect(page.locator('body')).not.toBeFocused();
});

for (const [name, paneId] of [
	['Work plan', 'work-pane'],
	['Overview', 'plan-pane']
] as const) {
	test(`the focused ${name} tab transfers focus to its pane when the layout widens`, async ({
		page
	}) => {
		await page.setViewportSize({ width: 800, height: 900 });
		await openExample(page);
		await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'tabs');
		await selectTab(page, name);
		const tab = page.getByRole('tab', { name, exact: true });
		await tab.focus();
		await expect(tab).toBeFocused();
		await expect(tab).toHaveAttribute('aria-selected', 'true');
		await page.setViewportSize({ width: 1280, height: 900 });
		await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'split');
		await expect(tab).toBeHidden();
		const pane = page.locator(`#${paneId}`);
		await expect(pane).toBeFocused();
		await expect(pane).toHaveAttribute('tabindex', '-1');
		await expect(page.locator('body')).not.toBeFocused();
	});
}

test('each tab restores its own scroll position', async ({ page }) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await openExample(page);
	await addWorkspaceOverflow(page);
	await scrollTo(workspaceContent(page), 180);
	await selectTab(page, 'Work plan');
	await scrollTo(workspaceContent(page), 300);
	await selectTab(page, 'Overview');
	await expect
		.poll(() => workspaceContent(page).evaluate((element) => element.scrollTop))
		.toBe(180);
	await selectTab(page, 'Work plan');
	await expect
		.poll(() => workspaceContent(page).evaluate((element) => element.scrollTop))
		.toBe(300);
});

test('a narrow pinned Timeline stays above both panels and the sticky stage stack', async ({
	page
}) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await openExample(page);
	await addWorkspaceOverflow(page);
	await expectStickyBelowHeader(page.getByTestId('timeline-panel'));
	await selectTab(page, 'Work plan');
	await expectStickyStageStack(stage(page, 0));
	await expectStickyBelowHeader(page.getByTestId('timeline-panel'));
	await expectStickyStageStack(stage(page, 1));
	await expect
		.poll(() =>
			page.getByTestId('timeline-panel').evaluate((panel) => {
				const content = document
					.querySelector('[data-testid="workspace-content"]')!
					.getBoundingClientRect();
				const bounds = panel.getBoundingClientRect();
				return Math.abs(bounds.top - content.top) <= 1;
			})
		)
		.toBe(true);
	// The tabs maximum excludes the top space added to the stored panel height.
	await expect.poll(() => storedPanelHeight(page)).toBeLessThanOrEqual(900 * 0.4 + 1);
	await expect(page.getByTestId('timeline-panel')).toBeVisible();
	await selectTab(page, 'Overview');
	await expect(page.getByTestId('timeline-panel')).toBeVisible();
});

test('one Timeline keeps its node, horizontal offset and open milestone dialog across layouts', async ({
	page
}) => {
	await openExample(page);
	const panel = page.getByTestId('timeline-panel');
	const chart = page.getByTestId('gantt-scroller');
	await panel.evaluate((element) =>
		Object.assign(element, { splitLayoutSentinel: 'same timeline' })
	);
	await chart.evaluate((element) => (element.scrollLeft = 32));
	await expect.poll(() => chart.evaluate((element) => element.scrollLeft)).toBe(32);
	const checkInstance = async () => {
		await expect(panel).toHaveCount(1);
		expect(await panel.evaluate((element) => Reflect.get(element, 'splitLayoutSentinel'))).toBe(
			'same timeline'
		);
		await expect.poll(() => chart.evaluate((element) => element.scrollLeft)).toBe(32);
	};
	await page.getByTestId('gantt-pin').click();
	await checkInstance();
	await page.getByTestId('gantt-pin').click();
	await checkInstance();
	// With tabs the Timeline is pinned. A pointer over a table row then scrolls the chart to its bar.
	await page.mouse.move(0, 0);
	await page.setViewportSize({ width: 800, height: 900 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'tabs');
	await checkInstance();
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'split');
	await checkInstance();
	await page.getByTestId('milestone-legend').getByRole('button').first().click();
	const dialog = page.getByTestId('milestone-dialog');
	await expect(dialog).toBeVisible();
	await waitForAnimations(dialog);
	await dialog.getByLabel('Title', { exact: true }).fill('Draft survives resize');
	for (const width of [800, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await expect(workspaceContent(page)).toHaveAttribute(
			'data-layout',
			width < 1024 ? 'tabs' : 'split'
		);
		await expect(dialog).toBeVisible();
		await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Draft survives resize');
		await checkInstance();
	}
});

test('a split label jump scrolls only the Work plan pane and flashes the revealed row', async ({
	page
}) => {
	await openExample(page);
	await addWorkspaceOverflow(page);
	const target = row(page, 'First harvest');
	// Observe the flash class even when reduced motion removes its animation duration.
	await target.evaluate((element) => {
		const state = { seen: false };
		const observer = new MutationObserver(() => {
			if (element.classList.contains('row-flash')) state.seen = true;
		});
		observer.observe(element, { attributes: true, attributeFilter: ['class'] });
		Object.assign(element, { jumpFlash: state });
	});
	const label = page.getByTestId('gantt-label').filter({ hasText: /^First harvest$/ });
	await label.scrollIntoViewIfNeeded();
	const left = await planPane(page).evaluate((element) => element.scrollTop);
	await label.click();
	await expectJumpTarget(page, 'First harvest');
	await expect
		.poll(() => workPane(page).evaluate((element) => element.scrollTop))
		.toBeGreaterThan(0);
	expect(await planPane(page).evaluate((element) => element.scrollTop)).toBe(left);
	expect(await page.evaluate(() => window.scrollY)).toBe(0);
	await expect
		.poll(() => target.evaluate((element) => Reflect.get(element, 'jumpFlash').seen))
		.toBe(true);
});

test('an Overview label jump selects the Work plan tab and reveals its row', async ({ page }) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await openExample(page);
	await addWorkspaceOverflow(page);
	await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await page
		.getByTestId('gantt-label')
		.filter({ hasText: /^First harvest$/ })
		.click();
	await expect(page.getByRole('tab', { name: 'Work plan', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expectJumpTarget(page, 'First harvest');
	await expect(page.getByTestId('timeline-panel')).toBeVisible();
});

test('crossing to tabs keeps focus on a Work plan control and selects its group', async ({
	page
}) => {
	await openExample(page);
	const control = row(page, 'Site survey').getByTestId('task-status');
	await control.focus();
	await expect(control).toBeFocused();
	await page.setViewportSize({ width: 800, height: 900 });
	await expect(page.getByRole('tab', { name: 'Work plan', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(control).toBeFocused();
	await expect(control).toBeInViewport();
});

test('sheet footer fields follow the objective and edit the footer on every Preview sheet', async ({
	page
}) => {
	await openExample(page);
	const footer = page.locator('#header').getByRole('group', { name: 'Sheet footer' });
	await expect(footer).toBeVisible();
	expect(
		await footer.evaluate((element) =>
			Boolean(
				document.querySelector('[data-testid="plan-objective"]')!.compareDocumentPosition(element) &
				Node.DOCUMENT_POSITION_FOLLOWING
			)
		)
	).toBe(true);
	await expect(page.locator('[data-workspace] footer')).toHaveCount(0);
	await expect(page.locator('[data-workspace] [data-page-number]')).toHaveCount(0);
	for (const id of ['footer-note', 'footer-version', 'footer-date', 'footer-right'])
		await expect(footer.getByTestId(id)).toBeVisible();
	await footer.getByTestId('footer-version').click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type('v2 split');
	await page.keyboard.press('Enter');
	await openPreview(page);
	const sheets = page.getByTestId('sheet');
	for (const sheet of await sheets.all())
		await expect(sheet.getByTestId('sheet-footer-left')).toContainText('v2 split');
});

test('overview and remarks columns follow the Plan section width within a wide viewport', async ({
	page
}) => {
	await page.setViewportSize({ width: 1600, height: 900 });
	await openExample(page);
	const separator = page.getByTestId('split-resize');
	for (const key of ['Home', 'End']) {
		await separator.press(key);
		await expect
			.poll(() =>
				planPane(page).evaluate((pane) => {
					return ['stage-overview', 'remarks'].map((id) => {
						const section = pane.querySelector(`#${id}`)!;
						const grid = [...section.querySelectorAll('*')].find(
							(element) => getComputedStyle(element).display === 'grid'
						)!;
						const width = section.getBoundingClientRect().width;
						const expected =
							id === 'stage-overview'
								? width >= 720
									? 3
									: width >= 480
										? 2
										: 1
								: width >= 640
									? 2
									: 1;
						return {
							columns: getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length,
							expected
						};
					});
				})
			)
			.toEqual(
				key === 'Home'
					? [
							{ columns: 1, expected: 1 },
							{ columns: 1, expected: 1 }
						]
					: [
							{ columns: 3, expected: 3 },
							{ columns: 2, expected: 2 }
						]
			);
	}
	await separator.dblclick();
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect
		.poll(() =>
			page.locator('#stage-overview').evaluate((section) => {
				const grid = [...section.querySelectorAll('*')].find(
					(element) => getComputedStyle(element).display === 'grid'
				)!;
				return {
					sectionHasTwoColumns:
						section.getBoundingClientRect().width >= 480 &&
						section.getBoundingClientRect().width < 720,
					columns: getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length
				};
			})
		)
		.toEqual({ sectionHasTwoColumns: true, columns: 2 });
});

test('reduced motion applies separator steps, reset and tab changes in the next frame', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openExample(page);
	const ratioInNextFrame = () =>
		workspaceContent(page).evaluate(
			(content) =>
				new Promise<number>((resolve) => {
					requestAnimationFrame(() => {
						const left = content.querySelector('#plan-pane')!.getBoundingClientRect().width;
						const right = content.querySelector('#work-pane')!.getBoundingClientRect().width;
						resolve(left / (left + right));
					});
				})
		);
	const separator = page.getByTestId('split-resize');
	await separator.press('ArrowRight');
	expect(await ratioInNextFrame()).toBeCloseTo(0.52, 2);
	await separator.dblclick();
	expect(await ratioInNextFrame()).toBeCloseTo(0.5, 2);
	await page.setViewportSize({ width: 800, height: 900 });
	await page.getByRole('tab', { name: 'Work plan', exact: true }).click();
	const state = await workspaceContent(page).evaluate(
		(content) =>
			new Promise((resolve) => {
				requestAnimationFrame(() => {
					const header = content.querySelector('#header')!;
					const work = content.querySelector('#work-plan')!;
					resolve({
						planHidden: header.getClientRects().length === 0,
						workVisible: work.getClientRects().length > 0,
						workOpacity: getComputedStyle(content.querySelector('#work-pane')!).opacity,
						animations: content
							.getAnimations({ subtree: true })
							.filter((animation) => animation.playState === 'running').length
					});
				});
			})
	);
	expect(state).toEqual({ planHidden: true, workVisible: true, workOpacity: '1', animations: 0 });
});

test('a label tap does not resize the island when its jump scrolls the group', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.setViewportSize({ width: 390, height: 844 });
	await openExample(page);
	await addWorkspaceOverflow(page);
	await selectTab(page, 'Work plan');
	await scrollTo(workspaceContent(page), 300);
	// Make the island partly compact, so a scroll in either direction changes its size.
	await wheelWorkspace(page, 24);
	await waitForFrames(page);
	const partial = await workspaceTabSize(page);
	expect(partial.tab).toBeGreaterThan(28.5);
	expect(partial.tab).toBeLessThan(39.5);
	const before = await workspaceContent(page).evaluate((element) => element.scrollTop);
	// A tap without movement, in the order of a touch screen: pointer down, touch start,
	// pointer up, touch end, then the click that starts the jump.
	const label = page.getByTestId('gantt-label').filter({ hasText: /^Site survey$/ });
	await label.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 });
	await label.dispatchEvent('touchstart');
	await label.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0 });
	await label.dispatchEvent('touchend');
	await label.dispatchEvent('click');
	await expect
		.poll(() => workspaceContent(page).evaluate((element) => element.scrollTop))
		.toBeLessThan(before - 48);
	await expectJumpTarget(page, 'Site survey');
	await waitForFrames(page);
	expect(await workspaceTabSize(page)).toEqual(partial);
});
