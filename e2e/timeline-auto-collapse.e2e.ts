import { expect, test } from '@playwright/test';
import {
	addWorkspaceOverflow,
	COLLAPSED_TIMELINE_HEIGHT,
	storedViewer,
	collapseTimeline,
	expandTimeline,
	expectTimelineCollapsed,
	openExample,
	selectTab,
	timelineHandle,
	touchScroll,
	userScroll,
	waitForAnimations,
	workspaceContent,
	row,
	writeStoredPlan
} from './helpers.ts';

test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openExample(page);
	await addWorkspaceOverflow(page);
	await selectTab(page, 'Work plan');
	await expect(page.getByTestId('timeline-keep-open')).toHaveAttribute('aria-pressed', 'false');
});

test('user scroll collapses at 48 pixels and expands at the top without saving a user collapse', async ({
	page
}) => {
	const pane = workspaceContent(page);
	await userScroll(page, pane, 47);
	await expect.poll(() => pane.evaluate((e) => e.scrollTop)).toBe(47);
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	await userScroll(page, pane, 1);
	await expectTimelineCollapsed(page);
	expect((await storedViewer(page)).timelineCollapsed).toBe(false);
	await userScroll(page, pane, -10000);
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	await userScroll(page, pane, 100);
	await expectTimelineCollapsed(page);
	await page.reload();
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
});

test('an upward user scroll resets the downward threshold', async ({ page }) => {
	const pane = workspaceContent(page);
	for (const delta of [30, -10, 30]) await userScroll(page, pane, delta);
	await expect.poll(() => pane.evaluate((e) => e.scrollTop)).toBe(50);
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	await userScroll(page, pane, 18);
	await expectTimelineCollapsed(page);
});

test('app scrolls and restored tab positions do not collapse the Timeline', async ({ page }) => {
	const pane = workspaceContent(page);
	await pane.evaluate((e) => (e.scrollTop = 250));
	await expect.poll(() => pane.evaluate((e) => e.scrollTop)).toBe(250);
	await selectTab(page, 'Overview');
	await selectTab(page, 'Work plan');
	await expect.poll(() => pane.evaluate((e) => e.scrollTop)).toBe(250);
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	await page
		.getByTestId('gantt-label')
		.filter({ hasText: /^First harvest$/ })
		.click();
	await waitForAnimations(pane);
	await expect(row(page, 'First harvest')).toBeInViewport();
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
});

test('Keep open persists independently from the split pin and allows manual collapse', async ({
	page
}) => {
	const keep = page.getByRole('button', { name: 'Keep timeline open', exact: true });
	await expect(keep).toHaveAttribute('aria-pressed', 'false');
	await keep.click();
	await expect(keep).toHaveAttribute('aria-pressed', 'true');
	await userScroll(page, workspaceContent(page), 100);
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	await collapseTimeline(page);
	await userScroll(page, workspaceContent(page), -10000);
	await expectTimelineCollapsed(page);
	await expandTimeline(page);
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.getByTestId('gantt-pin').click();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(keep).toHaveAttribute('aria-pressed', 'true');
	await keep.click();
	expect((await storedViewer(page)).ganttPinned).toBe(true);
	await keep.click();
	await page.reload();
	await expect(keep).toHaveAttribute('aria-pressed', 'true');
	expect((await storedViewer(page)).timelineKeepOpen).toBe(true);
});

test('a manual collapse stays collapsed when the user scrolls to the top', async ({ page }) => {
	await collapseTimeline(page);
	await userScroll(page, workspaceContent(page), 200);
	await userScroll(page, workspaceContent(page), -10000);
	await expectTimelineCollapsed(page);
	expect((await storedViewer(page)).timelineCollapsed).toBe(true);
});

test('focus inside the Timeline prevents automatic collapse', async ({ page }) => {
	const keep = page.getByTestId('timeline-keep-open');
	await keep.focus();
	await userScroll(page, workspaceContent(page), 100);
	await expect(keep).toBeFocused();
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
});

