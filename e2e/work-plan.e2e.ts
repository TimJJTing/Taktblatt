import { expect, test } from '@playwright/test';
import {
	GANTT_HEIGHT,
	addWorkspaceOverflow,
	timelineHandle,
	defaultPanelHeight,
	expectPanelHeight,
	expectStickyStageStack,
	focusPreviousControl,
	openApp,
	openExample,
	row,
	stage,
	storedPlan,
	titles,
	waitForAnimations,
	setTaskStatus,
	selectTab,
	groupScroller,
	writeStoredPlan
} from './helpers.ts';

test.describe('work plan', () => {
	test('a new task gets a title, and Escape removes an empty new task', async ({ page }) => {
		await openApp(page);
		const undo = page.getByRole('button', { name: 'Undo', exact: true });
		const redo = page.getByRole('button', { name: 'Redo', exact: true });
		await expect(undo).toBeDisabled();
		await expect(redo).toBeDisabled();
		const first = stage(page, 0);
		await first.hover();
		await first.getByTestId('add-task').click();
		await page.keyboard.type('Write brief');
		await page.keyboard.press('Enter');
		await expect(first.getByTestId('task-title')).toHaveText(['Write brief']);

		await first.getByTestId('add-task').click();
		await page.keyboard.press('Escape');
		await expect(first.getByTestId('task-row')).toHaveCount(1);
		// The empty row left no undo step. Undo reverts the title, then the new task.
		await expect(redo).toBeDisabled();
		await undo.click();
		await expect(first.getByTestId('task-title')).toHaveText(['New task']);
		await undo.click();
		await expect(first.getByTestId('task-row')).toHaveCount(0);
		await expect(undo).toBeDisabled();
		// Redo restores the new task, then its title.
		await redo.click();
		await expect(first.getByTestId('task-title')).toHaveText(['New task']);
		await redo.click();
		await expect(first.getByTestId('task-title')).toHaveText(['Write brief']);
		await expect(redo).toBeDisabled();
	});

	test('Enter commits and moves to the same column in the next row', async ({ page }) => {
		await openExample(page);
		const first = stage(page, 0);
		await first.getByTestId('task-deliverable').first().click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('Site map');
		await page.keyboard.press('Enter');
		await expect(first.getByTestId('task-deliverable').first()).toHaveText('Site map');
		await expect(first.getByTestId('task-deliverable').nth(1)).toBeFocused();
	});

	test('the status select updates the stage progress and the ready light', async ({ page }) => {
		await openExample(page);
		const grow = stage(page, 1);
		await expect(grow.getByTestId('stage-progress')).toContainText('0 / 2');
		// "First harvest" depends on "Sowing". Marking "Sowing" done turns on the ready light of "First harvest".
		const harvest = row(page, 'First harvest');
		await expect(harvest.getByTestId('ready-dot')).toHaveCount(0);
		await setTaskStatus(page, row(page, 'Sowing'), 'done');
		await expect(grow.getByTestId('stage-progress')).toContainText('1 / 2');
		await expect(harvest.getByTestId('ready-dot')).toBeVisible();
	});

	test('status changes are one history step; opening, closing and reselecting are not', async ({
		page
	}) => {
		await openExample(page);
		await writeStoredPlan(page, (plan) => {
			plan.tasks.find((task) => task.title === 'Sowing')!.status = 'todo';
		});
		const task = row(page, 'Sowing');
		const trigger = task.getByTestId('task-status');
		const undo = page.getByRole('button', { name: 'Undo', exact: true });
		const redo = page.getByRole('button', { name: 'Redo', exact: true });
		await expect(undo).toBeDisabled();
		await expect(redo).toBeDisabled();
		await trigger.click();
		await expect(page.getByRole('listbox')).toBeVisible();
		await waitForAnimations(page.getByRole('listbox'));
		await page.keyboard.press('Escape');
		await expect(page.getByRole('listbox')).toHaveCount(0);
		await expect(trigger).toBeFocused();
		await setTaskStatus(page, task, 'todo');
		await expect(undo).toBeDisabled();
		await setTaskStatus(page, task, 'in_progress');
		await expect(trigger).toHaveAccessibleName('Status of Sowing: In progress');
		await expect(task).not.toHaveClass(/text-muted-foreground/);
		await undo.click();
		await expect(trigger).toHaveAccessibleName('Status of Sowing: Todo');
		await expect(undo).toBeDisabled();
		await redo.click();
		await expect(trigger).toHaveAccessibleName('Status of Sowing: In progress');
		await expect(redo).toBeDisabled();
		await setTaskStatus(page, task, 'done');
		await expect(task).toHaveClass(/text-muted-foreground/);
	});

	test('the fourth status cancels and mutes a task in one undo step', async ({ page }) => {
		await openExample(page);
		// Loading the example is an undo step. A reload starts with an empty history.
		await page.reload();
		await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
		const task = row(page, 'Sowing');
		const trigger = task.getByTestId('task-status');
		const undo = page.getByRole('button', { name: 'Undo', exact: true });
		await expect(undo).toBeDisabled();
		await trigger.click();
		await expect(page.getByRole('option')).toHaveText(['Todo', 'In progress', 'Done', 'Canceled']);
		await page.keyboard.press('Escape');
		await setTaskStatus(page, task, 'canceled');
		await expect(trigger).toHaveAccessibleName('Status of Sowing: Canceled');
		await expect(task).toHaveClass(/text-muted-foreground/);
		await expect(task.getByTestId('task-title')).toHaveClass(/line-through/);
		await undo.click();
		await expect(trigger).toHaveAccessibleName('Status of Sowing: Todo');
		await expect(task).not.toHaveClass(/text-muted-foreground/);
		await expect(undo).toBeDisabled();
	});

	test('keyboard selects the next status and returns focus to the trigger', async ({ page }) => {
		await openExample(page);
		await writeStoredPlan(page, (plan) => {
			plan.tasks.find((task) => task.title === 'Sowing')!.status = 'todo';
		});
		const trigger = row(page, 'Sowing').getByTestId('task-status');
		await focusPreviousControl(trigger);
		await page.keyboard.press('Tab');
		await expect(trigger).toBeFocused();
		await page.keyboard.press('Enter');
		const listbox = page.getByRole('listbox');
		await expect(listbox).toBeVisible();
		await waitForAnimations(listbox);
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Enter');
		await expect(listbox).toHaveCount(0);
		await expect(trigger).toBeFocused();
		await expect(trigger).toHaveAccessibleName('Status of Sowing: In progress');
		await page.keyboard.press('Space');
		await expect(listbox).toBeVisible();
		await waitForAnimations(listbox);
		await page.keyboard.press('Escape');
		await expect(listbox).toHaveCount(0);
		await expect(trigger).toBeFocused();
		await expect(trigger).toHaveAccessibleName('Status of Sowing: In progress');
	});

	test('the parent status is disabled and its hint wrapper gets keyboard focus', async ({
		page
	}) => {
		await openExample(page);
		const parent = row(page, 'Soil preparation');
		const trigger = parent.getByTestId('task-status');
		await expect(trigger).toBeDisabled();
		const wrapper = parent
			.locator('[data-slot="tooltip-trigger"]')
			.filter({ has: page.getByTestId('task-status') });
		await wrapper.focus();
		await expect(wrapper).toBeFocused();
	});

	test('the task dialog changes the shared status and the table shows the result', async ({
		page
	}) => {
		await openExample(page);
		await writeStoredPlan(page, (plan) => {
			plan.tasks.find((task) => task.title === 'Sowing')!.status = 'todo';
		});
		await row(page, 'Sowing').getByTestId('task-details').click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await waitForAnimations(dialog);
		await setTaskStatus(page, dialog, 'in_progress');
		await expect(dialog.getByTestId('task-status')).toContainText('In progress');
		await dialog.getByTestId('task-status').click();
		await expect(page.getByRole('option')).toHaveText(['Todo', 'In progress', 'Done', 'Canceled']);
		await page.keyboard.press('Escape');
		await setTaskStatus(page, dialog, 'canceled');
		await expect(dialog.getByTestId('task-status')).toContainText('Canceled');
		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);
		await expect(row(page, 'Sowing').getByTestId('task-status')).toHaveAccessibleName(
			'Status of Sowing: Canceled'
		);
	});

	test('stage progress includes in-progress tasks and hides that clause at zero', async ({
		page
	}) => {
		await openExample(page);
		await writeStoredPlan(page, (plan) => {
			const tasks = plan.tasks.filter((task) => task.parentId === null).slice(0, 3);
			plan.tasks = tasks;
			for (const [index, task] of tasks.entries()) {
				task.stageId = plan.stages[0].id;
				task.dependsOn = [];
				task.status = ['done', 'in_progress', 'todo'][index];
				task.title = ['Progress done', 'Progress working', 'Progress todo'][index];
			}
		});
		const first = stage(page, 0);
		const progress = first.getByTestId('stage-progress');
		await expect(progress).toContainText('1 / 3 done · 1 in progress');
		const working = row(page, 'Progress working');
		await setTaskStatus(page, working, 'todo');
		await expect(progress).toContainText('1 / 3 done');
		await expect(progress).not.toContainText('in progress');
	});

	test('the ready light does not move the title', async ({ page }) => {
		await openExample(page);
		const harvest = row(page, 'First harvest');
		const label = page.getByTestId('gantt-label').filter({ hasText: 'First harvest' });
		const left = async () => {
			const [title, gantt] = await Promise.all([
				harvest.getByTestId('task-title').boundingBox(),
				label.boundingBox()
			]);
			return [Math.round(title!.x), Math.round(gantt!.x)];
		};
		await expect(harvest.getByTestId('ready-dot')).toHaveCount(0);
		const before = await left();
		await setTaskStatus(page, row(page, 'Sowing'), 'done');
		await expect(harvest.getByTestId('ready-dot')).toHaveCount(1);
		// Read both positions in one snapshot. Retry them together.
		await expect.poll(left).toEqual(before);
	});

	test("a new subtask's owner is added to the parent's owners", async ({ page }) => {
		await openExample(page);
		const first = stage(page, 0);
		const parent = row(page, 'Soil preparation');
		await parent.getByTestId('task-toggle').click();
		await expect(parent.getByTestId('task-toggle')).toHaveAttribute('aria-expanded', 'true');
		await parent.hover();
		await first.locator('tbody', { has: parent }).getByTestId('add-subtask').click();
		await page.keyboard.type('Mulch');
		await page.keyboard.press('Enter');
		await expect(titles(page, 0)).toHaveText([
			'Site survey',
			'Soil preparation',
			'Soil test',
			'Add compost',
			'Mulch',
			'Order seeds'
		]);
		await row(page, 'Mulch').getByTestId('owner-field').click();
		await page.getByTestId('owner-input').fill('Mira');
		await page.getByTestId('owner-input').press('Enter');
		await page.keyboard.press('Escape');
		// The cell can fold extra owners into "+N". The accessible name lists all owners.
		await expect(parent.getByRole('button', { name: /^Owner:/ })).toHaveAccessibleName(/Mira/);
		await expect
			.poll(
				async () =>
					(await storedPlan(page)).tasks.find((task) => task.title === 'Soil preparation').owners
			)
			.toContain('Mira');
	});

	test('a date change re-sorts the tasks', async ({ page }) => {
		await openExample(page);
		await expect(titles(page, 1)).toHaveText(['Sowing', 'Watering rota']);
		const watering = row(page, 'Watering rota');
		await watering.getByTestId('task-target').click();
		await page.getByTestId('date-start').fill('2020-01-01');
		await page.getByTestId('date-start').press('Enter');
		await page.getByRole('button', { name: 'Done', exact: true }).click();
		await expect(titles(page, 1)).toHaveText(['Watering rota', 'Sowing']);
	});

	test('owners can be added and renamed everywhere', async ({ page }) => {
		await openExample(page);
		await row(page, 'Neighbourhood stall').getByTestId('task-toggle').click();
		const stall = row(page, 'Book a table');
		await stall.getByTestId('owner-field').click();
		await page.getByTestId('owner-input').fill('Lee');
		await page.getByTestId('owner-input').press('Enter');
		await page.keyboard.press('Escape');
		await expect(stall.getByTestId('owner-field')).toContainText('Lee');

		await stall.getByTestId('owner-field').click();
		await page.getByRole('button', { name: 'Rename “Kai” everywhere' }).click();
		await page.getByRole('menuitem', { name: 'Rename everywhere…' }).click();
		await page.getByRole('dialog').getByRole('textbox').fill('Kairo');
		await page.getByRole('dialog').getByRole('button', { name: 'Rename' }).click();
		await expect(page.getByText('Kai', { exact: true })).toHaveCount(0);
		await expect(page.getByText('Kairo', { exact: true }).first()).toBeVisible();
	});

	test('stages can be added, renamed, recolored, moved and deleted', async ({ page }) => {
		await openExample(page);
		await page.getByTestId('add-stage').click();
		await expect(page.getByTestId('stage')).toHaveCount(4);
		const last = stage(page, 3);
		await last.getByTestId('stage-title').click();
		await page.keyboard.type('Review');
		await page.keyboard.press('Enter');
		await expect(last.getByTestId('stage-title')).toHaveText('Review');

		await last.getByTestId('stage-color').click();
		await page.getByRole('radio', { name: 'violet' }).click();
		await expect(last.getByTestId('stage-color')).toHaveAttribute(
			'aria-label',
			'Stage color: violet'
		);

		await last.getByTestId('stage-menu').click();
		await page.getByRole('menuitem', { name: 'Move up' }).click();
		await expect(stage(page, 2).getByTestId('stage-title')).toHaveText('Review');

		await stage(page, 0).getByTestId('stage-menu').click();
		await page.getByRole('menuitem', { name: 'Delete stage…' }).click();
		await expect(page.getByRole('alertdialog')).toContainText('The app deletes “Prepare”.');
		await expect(page.getByRole('alertdialog')).toContainText('Tasks deleted with the stage: 5');
		await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByTestId('stage')).toHaveCount(3);
	});

	test('the stage color picker does not scroll the Work plan region', async ({ page }) => {
		await page.setViewportSize({ width: 1000, height: 500 });
		await openExample(page);
		await selectTab(page, 'Work plan');
		for (let i = 0; i < 3; i++) await page.getByTestId('add-stage').click();
		const swatch = stage(page, 5).getByTestId('stage-color');
		await swatch.scrollIntoViewIfNeeded();
		// Put the swatch near the bottom edge, so the popover opens below the fold.
		const scroller = await groupScroller(page, 'work-plan');
		await scroller.evaluate((element) => (element.scrollTop += 80));
		const monitor = await scroller.evaluateHandle((element) => {
			const baseline = element.scrollTop;
			const positions = [baseline];
			const record = () => positions.push(element.scrollTop);
			let frame: number;
			const sample = () => {
				record();
				frame = requestAnimationFrame(sample);
			};
			element.addEventListener('scroll', record);
			frame = requestAnimationFrame(sample);
			return {
				baseline,
				positions,
				element,
				stop() {
					element.removeEventListener('scroll', record);
					cancelAnimationFrame(frame);
				}
			};
		});
		const assertNoScroll = async () => {
			await page.evaluate(
				() =>
					new Promise<void>((resolve) => {
						requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
					})
			);
			const state = await monitor.evaluate(({ baseline, positions, element }) => ({
				baseline,
				positions,
				current: element.scrollTop
			}));
			expect(state.positions.filter((position) => position !== state.baseline)).toEqual([]);
			expect(state.current).toBe(state.baseline);
		};
		try {
			expect(await monitor.evaluate(({ baseline }) => baseline)).toBeGreaterThan(0);
			await swatch.click();
			const palette = page.getByRole('radiogroup');
			const content = page.locator('[data-slot="popover-content"]');
			await expect(palette).toBeVisible();
			await expect(palette.getByRole('radio', { checked: true })).toBeFocused();
			await waitForAnimations(content);
			await assertNoScroll();
			await palette.getByRole('radio', { name: /^violet\b/ }).click();
			await expect(swatch).toHaveAttribute('aria-label', 'Stage color: violet');
			await expect(swatch).toBeFocused();
			await expect(palette).toHaveCount(0);
			await expect(content).toHaveCount(0);
			await assertNoScroll();
		} finally {
			await monitor.evaluate((state) => state.stop());
			await monitor.dispose();
		}
	});

	test('a stage keeps its title and colored column header at the top of its region while scrolling', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1000, height: 400 });
		await openExample(page);
		await addWorkspaceOverflow(page);
		await selectTab(page, 'Work plan');
		await expectStickyStageStack(stage(page, 0));
	});

	test('on a narrow screen the header cells stay in the table', async ({ page }) => {
		await page.setViewportSize({ width: 600, height: 400 });
		await openExample(page);
		await selectTab(page, 'Work plan');
		const section = stage(page, 0);
		// Measure both in one call, so a layout change cannot fall between two measurements.
		await expect
			.poll(() =>
				section.locator('table').evaluate((table) => {
					const cell = table.querySelector('thead th')!;
					return Math.abs(cell.getBoundingClientRect().top - table.getBoundingClientRect().top);
				})
			)
			.toBeLessThanOrEqual(1);
	});

	test('on a narrow screen the stage title and stage badge stay visible while scrolling', async ({
		page
	}) => {
		await page.setViewportSize({ width: 600, height: 400 });
		await openExample(page);
		await addWorkspaceOverflow(page);
		await selectTab(page, 'Work plan');
		const section = stage(page, 0);
		await expectStickyStageStack(section);
		await section.locator('table').evaluate((table) => (table.parentElement!.scrollLeft = 100));
		await expect
			.poll(() => section.locator('table').evaluate((table) => table.parentElement!.scrollLeft))
			.toBeGreaterThan(0);
		await expectStickyStageStack(section);
	});

	for (const width of [1000, 390]) {
		test(`stage headers clear a resized pinned Timeline at ${width} px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 900 });
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await openExample(page);
			await addWorkspaceOverflow(page);
			await selectTab(page, 'Work plan');
			await timelineHandle(page).press('Home');
			await expectPanelHeight(page, GANTT_HEIGHT.minPx);
			await expectStickyStageStack(stage(page, 0));
			await timelineHandle(page).press('PageDown');
			await expectPanelHeight(page, GANTT_HEIGHT.minPx + 90);
			await expectStickyStageStack(stage(page, 0));
		});
	}

	for (const width of [1000, 390]) {
		test(`the pinned Timeline covers outgoing stage headers at ${width} px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 900 });
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await openExample(page);
			await addWorkspaceOverflow(page);
			await selectTab(page, 'Work plan');
			await expectPanelHeight(page, defaultPanelHeight(page));
			const first = stage(page, 0);
			await expectStickyStageStack(first);
			for (const remaining of [0.75, 0.5, 0.25]) {
				await first.evaluate(async (element, fraction) => {
					const scroller = document.querySelector<HTMLElement>(
						'[data-testid="workspace-content"]'
					)!;
					const panel = document
						.querySelector('[data-testid="timeline-panel"]')!
						.getBoundingClientRect();
					const header = element.querySelector(':scope > header')!.getBoundingClientRect();
					scroller.scrollTop +=
						element.getBoundingClientRect().bottom - panel.bottom - header.height * fraction;
					await new Promise(requestAnimationFrame);
				}, remaining);
				// Read overlap and the painted target together while the stage header leaves its scope.
				await expect
					.poll(() =>
						first.evaluate((element) => {
							const panel = document.querySelector('[data-testid="timeline-panel"]')!;
							const panelBox = panel.getBoundingClientRect();
							const header = element.querySelector(':scope > header')!.getBoundingClientRect();
							const top = Math.max(panelBox.top, header.top);
							const bottom = Math.min(panelBox.bottom, header.bottom);
							const left = Math.max(panelBox.left, header.left);
							const right = Math.min(panelBox.right, header.right);
							const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
							return {
								overlaps: bottom - top > 1 && right > left,
								timelineOnTop: hit !== null && panel.contains(hit)
							};
						})
					)
					.toEqual({ overlaps: true, timelineOnTop: true });
			}
		});
	}

	test('stage header offsets follow height changes and release at the next stage', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1000, height: 700 });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await openExample(page);
		await addWorkspaceOverflow(page);
		await selectTab(page, 'Work plan');
		const first = stage(page, 0);
		const header = first.locator(':scope > header');
		const headerHeight = () => header.evaluate((element) => element.getBoundingClientRect().height);
		await expectStickyStageStack(first);
		const wideHeight = await headerHeight();
		// A taller header moves the sticky stack below it.
		await header.evaluate((element, height) => {
			(element as HTMLElement).style.minHeight = `${height + 24}px`;
		}, wideHeight);
		await expect.poll(headerHeight).toBeCloseTo(wideHeight + 24, 0);
		await expectStickyStageStack(first);
		// Clear the forced height. The sticky stack follows the header back to its natural height.
		await header.evaluate((element) => ((element as HTMLElement).style.minHeight = ''));
		await expect.poll(headerHeight).toBeCloseTo(wideHeight, 0);
		await expectStickyStageStack(first);
		// At a narrow width, the stack uses the natural header height, not a forced one.
		await page.setViewportSize({ width: 390, height: 700 });
		await expectStickyStageStack(first);
		await expectStickyStageStack(stage(page, 1));
		await expect
			.poll(() =>
				first.evaluate((element) => {
					const header = element.querySelector(':scope > header')!.getBoundingClientRect();
					const next = document
						.querySelectorAll('[data-testid="stage"]')[1]
						.querySelector(':scope > header')!
						.getBoundingClientRect();
					return header.bottom <= next.top;
				})
			)
			.toBe(true);
		const menu = stage(page, 1).getByTestId('stage-menu');
		await menu.focus();
		await menu.press('Enter');
		await expect(page.getByRole('menuitem', { name: 'Move up' })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(menu).toBeFocused();
	});

	for (const pinned of [false, true]) {
		test(`Tab reveals a task control below the full sticky stage stack (pinned: ${pinned})`, async ({
			page
		}) => {
			await page.setViewportSize({ width: 1280, height: 800 });
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await openExample(page);
			await addWorkspaceOverflow(page);
			if (pinned) {
				await page.getByTestId('gantt-pin').click();
				await page.getByTestId('gantt-resize').press('Home');
				await expectPanelHeight(page, GANTT_HEIGHT.minPx);
			}
			const first = stage(page, 0);
			const checkbox = first.getByTestId('task-status').first();
			await checkbox.evaluate(async (element) => {
				const scroller = document.querySelector<HTMLElement>('#work-pane')!;
				const header = element
					.closest('[data-testid="stage"]')!
					.querySelector(':scope > header')!
					.getBoundingClientRect();
				const bounds = element.getBoundingClientRect();
				const center = scroller.getBoundingClientRect().top + header.height / 2;
				scroller.scrollTop += bounds.top + bounds.height / 2 - center;
				await new Promise(requestAnimationFrame);
			});
			await focusPreviousControl(checkbox);
			await page.keyboard.press('Tab');
			await expect(checkbox).toBeFocused();
			await expect
				.poll(() =>
					checkbox.evaluate((element) => {
						const section = element.closest('[data-testid="stage"]')!;
						const header = section.querySelector(':scope > header')!.getBoundingClientRect();
						const columns = section.querySelector('thead th')!.getBoundingClientRect();
						const bounds = element.getBoundingClientRect();
						const hit = document.elementFromPoint(
							bounds.left + bounds.width / 2,
							bounds.top + bounds.height / 2
						);
						return (
							bounds.top >= Math.max(header.bottom, columns.bottom) - 1 &&
							(hit === element || element.contains(hit))
						);
					})
				)
				.toBe(true);
		});
	}

	test('a stage moves with the keyboard drag handle', async ({ page }) => {
		await openExample(page);
		const stageTitles = page.getByTestId('stage-title');
		const [first, second] = await stageTitles.allTextContents();
		const handle = page.getByLabel('Drag to reorder the stage');
		await handle.first().focus();
		await expect(handle.first()).toBeFocused();
		await page.keyboard.press('Space');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Space');
		await expect(stageTitles.first()).toHaveText(second);
		await expect(stageTitles.nth(1)).toHaveText(first);
		await expect(handle.first()).toHaveAttribute('tabindex', '0');
	});

	test('the add-task line sits against the table, and the add buttons shrink by level', async ({
		page
	}) => {
		await openExample(page);
		const first = stage(page, 0);
		// Read one layout snapshot. Retry all checks while the rows animate.
		await expect(async () => {
			const layout = await first.evaluate((element) => {
				const table = element.querySelector('table')!.getBoundingClientRect();
				const addTask = element.querySelector('[data-testid="add-task"]')!.getBoundingClientRect();
				const addSubtask = Array.from(element.querySelectorAll('[data-testid="add-subtask"]'))
					.at(-1)!
					.getBoundingClientRect();
				const addStage = document
					.querySelector('[data-testid="add-stage"]')!
					.getBoundingClientRect();
				return {
					gap: addTask.top - table.bottom,
					clearance: addTask.top - addSubtask.bottom,
					addTaskWidth: addTask.width,
					addSubtaskWidth: addSubtask.width,
					addStageWidth: addStage.width
				};
			});
			expect(layout.gap).toBeLessThanOrEqual(12);
			// The last add-subtask line must not cover the add-task button.
			expect(layout.clearance).toBeGreaterThanOrEqual(0);
			expect(layout.addStageWidth).toBeGreaterThan(layout.addTaskWidth);
			expect(layout.addTaskWidth).toBeGreaterThan(layout.addSubtaskWidth);
		}).toPass({ timeout: 5000 });
		const addTask = (await first.getByTestId('add-task').boundingBox())!;
		await first.getByTestId('add-task').click({
			trial: true,
			position: { x: addTask.width / 2, y: 2 }
		});
	});
});
