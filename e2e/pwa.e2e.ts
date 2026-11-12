import { expect, test } from '@playwright/test';
import {
	appFontLoaded,
	expectExampleSheetLegends,
	expectMilestoneRing,
	expectStageRule,
	selectTab,
	writeStoredPlan,
	expectStickyBelowHeader,
	expectStickyStageStack,
	openApp,
	openExample,
	stage,
	collapseTimeline,
	expandTimeline,
	expectTimelineCollapsed,
	openPreview,
	openLinePlan,
	ganttRow,
	expectStationStatus,
	setTaskStatus,
	row
} from './helpers.ts';

test.describe('PWA', () => {
	test('the manifest is linked and describes the app', async ({ page, request }) => {
		await openApp(page);
		const href = await page.locator('link[rel="manifest"]').getAttribute('href');
		expect(href).toBeTruthy();
		const response = await request.get(new URL(href!, page.url()).href);
		expect(response.ok()).toBe(true);
		const manifest = await response.json();
		expect(manifest).toMatchObject({
			name: 'Taktblatt',
			start_url: '.',
			display: 'standalone'
		});
		expect(manifest.theme_color).toBeTruthy();
		const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
		expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
		expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(
			true
		);
		for (const icon of manifest.icons) {
			const png = await request.get(new URL(icon.src, response.url()).href);
			expect(png.ok()).toBe(true);
			expect(png.headers()['content-type']).toContain('image/png');
		}
	});

	test('the app loads offline after the first visit', async ({ page, context }) => {
		await openExample(page);
		await page.getByTestId('gantt-pin').click();
		await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
		// The worker takes control of the page after it activates.
		await expect
			.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
			.toBe(true);
		await context.setOffline(true);
		await page.reload();
		await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
		expect(await appFontLoaded(page)).toBe(true);
		await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'true');
		await expectStickyBelowHeader(page.getByTestId('timeline-panel'));
		const panel = page.getByTestId('timeline-panel');
		const toggle = page.getByTestId('timeline-legends-toggle');
		const bands = panel.getByRole('list', { name: 'Bands', exact: true });
		await bands.scrollIntoViewIfNeeded();
		await expect(bands).toBeVisible();
		await expect(bands).toBeInViewport();
		await expect(bands).toContainText('Frost risk');
		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await page.reload();
		await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
		await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'true');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(page.getByTestId('timeline-legends')).toBeHidden();
		await toggle.click();
		await bands.scrollIntoViewIfNeeded();
		await expect(bands).toBeVisible();
		await expect(bands).toBeInViewport();
		await expect(bands).toContainText('Frost risk');
		await expectStickyStageStack(stage(page, 0));
		await context.setOffline(false);
	});

	test('tabs Keep open, handle collapse and Preview work after an offline reload', async ({
		page,
		context
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openExample(page);
		await writeStoredPlan(page, (plan) => {
			plan.milestones[0].symbol = 'diamond';
		});
		const keep = page.getByTestId('timeline-keep-open');
		await keep.click();
		await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
		await expect
			.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
			.toBe(true);
		try {
			await context.setOffline(true);
			await page.reload();
			await expect(keep).toHaveAttribute('aria-pressed', 'true');
			await collapseTimeline(page);
			await page.reload();
			await expectTimelineCollapsed(page);
			await expandTimeline(page);
			await expect(keep).toHaveAttribute('aria-pressed', 'true');
			await openPreview(page);
			await expectExampleSheetLegends(page);
			await page.keyboard.press('Escape');
			await expectMilestoneRing(page.getByTestId('gantt-milestone').first());
			await selectTab(page, 'Work plan');
			await expect(stage(page, 0).locator('header .stage-badge')).toHaveText('S1');
			await expectStageRule(stage(page, 0));
			await stage(page, 0).getByTestId('stage-title').click();
			await page.keyboard.press('ControlOrMeta+a');
			await page.keyboard.type('Offline stage');
			await page.keyboard.press('Enter');
			await page.reload();
			await expect(stage(page, 0).getByTestId('stage-title')).toHaveText('Offline stage');
			await expectStageRule(stage(page, 0));
			await openPreview(page);
			await expectMilestoneRing(
				page
					.getByTestId('sheet')
					.first()
					.getByRole('img', { name: /^Milestone M1:/ })
			);
			await expect(
				page
					.getByTestId('sheet')
					.getByRole('list', { name: 'Stages', exact: true })
					.locator('.stage-badge')
					.first()
			).toHaveText('S1');
		} finally {
			await context.setOffline(false);
		}
	});
});

test('stations, connectors and Preview work after offline reload and a persisted status edit', async ({
	page,
	context
}) => {
	await openLinePlan(page);
	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);
	try {
		await context.setOffline(true);
		await page.reload();
		const mark = ganttRow(page, 'Source').getByTestId('gantt-bar');
		await expectStationStatus(mark, 'todo');
		const lines = page.getByTestId('gantt-dependency');
		await expect(lines).toHaveCount(5);
		await setTaskStatus(page, row(page, 'Source'), 'done');
		await page.reload();
		await expectStationStatus(mark, 'done');
		await expect(mark).toHaveAccessibleName(/, done$/);
		await openPreview(page);
		const paper = page
			.getByTestId('sheet')
			.first()
			.getByTestId('sheet-gantt-bar')
			.and(page.getByRole('img', { name: /^Source:/ }));
		await expectStationStatus(paper, 'done', true);
		await expect(page.getByTestId('sheet-gantt-dependency')).toHaveCount(5);
	} finally {
		await context.setOffline(false);
	}
});
