import { expect, test } from '@playwright/test';
import {
	addWorkspaceOverflow,
	expectBadgeContrast,
	changePlanInOtherTab,
	expectJumpTarget,
	expectMilestoneRing,
	expectStageRule,
	expectStickyStageStack,
	expectTodayLine,
	expectTokenPaint,
	focusPreviousControl,
	openExample,
	openPreview,
	row,
	selectTab,
	stage,
	storedPlan,
	todayTagGeometry,
	waitForAnimations,
	waitForFrames,
	writeStoredPlan
} from './helpers.ts';

for (const width of [1800, 390]) {
	test(`stage badges and the 2 px rule clear wrapped headings, jumps and keyboard focus at ${width}px`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height: 900 });
		await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
		await openExample(page);
		await addWorkspaceOverflow(page);
		await writeStoredPlan(page, (plan) => {
			plan.stages[0].title = 'Prepare beds, paths and soil';
		});
		const heading = stage(page, 0).locator(':scope > header');
		const badge = heading.locator('.stage-badge');
		await selectTab(page, 'Work plan');
		await expect(badge).toHaveText('S1');
		await expect(heading.getByTestId('stage-color')).toBeVisible();
		if (width === 390) {
			await expect.poll(async () => (await heading.boundingBox())!.height).toBeGreaterThan(40);
		}
		await expectStickyStageStack(stage(page, 0));
		await expectStageRule(stage(page, 0));
		const control = row(page, 'Scroll task 24').getByTestId('task-details');
		await focusPreviousControl(control);
		await page.keyboard.press('Tab');
		await expect(control).toBeFocused();
		await expectJumpTarget(page, 'Scroll task 24');
		await selectTab(page, 'Overview');
		const label = page.getByTestId('gantt-label').filter({ hasText: /^Scroll task 24$/ });
		await label.scrollIntoViewIfNeeded();
		await label.press('Enter');
		await expectJumpTarget(page, 'Scroll task 24');
	});
}

test('headings, split legends, tabs rail and paper use matching badges after a keyboard color change', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
	await page.setViewportSize({ width: 1800, height: 900 });
	await openExample(page);
	const picker = stage(page, 0).getByTestId('stage-color');
	await picker.focus();
	await picker.press('Enter');
	const palette = page.getByRole('radiogroup');
	await expect(palette).toBeVisible();
	await waitForAnimations(page.locator('[data-slot="popover-content"]'));
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');
	await expect(palette).toHaveCount(0);
	await expect(picker).toBeFocused();
	const color = (await storedPlan(page)).stages[0].color;
	expect(color).toBe('slate');
	const headingBadge = stage(page, 0).locator('header .stage-badge');
	const legendBadge = page.getByTestId('stage-legend').locator('.stage-badge').first();
	const fill = await headingBadge.evaluate((element) => getComputedStyle(element).backgroundColor);
	for (const theme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: theme });
		await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
		await expect(headingBadge).toHaveText('S1');
		await expect(legendBadge).toHaveText('S1');
		await waitForAnimations(headingBadge);
		await waitForAnimations(legendBadge);
		await expectBadgeContrast(headingBadge);
		await expectBadgeContrast(legendBadge);
		await expect
			.poll(() => legendBadge.evaluate((element) => getComputedStyle(element).backgroundColor))
			.toBe(await headingBadge.evaluate((element) => getComputedStyle(element).backgroundColor));
	}
	await page.setViewportSize({ width: 800, height: 900 });
	await waitForAnimations(page.getByTestId('workspace-content'));
	await expect(legendBadge).toHaveText('S1');
	await expect(page.getByTestId('stage-legend').locator('.stage-badge')).toHaveText([
		'S1',
		'S2',
		'S3'
	]);
	await openPreview(page);
	const sheetBadge = page
		.getByTestId('sheet')
		.getByRole('list', { name: 'Stages', exact: true })
		.locator('.stage-badge')
		.first();
	await expect(sheetBadge).toHaveText('S1');
	await expectBadgeContrast(sheetBadge);
	await expect(sheetBadge).toHaveCSS('background-color', fill);
	await expect(sheetBadge).toHaveCSS('color', 'rgb(255, 255, 255)');
});

