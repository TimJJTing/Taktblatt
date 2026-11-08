import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	addWorkspaceOverflow,
	expectStickyBelowHeader,
	expectStickyStageStack,
	openExample,
	openPreview,
	planPane,
	row,
	selectTab,
	stage,
	waitForAnimations,
	workPane,
	workspaceContent
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

async function expectJumpTarget(page: Page, title: string) {
	await expect
		.poll(() =>
			row(page, title).evaluate((element) => {
				const stage = element.closest('[data-testid="stage"]')!;
				const header = stage.querySelector(':scope > header')!.getBoundingClientRect();
				const narrow = stage.getBoundingClientRect().width < 640;
				const band = stage
					.querySelector(narrow ? '[data-testid="stage-band"]' : 'thead th')!
					.getBoundingClientRect();
				const bounds = element.getBoundingClientRect();
				const content = document.querySelector('[data-testid="workspace-content"]')!;
				const scroller =
					content.getAttribute('data-layout') === 'split'
						? document.querySelector('#work-pane')!
						: content;
				return (
					bounds.top >= Math.max(header.bottom, band.bottom) - 1 &&
					bounds.bottom <= scroller.getBoundingClientRect().bottom + 1
				);
			})
		)
		.toBe(true);
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
		const plan = tabs.getByRole('tab', { name: 'Plan', exact: true });
		const work = tabs.getByRole('tab', { name: 'Work plan', exact: true });
		await expect(plan).toHaveAttribute('aria-selected', 'true');
		await expect(plan).toHaveAttribute('aria-controls', 'plan-pane');
		await expect(work).toHaveAttribute('aria-controls', 'work-pane');
		await expect(page.getByRole('tabpanel')).toHaveCount(1);
		await expect(page.getByRole('tabpanel', { name: 'Plan', exact: true })).toHaveAttribute(
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
				name: (await selected.textContent())!.trim(),
				exact: true
			});
			await expect(panel).toHaveAttribute('id', (await selected.getAttribute('aria-controls'))!);
			await expect(panel).toHaveAttribute('aria-labelledby', (await selected.getAttribute('id'))!);
		}
		await selectTab(page, 'Work plan');
		await expect(page.locator('#header')).toBeHidden();
		await expect(page.locator('#stage-overview')).toBeHidden();
		await expect(page.locator('#remarks')).toBeHidden();
		await expect(page.getByTestId('timeline-panel')).toBeHidden();
		await expect(page.locator('#work-plan')).toBeVisible();
		await page.reload();
		await expect(work).toHaveAttribute('aria-selected', 'true');
		await expect(page.locator('#work-plan')).toBeVisible();
	});
}

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
	['Plan', 'plan-pane']
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

test('only the selected group is a tabpanel while the pinned Timeline stays accessible', async ({
	page
}) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await openExample(page);
	await page.getByTestId('gantt-pin').click();
	await expect(page.getByTestId('timeline-panel')).toHaveAttribute('data-pinned', 'true');
	await selectTab(page, 'Work plan');
	await expect(page.getByRole('tabpanel')).toHaveCount(1);
	await expect(page.getByRole('tabpanel', { name: 'Work plan', exact: true })).toHaveAttribute(
		'id',
		'work-pane'
	);
	await expect(planPane(page)).not.toHaveRole('tabpanel');
	await expect(page.getByRole('region', { name: 'Timeline', exact: true })).toBeVisible();
	await expect(page.getByTestId('gantt-pin')).toBeEnabled();
	await selectTab(page, 'Plan');
	await expect(page.getByRole('tabpanel')).toHaveCount(1);
	await expect(page.getByRole('tabpanel', { name: 'Plan', exact: true })).toHaveAttribute(
		'id',
		'plan-pane'
	);
	await expect(workPane(page)).not.toHaveRole('tabpanel');
});

test('each tab restores its own scroll position', async ({ page }) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await openExample(page);
	await addWorkspaceOverflow(page);
	await scrollTo(workspaceContent(page), 180);
	await selectTab(page, 'Work plan');
	await scrollTo(workspaceContent(page), 300);
	await selectTab(page, 'Plan');
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
	await page.getByTestId('gantt-pin').click();
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
				return Math.abs(bounds.top - content.top) <= 1 && bounds.height <= innerHeight * 0.4 + 1;
			})
		)
		.toBe(true);
	await page.getByTestId('gantt-pin').click();
	await expect(page.getByTestId('timeline-panel')).toBeHidden();
	await selectTab(page, 'Plan');
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

test('an unpinned label jump selects the Work plan tab and reveals its row', async ({ page }) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await openExample(page);
	await addWorkspaceOverflow(page);
	await page
		.getByTestId('gantt-label')
		.filter({ hasText: /^First harvest$/ })
		.click();
	await expect(page.getByRole('tab', { name: 'Work plan', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expectJumpTarget(page, 'First harvest');
	await expect(page.getByTestId('timeline-panel')).toBeHidden();
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