test('collapse requires 48 pixels of remaining scroll after the height change', async ({
	page
}) => {
	const pane = workspaceContent(page);
	for (const remaining of [47, 49]) {
		// Let the prior user-input window expire before the next app scroll.
		await page.waitForTimeout(250);
		await pane.evaluate(
			(e, { remaining, collapsedHeight }) => {
				const height = document.querySelector('#timeline')!.getBoundingClientRect().height;
				e.scrollTop = e.scrollHeight - e.clientHeight - (height - collapsedHeight) - remaining - 48;
			},
			{ remaining, collapsedHeight: COLLAPSED_TIMELINE_HEIGHT }
		);
		await pane.evaluate(async () => {
			await new Promise(requestAnimationFrame);
			await new Promise(requestAnimationFrame);
		});
		await userScroll(page, pane, 48);
		await expect(timelineHandle(page)).toHaveAttribute(
			'aria-expanded',
			remaining === 47 ? 'true' : 'false'
		);
		if (remaining === 49) await expandTimeline(page);
	}
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
	test(`layout scroll adjustments do not reverse collapse or resize the island (${reducedMotion})`, async ({
		page
	}) => {
		await page.emulateMedia({ reducedMotion });
		const pane = workspaceContent(page);
		// Setup animations can change the scroll height. Measure the final layout.
		await waitForAnimations(pane);
		await pane.evaluate((e) => (e.scrollTop = e.scrollHeight - e.clientHeight - 400));
		const monitor = await page.evaluateHandle(() => {
			const state = {
				frames: [] as { expanded: string | null; island: number; scroll: number }[],
				stop: false
			};
			const read = () => {
				state.frames.push({
					expanded: document.querySelector('#timeline-collapse')!.getAttribute('aria-expanded'),
					island: document.querySelector('[data-testid="workspace-tabs"]')!.getBoundingClientRect()
						.height,
					scroll: document.querySelector('[data-testid="workspace-content"]')!.scrollTop
				});
				if (!state.stop) requestAnimationFrame(read);
			};
			read();
			return state;
		});
		await userScroll(page, pane, 48);
		await expectTimelineCollapsed(page);
		await waitForAnimations(page.getByTestId('workspace-tabs'));
		const frames = await monitor.evaluate((state) => {
			state.stop = true;
			return state.frames;
		});
		await monitor.dispose();
		const firstCollapsed = frames.findIndex((frame) => frame.expanded === 'false');
		expect(firstCollapsed).toBeGreaterThanOrEqual(0);
		expect(frames.slice(firstCollapsed).every((frame) => frame.expanded === 'false')).toBe(true);
		const island = frames.map((frame) => frame.island);
		expect(
			island.every(
				(height) =>
					height >= Math.min(island[0], island.at(-1)!) - 1 &&
					height <= Math.max(island[0], island.at(-1)!) + 1
			)
		).toBe(true);
		await userScroll(page, pane, -10000);
		await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
		await waitForAnimations(page.locator('#timeline'));
		await expect.poll(() => pane.evaluate((e) => e.scrollTop)).toBe(0);
	});
}

test('automatic expansion reveals group focus below the final Timeline height', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await userScroll(page, workspaceContent(page), 100);
	await expectTimelineCollapsed(page);
	const target = row(page, 'Site survey').getByTestId('task-details');
	await target.evaluate((e) => (e as HTMLElement).focus({ preventScroll: true }));
	await userScroll(page, workspaceContent(page), -10000);
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	await waitForAnimations(page.locator('#timeline'));
	await expect(target).toBeFocused();
	await expect
		.poll(() =>
			target.evaluate(
				(e) =>
					e.getBoundingClientRect().top >=
					document.querySelector('#timeline')!.getBoundingClientRect().bottom
			)
		)
		.toBe(true);
});

test('a group too short to scroll after collapse stays expanded', async ({ page }) => {
	await writeStoredPlan(page, (plan) => {
		const task = plan.tasks.find((task) => task.parentId === null)!;
		task.dependsOn = [];
		plan.tasks = [task];
		plan.stages = plan.stages.filter((stage) => stage.id === task.stageId);
		plan.remarks = [];
		plan.objective = '';
	});
	await selectTab(page, 'Work plan');
	const pane = workspaceContent(page);
	const available = await pane.evaluate(
		(e, collapsedHeight) =>
			e.scrollHeight -
			e.clientHeight -
			(document.querySelector('#timeline')!.getBoundingClientRect().height - collapsedHeight),
		COLLAPSED_TIMELINE_HEIGHT
	);
	expect(available).toBeLessThan(48);
	await userScroll(page, pane, 100);
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
});

test('a manual height change does not resize a partly compact island', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	const pane = workspaceContent(page);
	await pane.evaluate((e) => (e.scrollTop = e.scrollHeight - e.clientHeight - 400));
	await pane.evaluate(async () => {
		await new Promise(requestAnimationFrame);
		await new Promise(requestAnimationFrame);
	});
	const island = page.getByTestId('workspace-tabs');
	const full = (await island.boundingBox())!.height;
	await userScroll(page, pane, 24);
	await waitForAnimations(island);
	const partial = (await island.boundingBox())!.height;
	expect(partial).toBeLessThan(full);
	const monitor = await island.evaluateHandle((element) => {
		const state = { sizes: [] as number[], stop: false };
		const sample = () => {
			state.sizes.push(element.getBoundingClientRect().height);
			if (!state.stop) requestAnimationFrame(sample);
		};
		sample();
		return state;
	});
	await collapseTimeline(page);
	const sizes = await monitor.evaluate((state) => {
		state.stop = true;
		return state.sizes;
	});
	await monitor.dispose();
	expect(sizes.every((height) => Math.abs(height - partial) <= 1)).toBe(true);
});

test.describe('touch Timeline automatic collapse', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('touch handle taps and a touch scroll collapse once without a layout-scroll rebound', async ({
		page
	}) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await waitForAnimations(page.locator('#timeline'));
		const handle = timelineHandle(page);
		await handle.tap();
		await expectTimelineCollapsed(page);
		await handle.tap();
		await expect(handle).toHaveAttribute('aria-expanded', 'true');
		await waitForAnimations(page.locator('#timeline'));
		const pane = workspaceContent(page);
		await pane.evaluate((e) => (e.scrollTop = e.scrollHeight - e.clientHeight - 500));
		await expect
			.poll(() => pane.evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop))
			.toBeCloseTo(500, 0);
		const monitor = await page.evaluateHandle(() => {
			const state = { collapsed: [] as boolean[], stop: false };
			const sample = () => {
				state.collapsed.push(
					document.querySelector('#timeline-collapse')!.getAttribute('aria-expanded') === 'false'
				);
				if (!state.stop) requestAnimationFrame(sample);
			};
			sample();
			return state;
		});
		try {
			await touchScroll(page, pane, 120);
			await expectTimelineCollapsed(page);
			let previous = -1;
			await expect
				.poll(
					async () => {
						const current = await pane.evaluate((e) => e.scrollTop);
						const settled = current === previous;
						previous = current;
						return settled;
					},
					{ intervals: [100, 100, 100] }
				)
				.toBe(true);
			const frames = await monitor.evaluate((state) => {
				state.stop = true;
				return state.collapsed;
			});
			const first = frames.indexOf(true);
			expect(first).toBeGreaterThanOrEqual(0);
			expect(frames.slice(first).every(Boolean)).toBe(true);
		} finally {
			await monitor.evaluate((state) => (state.stop = true));
			await monitor.dispose();
		}
	});
});
