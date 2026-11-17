import { expect, test } from '@playwright/test';
import {
	addWorkspaceOverflow,
	changePlanInOtherTab,
	openApp,
	openExample,
	row,
	selectTab,
	startWorkspaceFrameMonitor,
	waitForAnimations,
	waitForFrames,
	wheelWorkspace,
	workspaceContent,
	workspaceTabs,
	workspaceTabSize,
	writeStoredPlan
} from './helpers.ts';

test.beforeEach(async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.setViewportSize({ width: 1280, height: 900 });
});

for (const [key, ratio] of [
	['ArrowRight', 0.52],
	['ArrowLeft', 0.48],
	['PageDown', 0.6],
	['PageUp', 0.4],
	['Home', 360 / 1268],
	['End', 1 - 360 / 1268]
] as const) {
	test(`split divider ${key} animates through intermediate pane widths`, async ({ page }) => {
		await openExample(page);
		const monitor = await startWorkspaceFrameMonitor(page);
		await page.getByTestId('split-resize').press(key);
		const frames = await monitor.finish();
		const first = frames[0];
		const last = frames.at(-1)!;
		const min = Math.min(first.left.width, last.left.width);
		const max = Math.max(first.left.width, last.left.width);
		expect(last.left.width / (last.left.width + last.right.width)).toBeCloseTo(ratio, 2);
		expect(frames.some((frame) => frame.left.width > min + 1 && frame.left.width < max - 1)).toBe(
			true
		);
		for (const frame of frames) {
			expect(frame.left.width + frame.right.width).toBeCloseTo(
				first.left.width + first.right.width,
				0
			);
			expect(frame.divider.x).toBeCloseTo(frame.left.x + frame.left.width, 0);
		}
	});
}

test('split divider double-click reset animates through intermediate pane widths', async ({
	page
}) => {
	await openExample(page);
	const separator = page.getByTestId('split-resize');
	await separator.press('PageDown');
	await waitForAnimations(workspaceContent(page));
	const monitor = await startWorkspaceFrameMonitor(page);
	await separator.dblclick();
	const frames = await monitor.finish();
	const first = frames[0];
	const last = frames.at(-1)!;
	expect(last.left.width / (last.left.width + last.right.width)).toBeCloseTo(0.5, 2);
	expect(
		frames.some(
			(frame) => frame.left.width < first.left.width - 1 && frame.left.width > last.left.width + 1
		)
	).toBe(true);
	for (const frame of frames) {
		expect(frame.left.width + frame.right.width).toBeCloseTo(
			first.left.width + first.right.width,
			0
		);
		expect(frame.divider.x).toBeCloseTo(frame.left.x + frame.left.width, 0);
	}
});

test('the island selection pill slides through intermediate positions in both directions', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openExample(page);
	for (const name of ['Work plan', 'Overview'] as const) {
		await waitForAnimations(workspaceTabs(page));
		const monitor = await startWorkspaceFrameMonitor(page);
		await page.getByRole('tab', { name, exact: true }).click();
		const frames = await monitor.finish();
		const first = frames[0].indicator.x;
		const last = frames.at(-1)!;
		expect(Math.abs(last.indicator.x - last.selected.x)).toBeLessThanOrEqual(1);
		expect(Math.abs(last.indicator.x - first)).toBeGreaterThan(40);
		expect(
			frames.some(
				(frame) =>
					frame.indicator.x > Math.min(first, last.indicator.x) + 1 &&
					frame.indicator.x < Math.max(first, last.indicator.x) - 1
			)
		).toBe(true);
	}
});

test('each selected group fades through intermediate opacity without moving', async ({ page }) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await openExample(page);
	for (const [name, tab, indices] of [
		['Work plan', 'work-plan', [3]],
		['Overview', 'plan', [0, 1, 2]]
	] as const) {
		const monitor = await startWorkspaceFrameMonitor(page);
		await page.getByRole('tab', { name, exact: true }).click();
		const frames = (await monitor.finish()).filter((frame) => frame.tab === tab);
		for (const index of indices) {
			const samples = frames.map((frame) => frame.groups[index]).filter((group) => group.visible);
			const last = samples.at(-1)!;
			expect(last.opacity).toBe(1);
			expect(samples.some((sample) => sample.opacity > 0.02 && sample.opacity < 0.98)).toBe(true);
			const fading = samples.filter((sample) => sample.opacity < 0.98);
			expect(fading.length).toBeGreaterThan(1);
			expect(fading.at(-1)!.opacity).toBeGreaterThan(fading[0].opacity);
			for (let frame = 1; frame < fading.length; frame++) {
				expect(fading[frame].opacity).toBeGreaterThanOrEqual(fading[frame - 1].opacity);
			}
			for (const sample of samples) {
				expect(sample.x).toBeCloseTo(last.x, 0);
				expect(sample.y).toBeCloseTo(last.y, 0);
			}
		}
	}
});