test.describe('Today tag geometry', () => {
	test.use({ timezoneId: 'America/Los_Angeles' });

	for (const reducedMotion of ['no-preference', 'reduce'] as const) {
		test(`the local Today tag flips with moving milestones without moving its row (${reducedMotion})`, async ({
			page
		}) => {
			await page.clock.setFixedTime(new Date('2027-01-16T00:30:00Z'));
			await page.emulateMedia({ reducedMotion });
			await openExample(page);
			await writeStoredPlan(page, (plan) => {
				plan.range = { start: '2027-01-01', end: '2027-02-28' };
				plan.footer.date = '2027-02-10';
				plan.milestones = [
					{
						id: 'near-today',
						title: 'Review',
						description: '',
						date: '2027-02-15',
						symbol: 'diamond'
					}
				];
			});
			const chart = page.getByTestId('gantt');
			const tag = chart.getByTestId('gantt-today-label');
			await expect(tag).toHaveText('Today');
			await expectTodayLine(chart.getByTestId('gantt-today'));
			const before = await todayTagGeometry(chart);
			expect(before.inRow).toBe(true);
			expect(before.tagLeft).toBeGreaterThanOrEqual(before.line);
			// Jan 15 is the browser's local date; UTC is Jan 16 and the footer date differs.
			const local = await chart.getByTestId('gantt-today').evaluate((line) => {
				const bounds = line.parentElement!.getBoundingClientRect();
				return (line.getBoundingClientRect().left - bounds.left) / bounds.width;
			});
			expect(local).toBeCloseTo(14.5 / 59, 2);
			const monitor = await startTodayMonitor(chart);
			await changePlanInOtherTab(page, (plan) => {
				plan.milestones[0].date = '2027-01-16';
			});
			await expect
				.poll(async () => {
					const geometry = await todayTagGeometry(chart);
					return geometry.inRow && geometry.tagRight <= geometry.line + 0.5;
				})
				.toBe(true);
			await waitForFrames(page, 24);
			const frames = await monitor.evaluate((state) => {
				state.stopped = true;
				return state.frames;
			});
			await monitor.dispose();
			const after = await todayTagGeometry(chart);
			expect(after.rowHeight).toBe(before.rowHeight);
			expect(frames.every((frame) => frame.height === before.rowHeight)).toBe(true);
			const start = before.tagLeft - before.line;
			const end = after.tagLeft - after.line;
			const intermediate = frames.filter(
				(frame) => Math.abs(frame.offset - start) > 1 && Math.abs(frame.offset - end) > 1
			);
			if (reducedMotion === 'reduce') expect(intermediate).toHaveLength(0);
			else expect(intermediate.length).toBeGreaterThan(0);
			await expectTokenPaint(tag, 'background-color', '--foreground');
			await expectTokenPaint(tag, 'color', '--background');
			await chart.getByTestId('gantt-bar').first().focus();
			await expectTodayLine(chart.getByTestId('gantt-today'));
			// A narrower range moves the same milestone beyond the tag width.
			await changePlanInOtherTab(page, (plan) => {
				plan.range = { start: '2027-01-11', end: '2027-01-20' };
			});
			await expect
				.poll(async () => {
					const geometry = await todayTagGeometry(chart);
					return (
						geometry.inRow &&
						geometry.tagLeft >= geometry.line &&
						geometry.tagRight < geometry.markLeft
					);
				})
				.toBe(true);
			await changePlanInOtherTab(page, (plan) => {
				plan.range = { start: '2027-01-01', end: '2027-02-28' };
				plan.milestones[0].date = '2027-02-15';
			});
			await expect
				.poll(async () => {
					const geometry = await todayTagGeometry(chart);
					return geometry.tagLeft >= geometry.line;
				})
				.toBe(true);
		});
	}

	test('a milestone crossing Today flips the tag from its current position during normal motion', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1800, height: 900 });
		await page.clock.setFixedTime(new Date('2027-01-16T00:30:00Z'));
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await openExample(page);
		await writeStoredPlan(page, (plan) => {
			plan.range = { start: '2027-01-01', end: '2027-02-28' };
			plan.milestones = [
				{
					id: 'crossing-today',
					title: 'Review',
					description: '',
					date: '2027-02-15',
					symbol: 'diamond'
				}
			];
		});
		const chart = page.getByTestId('gantt');
		const before = await todayTagGeometry(chart);
		expect(before.inRow).toBe(true);
		expect(before.tagLeft).toBeGreaterThanOrEqual(before.line);
		expect(before.markLeft).toBeGreaterThan(before.tagRight);
		await expect(chart.getByTestId('gantt-today-label')).toHaveAttribute('data-side', 'right');
		const monitor = await startTodayMonitor(chart);
		await changePlanInOtherTab(page, (plan) => {
			plan.milestones[0].date = '2027-01-08';
		});
		await expect
			.poll(async () => {
				const geometry = await todayTagGeometry(chart);
				return geometry.markRight < geometry.line && geometry.tagLeft >= geometry.line;
			})
			.toBe(true);
		await waitForFrames(page, 24);
		const frames = await monitor.evaluate((state) => {
			state.stopped = true;
			return state.frames;
		});
		await monitor.dispose();
		const after = await todayTagGeometry(chart);
		expect(
			frames.some(
				(frame) => frame.markLeft < before.markLeft - 1 && frame.markRight > after.markRight + 1
			),
			'The monitor must sample the moving milestone between its endpoints'
		).toBe(true);
		expect(frames.every((frame) => frame.inRow)).toBe(true);
		const firstContact = frames.findIndex(
			(frame) => frame.markLeft <= frame.line + frame.tagWidth && frame.markRight >= frame.line
		);
		expect(
			firstContact,
			'The monitor must sample the mark in the right-side tag zone'
		).toBeGreaterThanOrEqual(0);
		expect(
			frames[firstContact].side,
			'The target side must be left by the first frame that the current mark enters the tag zone'
		).toBe('left');
		await expect(chart.getByTestId('gantt-today-label')).toHaveAttribute('data-side', 'right');
	});

	test('the Today tag stays inside the date area at both range edges', async ({ page }) => {
		await page.setViewportSize({ width: 1800, height: 900 });
		await page.clock.setFixedTime(new Date('2027-01-16T00:30:00Z'));
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await openExample(page);
		for (const edge of ['start', 'end'] as const) {
			await writeStoredPlan(page, (plan) => {
				plan.range =
					edge === 'start'
						? { start: '2027-01-15', end: '2027-03-15' }
						: { start: '2026-11-15', end: '2027-01-15' };
				plan.milestones =
					edge === 'start'
						? [
								{
									id: 'edge-review',
									title: 'Review',
									description: '',
									date: '2027-01-16',
									symbol: 'diamond'
								}
							]
						: [];
			});
			const chart = page.getByTestId('gantt');
			const tag = chart.getByTestId('gantt-today-label');
			await expect(tag).toBeVisible();
			await expect(tag).toHaveAttribute('data-side', edge === 'start' ? 'right' : 'left');
			await expect
				.poll(async () => {
					const geometry = await todayTagGeometry(chart);
					return (
						geometry.inRow &&
						geometry.tagLeft >= geometry.dateAreaLeft - 0.5 &&
						geometry.tagRight <= geometry.dateAreaRight + 0.5
					);
				})
				.toBe(true);
		}
	});

	test('the tag remeasures its width and hides with an out-of-range local date', async ({
		page
	}) => {
		await page.clock.setFixedTime(new Date('2027-01-16T00:30:00Z'));
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await openExample(page);
		await writeStoredPlan(page, (plan) => {
			plan.range = { start: '2027-01-01', end: '2027-02-28' };
			plan.milestones = [
				{
					id: 'width-review',
					title: 'Review',
					description: '',
					date: '2027-01-22',
					symbol: 'diamond'
				}
			];
		});
		const chart = page.getByTestId('gantt');
		const before = await todayTagGeometry(chart);
		expect(before.tagLeft).toBeGreaterThanOrEqual(before.line);
		// Exercise a width change without remounting or moving the milestone.
		// The wider tag must still fit left of the line, so D30 does not keep it on the right.
		await chart.getByTestId('gantt-today-label').evaluate((tag) => {
			(tag as HTMLElement).style.paddingInline = '40px';
		});
		await expect
			.poll(async () => {
				const geometry = await todayTagGeometry(chart);
				return geometry.tagRight <= geometry.line + 0.5 && geometry.rowHeight === before.rowHeight;
			})
			.toBe(true);
		await changePlanInOtherTab(page, (plan) => {
			plan.range = { start: '2027-02-01', end: '2027-02-28' };
		});
		await expect(chart.getByTestId('gantt-today')).toHaveCount(0);
		await expect(chart.getByTestId('gantt-today-label')).toHaveCount(0);
	});
});