test('a short group keeps the island full and restores it after another group compacted it', async ({
	page
}) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await openApp(page);
	await selectTab(page, 'Work plan');
	expect(
		await workspaceContent(page).evaluate((content) => content.scrollHeight - content.clientHeight)
	).toBe(0);
	expect((await workspaceTabSize(page)).tab).toBeGreaterThanOrEqual(40);
	await selectTab(page, 'Overview');
	await writeStoredPlan(page, (plan) => {
		plan.remarks = [
			{
				id: 'long-notes',
				title: 'Notes',
				bullets: Array.from({ length: 60 }, (_, i) => `Note ${i}`)
			}
		];
	});
	await wheelWorkspace(page, 96);
	expect((await workspaceTabSize(page)).tab).toBe(28);
	await page.getByRole('tab', { name: 'Work plan', exact: true }).click();
	await expect
		.poll(() =>
			workspaceContent(page).evaluate((content) => content.scrollHeight - content.clientHeight)
		)
		.toBe(0);
	await expect.poll(async () => (await workspaceTabSize(page)).tab).toBe(40);
});

test('the compact island returns to full size when its active group becomes short', async ({
	page
}) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await openExample(page);
	await addWorkspaceOverflow(page);
	await selectTab(page, 'Work plan');
	await wheelWorkspace(page, 96);
	expect((await workspaceTabSize(page)).tab).toBe(28);
	await changePlanInOtherTab(page, (plan) => {
		plan.tasks = [];
		plan.stages = plan.stages.slice(0, 1);
	});
	await expect(page.getByTestId('task-row')).toHaveCount(0);
	await expect
		.poll(() =>
			workspaceContent(page).evaluate((content) => content.scrollHeight - content.clientHeight)
		)
		.toBe(0);
	await expect.poll(async () => (await workspaceTabSize(page)).tab).toBe(40);
});

test('a hidden group that became shorter restores the nearest possible positive scroll position', async ({
	page
}) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await openExample(page);
	await addWorkspaceOverflow(page);
	await selectTab(page, 'Work plan');
	const saved = await workspaceContent(page).evaluate((content) => {
		content.scrollTop = content.scrollHeight;
		return content.scrollTop;
	});
	await selectTab(page, 'Overview');
	await changePlanInOtherTab(page, (plan) => {
		plan.tasks = plan.tasks.filter((task) => task.id.startsWith('scroll-task-')).slice(0, 12);
		plan.stages = plan.stages.slice(0, 1);
	});
	await expect(page.getByTestId('task-row')).toHaveCount(12);
	const monitor = await startWorkspaceFrameMonitor(page);
	await page.getByRole('tab', { name: 'Work plan', exact: true }).click();
	const frames = (await monitor.finish()).filter((frame) => frame.tab === 'work-plan');
	const last = frames.at(-1)!;
	expect(last.max).toBeGreaterThan(0);
	expect(last.max).toBeLessThan(saved);
	for (const frame of frames) expect(frame.scroll).toBeCloseTo(last.max, 0);
});

test('a late Gantt label jump at 390px reveals the row between Timeline and island', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openExample(page);
	await addWorkspaceOverflow(page);
	const label = page.getByTestId('gantt-label').filter({ hasText: /^Scroll task 36$/ });
	await label.scrollIntoViewIfNeeded();
	await label.click();
	await expect(page.getByRole('tab', { name: 'Work plan', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await waitForFrames(page);
	await waitForAnimations(workspaceContent(page));
	await expect
		.poll(() =>
			row(page, 'Scroll task 36').evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				const timeline = document.querySelector('#timeline')!.getBoundingClientRect();
				const island = document
					.querySelector('[data-testid="workspace-tabs"]')!
					.getBoundingClientRect();
				const stage = element.closest('[data-testid="stage"]')!;
				const header = stage.querySelector(':scope > header')!.getBoundingClientRect();
				const band = stage.querySelector('[data-testid="stage-band"]')!.getBoundingClientRect();
				const content = document.querySelector<HTMLElement>('[data-testid="workspace-content"]')!;
				return {
					belowStack: bounds.top >= Math.max(timeline.bottom, header.bottom, band.bottom) - 0.5,
					aboveIsland: bounds.bottom <= island.top - 1,
					groupScrolled: content.scrollTop > 0,
					documentScroll: window.scrollY
				};
			})
		)
		.toEqual({ belowStack: true, aboveIsland: true, groupScrolled: true, documentScroll: 0 });
});