/** Samples the tag and milestone bounds together throughout the storage-driven update. */
async function startTodayMonitor(chart: import('@playwright/test').Locator) {
	return chart.evaluateHandle((chart) => {
		const state = {
			stopped: false,
			frames: [] as {
				offset: number;
				height: number;
				line: number;
				tagWidth: number;
				side: string | null;
				markLeft: number;
				markRight: number;
				inRow: boolean;
			}[]
		};
		const sample = () => {
			if (state.stopped) return;
			const tagElement = chart.querySelector('[data-testid="gantt-today-label"]')!;
			const tag = tagElement.getBoundingClientRect();
			const line = chart.querySelector('[data-testid="gantt-today"]')!.getBoundingClientRect();
			const milestone = chart.querySelector('[data-testid="gantt-milestone"]')!;
			const mark = milestone.querySelector('svg')!.getBoundingClientRect();
			const row = milestone.parentElement!.parentElement!.getBoundingClientRect();
			state.frames.push({
				offset: tag.left - line.left,
				height: row.height,
				line: line.left,
				tagWidth: tag.width,
				side: tagElement.getAttribute('data-side'),
				markLeft: mark.left,
				markRight: mark.right,
				inRow: [tag, mark].every(
					(bounds) => bounds.top >= row.top - 0.5 && bounds.bottom <= row.bottom + 0.5
				)
			});
			requestAnimationFrame(sample);
		};
		requestAnimationFrame(sample);
		return state;
	});
}

test('forced colors retain stage rules and milestone outlines', async ({ page }) => {
	await page.setViewportSize({ width: 1800, height: 900 });
	await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		plan.milestones[0].symbol = 'diamond';
	});
	await expectStageRule(stage(page, 0));
	await expectMilestoneRing(page.getByTestId('gantt-milestone').first());
	// Forced colors replace app tokens with system colors, so the ring must use CanvasText.
	const ring = page.getByTestId('gantt-milestone').first().locator('circle');
	await expect
		.poll(() =>
			ring.evaluate((element) => {
				const probe = document.createElement('span');
				probe.style.color = 'CanvasText';
				document.body.append(probe);
				const system = getComputedStyle(probe).color;
				probe.remove();
				return getComputedStyle(element).stroke === system;
			})
		)
		.toBe(true);
	await page.setViewportSize({ width: 390, height: 900 });
	await selectTab(page, 'Work plan');
	await expectStageRule(stage(page, 0));
});
