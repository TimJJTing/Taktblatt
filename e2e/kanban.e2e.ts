import { expect, test, type Page } from '@playwright/test';
import { SCHEMA_VERSION, type Plan } from '#lib/domain/schema.ts';
import { STAGE_COLORS } from '#lib/domain/palette.ts';
import { makePlan } from '#lib/domain/test-helpers.ts';
import {
	done300,
	garden,
	isolatedParent,
	kanbanTask,
	unrelatedCycle
} from '#lib/scene/kanban-fixtures.test-helper.ts';
import {
	chooseView,
	diagramStage,
	expectKanbanFocusContained,
	expectView,
	focusPreviousControl,
	ganttRow,
	importJson,
	openApp,
	openPreview,
	row,
	resizePlanPane,
	setTaskStatus,
	startTimelineIslandMonitor,
	timelineHandle,
	waitForAnimations,
	waitForFrames,
	workspaceContent,
	workspaceTabs,
	workspaceTabSize
} from './helpers.ts';

const board = (page: Page) => page.getByTestId('kanban');
const vertical = (page: Page) => board(page).getByTestId('kanban-scroll');
const strip = (page: Page) => board(page).getByTestId('kanban-strip');
const column = (page: Page, id: string) =>
	board(page).locator(`[data-testid="kanban-cell"][data-column="${id}"]`);
const action = (page: Page, id: string) => board(page).locator(`[data-diagram-label="${id}"]`);
const card = (page: Page, id: string) => board(page).locator(`[data-diagram-task="${id}"]`);
const station = (page: Page, id: string) =>
	card(page, id).getByRole('button', { name: /^Show dependency route for / });

async function load(page: Page, plan: Plan) {
	plan.heading = 'Kanban regression';
	await openApp(page);
	await importJson(page, { schemaVersion: SCHEMA_VERSION, kind: 'plan', plan });
	await expect(page.getByTestId('plan-heading')).toContainText('Kanban regression');
	await chooseView(page, 'kanban');
}

async function expectCounts(page: Page, counts: number[]) {
	const columns = board(page).getByTestId('kanban-heading');
	await expect(columns).toHaveCount(4);
	for (const [i, id] of ['blocked', 'todo', 'in_progress', 'done'].entries()) {
		await expect(columns.nth(i)).toHaveAttribute('data-column', id);
		await expect(columns.nth(i).getByTestId('kanban-count')).toHaveText(String(counts[i]));
	}
}

async function keyboardFocus(page: Page, target: ReturnType<typeof action>) {
	await focusPreviousControl(target);
	await page.keyboard.press('Tab');
	await expect(target).toBeFocused();
}

async function routePaint(page: Page, id: string) {
	return card(page, id).evaluate((node, taskId) => {
		const icon = node.querySelector<SVGElement>(`[data-diagram-station="${taskId}"] svg`)!;
		return { border: getComputedStyle(node).borderLeftColor, icon: getComputedStyle(icon).color };
	}, id);
}

async function routeEdges(page: Page) {
	return board(page)
		.getByTestId('kanban-dependency')
		.evaluateAll((lines) =>
			lines
				.map((line) => `${line.getAttribute('data-from')}->${line.getAttribute('data-to')}`)
				.sort()
		);
}

test('selects Kanban in the existing Timeline and keeps Gantt available', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await load(page, garden());
	await expectView(page, 'kanban');
	await expectCounts(page, [2, 3, 1, 1]);
	await expect(board(page).getByTestId('kanban-card')).toHaveCount(7);
	await expect(page.getByTestId('diagram-view-gantt')).toBeVisible();
	await chooseView(page, 'gantt');
	await expect(page.getByTestId('gantt')).toBeVisible();
	await chooseView(page, 'kanban');
	await expectCounts(page, [2, 3, 1, 1]);
});

test('retains done-300 with an unbroken title, sticky headings and keyboard endpoints', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await load(page, done300(true));
	await expectCounts(page, [0, 0, 0, 300]);
	await expect(board(page).locator('[data-diagram-task]')).toHaveCount(300);
	await expect(board(page).getByTestId('kanban-empty')).toHaveCount(0);
	await waitForAnimations(board(page));
	await expect
		.poll(() =>
			board(page).evaluate((root) => {
				const done = root.querySelector<HTMLElement>(
					'[data-testid="kanban-cell"][data-column="done"]'
				)!;
				const long = root.querySelector<HTMLElement>('[data-diagram-task="D150"]')!;
				const title = [...long.querySelectorAll<HTMLElement>('*')].find(
					(node) =>
						node.textContent === 'W'.repeat(512) &&
						![...node.children].some((child) => child.textContent === node.textContent)
				);
				if (!title) return false;
				const style = getComputedStyle(title);
				const cellStyle = getComputedStyle(done);
				const contentWidth =
					done.clientWidth - parseFloat(cellStyle.paddingLeft) - parseFloat(cellStyle.paddingRight);
				return (
					Math.abs(long.getBoundingClientRect().width - contentWidth) <= 1 &&
					title.getBoundingClientRect().height <= 2 * parseFloat(style.lineHeight) + 1 &&
					long.scrollWidth <= long.clientWidth + 1 &&
					done.scrollWidth <= done.clientWidth + 1
				);
			})
		)
		.toBe(true);
	await expect(action(page, 'D150')).toHaveAccessibleName(
		new RegExp(`^Open task details for ${'W'.repeat(512)}`)
	);
	await action(page, 'D150').hover();
	// The shared tooltip content has no tooltip role. Use its slot, as e2e/tooltips.e2e.ts does.
	await expect(page.locator('[data-slot="tooltip-content"]')).toContainText('W'.repeat(512));

	await vertical(page).hover();
	await page.mouse.wheel(0, 100000);
	await expect
		.poll(() => vertical(page).evaluate((element) => element.scrollTop))
		.toBeGreaterThan(0);
	await expect
		.poll(() =>
			vertical(page).evaluate((element) => {
				const viewport = element.getBoundingClientRect();
				const headings = [...element.querySelectorAll('[data-testid="kanban-heading"]')];
				return (
					headings.length === 4 &&
					headings.every((heading) => {
						const rect = heading.getBoundingClientRect();
						return rect.top >= viewport.top - 1 && rect.bottom <= viewport.bottom;
					})
				);
			})
		)
		.toBe(true);
	await expect(action(page, 'D300')).toBeInViewport();
	await keyboardFocus(page, action(page, 'D300'));
	await page.keyboard.press('Home');
	await expect(action(page, 'D001')).toBeFocused();
	await expect(action(page, 'D001')).toBeInViewport();
	await page.keyboard.press('End');
	await expect(action(page, 'D300')).toBeFocused();
	await expect(action(page, 'D300')).toBeInViewport();
});

test('keeps a horizontal board strip inside a narrow page', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await load(page, done300(true));
	await page.getByTestId('timeline-keep-open').click();
	await waitForAnimations(page.locator('#timeline'));
	await expect
		.poll(() =>
			page.evaluate(
				() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
			)
		)
		.toBe(true);
	await expect
		.poll(() => strip(page).evaluate((element) => element.scrollWidth > element.clientWidth))
		.toBe(true);
	await strip(page).hover();
	await page.mouse.wheel(100, 0);
	await expect.poll(() => strip(page).evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
	const thumb = board(page).locator('[data-overlay-thumb="x"]');
	const thumbAtBottom = () =>
		board(page).evaluate((element) => {
			const thumb = element.querySelector<HTMLElement>('[data-overlay-thumb="x"]')!;
			const bounds = element.getBoundingClientRect();
			const bar = thumb.getBoundingClientRect();
			return bar.bottom <= bounds.bottom && bar.bottom >= bounds.bottom - 12;
		});
	await expect.poll(thumbAtBottom).toBe(true);
	const beforeDrag = await strip(page).evaluate((element) => element.scrollLeft);
	const bounds = (await thumb.boundingBox())!;
	await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
	await page.mouse.down();
	await page.mouse.move(bounds.x + bounds.width / 2 + 50, bounds.y + bounds.height / 2);
	await page.mouse.up();
	await expect
		.poll(() => strip(page).evaluate((element) => element.scrollLeft))
		.toBeGreaterThan(beforeDrag);
	await vertical(page).evaluate((element) => (element.scrollTop = 1000));
	await expect.poll(thumbAtBottom).toBe(true);
	await keyboardFocus(page, action(page, 'D001'));
	await expect(action(page, 'D001')).toBeInViewport();
	await page.keyboard.press('End');
	await expect(action(page, 'D300')).toBeFocused();
	await expect(action(page, 'D300')).toBeInViewport();
	await expect
		.poll(() =>
			page.evaluate(
				() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
			)
		)
		.toBe(true);
});

test('fits four aligned columns at 640px and scrolls one sticky strip at 480px', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await load(page, garden());
	await resizePlanPane(page, 640);
	await expect(board(page).getByTestId('kanban-swimlane')).toHaveCount(3);
	await expect
		.poll(() => strip(page).evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
		.toBe(true);
	await expect
		.poll(() =>
			strip(page).evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				const headings = [
					...element.querySelectorAll<HTMLElement>('[data-testid="kanban-heading"]')
				];
				return (
					headings.length === 4 &&
					headings.every((heading) => {
						const rect = heading.getBoundingClientRect();
						return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
					})
				);
			})
		)
		.toBe(true);
	await page.setViewportSize({ width: 480, height: 844 });
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'tabs');
	await expect
		.poll(() => strip(page).evaluate((element) => element.scrollWidth > element.clientWidth))
		.toBe(true);
	await expect
		.poll(() =>
			board(page)
				.getByTestId('kanban-heading')
				.evaluateAll((headings) => {
					const top = headings[0]?.getBoundingClientRect().top;
					return (
						headings.length === 4 &&
						headings.every((heading) => Math.abs(heading.getBoundingClientRect().top - top) <= 1)
					);
				})
		)
		.toBe(true);
	await strip(page).evaluate((element) => (element.scrollLeft = element.scrollWidth));
	await expect.poll(() => strip(page).evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
	await expect
		.poll(() =>
			board(page).evaluate((root) => {
				const strip = root.querySelector<HTMLElement>('[data-testid="kanban-strip"]')!;
				const heading = root.querySelector<HTMLElement>('[data-testid="kanban-stage-heading"]')!;
				return (
					Math.abs(heading.getBoundingClientRect().left - strip.getBoundingClientRect().left) <= 1
				);
			})
		)
		.toBe(true);
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
		.toBe(true);
});

test('keeps garden counts and same-lane card geometry while a family opens and closes', async ({
	page
}) => {
	const plan = garden();
	const parent = plan.tasks.find((task) => task.title === 'Soil preparation')!;
	await load(page, plan);
	await expectCounts(page, [2, 3, 1, 1]);
	const lanes = board(page).getByTestId('kanban-swimlane');
	await expect(lanes).toHaveCount(3);
	const snapshot = () =>
		lanes.first().evaluate((lane) =>
			[...lane.querySelectorAll<HTMLElement>('[data-testid="kanban-card"]')].map((card) => ({
				id: card.dataset.diagramTask,
				column: card.closest<HTMLElement>('[data-testid="kanban-cell"]')?.dataset.column,
				x: card.getBoundingClientRect().x,
				y: card.getBoundingClientRect().y,
				width: card.getBoundingClientRect().width,
				height: card.getBoundingClientRect().height
			}))
		);
	const before = await snapshot();
	const top = (await lanes.nth(1).boundingBox())!.y;
	const toggle = board(page)
		.locator(`[data-testid="kanban-family"][data-parent="${parent.id}"]`)
		.getByTestId('kanban-family-toggle');
	await toggle.click();
	await expect(board(page).getByTestId('kanban-item')).toHaveCount(2);
	await waitForAnimations(board(page));
	expect(await snapshot()).toEqual(before);
	expect((await lanes.nth(1).boundingBox())!.y).toBeGreaterThan(top);
	await expectCounts(page, [2, 3, 1, 1]);
	await toggle.click();
	await expect(board(page).getByTestId('kanban-item')).toHaveCount(0);
	await waitForAnimations(board(page));
	expect(await snapshot()).toEqual(before);
	expect((await lanes.nth(1).boundingBox())!.y).toBeCloseTo(top, 0);
	await expectCounts(page, [2, 3, 1, 1]);
});

test('shares expansion with Work plan and Gantt and restores it after reload', async ({ page }) => {
	await page.setViewportSize({ width: 1600, height: 1000 });
	const plan = garden();
	const parent = plan.tasks.find((task) => task.title === 'Neighbourhood stall')!;
	await load(page, plan);
	const toggle = () =>
		board(page)
			.locator(`[data-testid="kanban-family"][data-parent="${parent.id}"]`)
			.getByTestId('kanban-family-toggle');
	await expect(toggle()).toHaveAttribute('aria-expanded', 'false');
	await toggle().click();
	await expect(row(page, 'Neighbourhood stall').getByTestId('task-toggle')).toHaveAttribute(
		'aria-expanded',
		'true'
	);
	await chooseView(page, 'gantt');
	await expect(ganttRow(page, 'Neighbourhood stall').getByTestId('gantt-toggle')).toHaveAttribute(
		'aria-expanded',
		'true'
	);
	await page.reload();
	await expectView(page, 'gantt');
	await expect(ganttRow(page, 'Neighbourhood stall').getByTestId('gantt-toggle')).toHaveAttribute(
		'aria-expanded',
		'true'
	);
	await chooseView(page, 'kanban');
	await expect(toggle()).toHaveAttribute('aria-expanded', 'true');
});

test('transfers an expanded Gantt subtask to its Kanban item and reveals it past both sticky axes', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 480, height: 800 });
	const plan = garden();
	const child = plan.tasks.find((task) => task.title === 'Book a table')!;
	const parent = plan.tasks.find((task) => task.title === 'Neighbourhood stall')!;
	await load(page, plan);
	const toggle = board(page)
		.locator(`[data-testid="kanban-family"][data-parent="${parent.id}"]`)
		.getByTestId('kanban-family-toggle');
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await toggle.click();
	await chooseView(page, 'gantt');
	const target = page.locator(`[data-diagram-view="gantt"] [data-diagram-task="${child.id}"]`);
	await target.focus();
	await expect(target).toBeFocused();
	await page
		.getByTestId('diagram-view-kanban')
		.evaluate((choice) => (choice as HTMLElement).click());
	await expectView(page, 'kanban');
	await expect(
		board(page).locator(`[data-testid="kanban-item"][data-diagram-task="${child.id}"]`)
	).toHaveCount(1);
	await expect(action(page, child.id)).toBeFocused();
	await expectKanbanFocusContained(action(page, child.id));
});

test('aligns the stage stems and every status track across the garden', async ({ page }) => {
	await load(page, garden());
	const lanes = board(page).getByTestId('kanban-swimlane');
	await expect(lanes).toHaveCount(3);
	await expect
		.poll(() =>
			board(page).evaluate((root) => {
				const headings = [...root.querySelectorAll<HTMLElement>('[data-testid="kanban-heading"]')];
				if (headings.length !== 4) return false;
				return [...root.querySelectorAll<HTMLElement>('[data-testid="kanban-swimlane"]')].every(
					(lane) => {
						const stem = lane.querySelector<HTMLElement>('[data-testid="kanban-stem"]');
						const badge = lane.querySelector<HTMLElement>(
							'[data-testid="kanban-stage-heading"] .stage-badge'
						);
						const title = lane.querySelector<HTMLElement>('[data-testid="kanban-stage-title"]');
						const cells = [...lane.querySelectorAll<HTMLElement>('[data-testid="kanban-cell"]')];
						if (!stem || !badge || !title || cells.length !== 4) return false;
						const stemBox = stem.getBoundingClientRect();
						const titleBox = title.getBoundingClientRect();
						return (
							Math.abs(stemBox.left - badge.getBoundingClientRect().left) <= 0.5 &&
							Math.abs(stemBox.width - 4) <= 0.5 &&
							titleBox.left >= stemBox.right &&
							titleBox.right <= cells[0].getBoundingClientRect().left + 1 &&
							cells.every((cell, i) => {
								const box = cell.getBoundingClientRect();
								const heading = headings[i].getBoundingClientRect();
								return (
									Math.abs(box.left - heading.left) <= 1 && Math.abs(box.width - heading.width) <= 1
								);
							})
						);
					}
				);
			})
		)
		.toBe(true);
});

test('keeps stems, card borders and the status key legible in dark and forced colors', async ({
	page
}) => {
	await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
	const plan = garden();
	await load(page, plan);
	const lanes = board(page).getByTestId('kanban-swimlane');
	await expect(lanes).toHaveCount(3);
	await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
	for (const [i, stage] of plan.stages.entries()) {
		const stem = lanes.nth(i).getByTestId('kanban-stem');
		await expect(stem).toHaveCSS(
			'background-color',
			`rgb(${STAGE_COLORS[stage.color].dark
				.match(/\w\w/g)!
				.slice(0)
				.map((part) => parseInt(part, 16))
				.join(', ')})`
		);
	}
	const dark = await board(page).evaluate((root) => {
		const ground = 'rgb(255, 255, 255)';
		const stems = [...root.querySelectorAll<HTMLElement>('[data-testid="kanban-stem"]')];
		const cards = [...root.querySelectorAll<HTMLElement>('[data-testid="kanban-card"]')];
		const key = root.querySelector<HTMLElement>('ul[aria-label="Status"]');
		return (
			stems.length > 0 &&
			cards.length > 0 &&
			!!key &&
			stems.every((node) => getComputedStyle(node).backgroundColor !== ground) &&
			cards.every((node) => getComputedStyle(node).borderLeftColor !== ground) &&
			[...key.querySelectorAll('li')].every((node) => getComputedStyle(node).color !== ground)
		);
	});
	expect(dark).toBe(true);
	await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
	await expect
		.poll(() =>
			board(page).evaluate((root) => {
				const probe = document.createElement('span');
				root.append(probe);
				const system = (color: string) => {
					probe.style.color = color;
					return getComputedStyle(probe).color;
				};
				const canvas = system('Canvas');
				const ink = ['CanvasText', 'ButtonText', 'LinkText', 'Highlight', 'HighlightText'].map(
					system
				);
				const stems = [...root.querySelectorAll<HTMLElement>('[data-testid="kanban-stem"]')];
				const cards = [...root.querySelectorAll<HTMLElement>('[data-testid="kanban-card"]')];
				const icons = [...root.querySelectorAll<SVGElement>('[data-diagram-station] svg')];
				const entries = [...root.querySelectorAll<HTMLElement>('ul[aria-label="Status"] li')];
				const visible = (element: Element) =>
					getComputedStyle(element).visibility === 'visible' &&
					Number(getComputedStyle(element).opacity) > 0;
				const result =
					stems.length > 0 &&
					cards.length > 0 &&
					icons.length > 0 &&
					entries.length === 4 &&
					stems.every(
						(node) =>
							visible(node) &&
							ink.includes(getComputedStyle(node).backgroundColor) &&
							getComputedStyle(node).backgroundColor !== canvas
					) &&
					cards.every(
						(node) =>
							visible(node) &&
							parseFloat(getComputedStyle(node).borderLeftWidth) > 0 &&
							ink.includes(getComputedStyle(node).borderLeftColor)
					) &&
					icons.every((node) => visible(node) && ink.includes(getComputedStyle(node).color)) &&
					entries.every(
						(node) =>
							visible(node) &&
							ink.includes(getComputedStyle(node).color) &&
							getComputedStyle(node).color !== canvas
					);
				probe.remove();
				return result;
			})
		)
		.toBe(true);
});

async function kanbanPreview(page: Page) {
	const preview = await openPreview(page);
	const kanban = preview.getByTestId('print-diagram-kanban');
	const gantt = preview.getByTestId('print-diagram-gantt');
	if ((await kanban.getAttribute('aria-checked')) !== 'true') await kanban.click();
	await expect(kanban).toHaveAttribute('aria-checked', 'true');
	if ((await gantt.getAttribute('aria-checked')) === 'true') await gantt.click();
	await expect(gantt).toHaveAttribute('aria-checked', 'false');
	return preview;
}

async function expectPaperGeometry(page: Page) {
	const fragments = page.locator('[data-testid="sheet"] [data-fragment="kanban-scene"]');
	await expect
		.poll(() =>
			fragments.evaluateAll((parts) => {
				const measure = document.querySelector(
					'[data-sheet-measurer] [data-testid="sheet-kanban"] [data-part="repeat"]'
				);
				if (!measure || parts.length === 0) return false;
				const height = measure.getBoundingClientRect().height;
				return parts.every((part) => {
					const repeat = part.querySelector('[data-part="repeat"]');
					const body = part.closest('[data-testid="sheet"]')?.querySelector('.sheet-content');
					if (!repeat || !body || Math.abs(repeat.getBoundingClientRect().height - height) > 1)
						return false;
					const bounds = body.getBoundingClientRect();
					return [...part.querySelectorAll('[data-item]')].every((item) => {
						const rect = item.getBoundingClientRect();
						return (
							rect.top >= bounds.top - 1 &&
							rect.bottom <= bounds.bottom + 1 &&
							[
								...item.querySelectorAll(
									'[data-testid="sheet-kanban-card"], [data-testid="sheet-kanban-line"]'
								)
							].every((child) => {
								const box = child.getBoundingClientRect();
								return box.top >= rect.top - 1 && box.bottom <= rect.bottom + 1;
							})
						);
					});
				});
			})
		)
		.toBe(true);
}

test('paper stems span every swimlane item, including hidden headings (Q1)', async ({ page }) => {
	const plan = garden();
	await load(page, plan);
	const preview = await kanbanPreview(page);
	const detail = preview.getByTestId('print-subtasks');
	if ((await detail.getAttribute('aria-checked')) !== 'true') await detail.click();
	await expect(detail).toHaveAttribute('aria-checked', 'true');
	const fragments = preview.locator('[data-fragment="kanban-scene"]');
	const items = fragments.getByTestId('sheet-kanban-item');
	await expect(fragments.getByTestId('sheet-kanban-line')).not.toHaveCount(0);
	await expect(
		items.locator('[data-testid="sheet-kanban-stage"][data-visible="false"]')
	).not.toHaveCount(0);
	await expect
		.poll(() => fragments.getByTestId('sheet-kanban-stem').count())
		.toBe(await items.count());
	const colors = Object.fromEntries(
		plan.stages.map((stage) => {
			const hex = STAGE_COLORS[stage.color].light;
			return [
				stage.id,
				`rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
			];
		})
	);
	await expect
		.poll(() =>
			fragments.evaluateAll(
				(parts, expectedColors) =>
					parts.every((part) => {
						const items = [
							...part.querySelectorAll<HTMLElement>('[data-testid="sheet-kanban-item"]')
						];
						return items.every((item, index) => {
							const lane = item.dataset.lane;
							const heading = item.querySelector<HTMLElement>('[data-testid="sheet-kanban-stage"]');
							const stem = item.querySelector<HTMLElement>('[data-testid="sheet-kanban-stem"]');
							if (!lane || !heading || !stem) return false;
							const box = stem.getBoundingClientRect();
							const headingBox = heading.getBoundingClientRect();
							if (
								box.width <= 0 ||
								box.height <= 0 ||
								getComputedStyle(stem).visibility !== 'visible' ||
								getComputedStyle(stem).backgroundColor !== expectedColors[lane] ||
								box.left < headingBox.left - 1 ||
								box.right > headingBox.right + 1
							)
								return false;
							const previous = items[index - 1];
							if (previous?.dataset.lane === lane) {
								const previousStem = previous.querySelector('[data-testid="sheet-kanban-stem"]');
								return !!previousStem && box.top - previousStem.getBoundingClientRect().bottom <= 1;
							}
							const badge = heading.querySelector('.stage-badge');
							return !!badge && box.top >= badge.getBoundingClientRect().bottom - 1;
						});
					}),
				colors
			)
		)
		.toBe(true);
});

test('paper keeps the ready light before the title and reserves its slot', async ({ page }) => {
	await load(
		page,
		makePlan([
			kanbanTask('ready', { title: 'Ready task' }),
			kanbanTask('finished', { title: 'Finished task', status: 'done' })
		])
	);
	const preview = await kanbanPreview(page);
	const fragments = preview.locator('[data-fragment="kanban-scene"]');
	const ready = fragments.locator('[data-testid="sheet-kanban-card"][data-task-id="ready"]');
	const finished = fragments.locator('[data-testid="sheet-kanban-card"][data-task-id="finished"]');
	const light = ready.getByRole('img');
	await expect(light).toHaveCount(1);
	await expect(finished.getByRole('img')).toHaveCount(0);
	await expect
		.poll(() =>
			ready.evaluate((card) => {
				const light = card.querySelector('[role="img"]');
				const title = card.querySelector('[data-testid="sheet-kanban-card-title"]');
				if (!light || !title || !title.firstChild) return false;
				const range = document.createRange();
				range.selectNodeContents(title.firstChild);
				const firstLine = range.getClientRects()[0];
				if (!firstLine) return false;
				const dot = light.getBoundingClientRect();
				return (
					dot.left < firstLine.left && dot.top < firstLine.bottom && dot.bottom > firstLine.top
				);
			})
		)
		.toBe(true);
	const titleOffset = (card: typeof ready) =>
		card.evaluate((element) => {
			const title = element.querySelector('[data-testid="sheet-kanban-card-title"]')!;
			return title.getBoundingClientRect().left - element.getBoundingClientRect().left;
		});
	await expect
		.poll(async () => Math.abs((await titleOffset(ready)) - (await titleOffset(finished))))
		.toBeLessThanOrEqual(1);
});

test('Preview paginates each Done id once with repeated counts on landscape A4 and Letter', async ({
	page
}) => {
	test.setTimeout(120000);
	await page.setViewportSize({ width: 1440, height: 1000 });
	const plan = done300(true);
	await load(page, plan);
	const preview = await kanbanPreview(page);
	for (const size of ['a4', 'letter']) {
		await preview.getByTestId(`paper-${size}`).click();
		await expect(preview.getByTestId('sheets')).toHaveAttribute('data-paper', size);
		const fragments = preview.locator('[data-fragment="kanban-scene"]');
		await expect
			.poll(() =>
				fragments
					.getByTestId('sheet-kanban-card')
					.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-task-id')))
			)
			.toEqual(plan.tasks.map((task) => task.id));
		expect(await fragments.count()).toBeGreaterThan(1);
		await expect
			.poll(() =>
				fragments.evaluateAll((parts) =>
					parts.every((part) => {
						const repeat = part.querySelector('[data-part="repeat"]');
						const labels = [
							...(repeat?.querySelectorAll('[data-testid="sheet-kanban-heading"]') ?? [])
						];
						return (
							part.closest('[data-testid="sheet"]')?.getAttribute('data-orientation') ===
								'landscape' &&
							!!repeat?.textContent?.includes('Kanban') &&
							labels.map((label) => label.getAttribute('data-column')).join('/') ===
								'blocked/todo/in_progress/done' &&
							labels
								.map((label) =>
									label.querySelector('[data-testid="kanban-count"]')?.textContent?.trim()
								)
								.join('/') === '0/0/0/300' &&
							['Blocked', 'Todo', 'In progress', 'Done'].every((label) =>
								repeat.textContent?.includes(label)
							) &&
							!!repeat.querySelector('ul[aria-label="Status"]')
						);
					})
				)
			)
			.toBe(true);
		await expectPaperGeometry(page);
		await expect(
			fragments.locator('button, svg.station-dot, [data-testid="kanban-dependency"]')
		).toHaveCount(0);
		const longCard = fragments.locator('[data-testid="sheet-kanban-card"][data-task-id="D150"]');
		await expect(longCard).toHaveAttribute('aria-label', /W{512}/);
		const title = longCard.getByTestId('sheet-kanban-card-title');
		await expect
			.poll(() =>
				title.evaluate((node) => {
					const style = getComputedStyle(node);
					const box = node.getBoundingClientRect();
					return (
						style.webkitLineClamp === '2' &&
						box.height <= parseFloat(style.lineHeight) * 2 + 1 &&
						box.right <= node.parentElement!.getBoundingClientRect().right + 1
					);
				})
			)
			.toBe(true);
	}
});

test('continued swimlane repeats a wrapped stage heading without overflow (AC-23)', async ({
	page
}) => {
	const plan = done300();
	plan.tasks = plan.tasks.slice(0, 35);
	plan.stages[0].title =
		'Long stage title that wraps across at least three lines for continued pages';
	await load(page, plan);
	const preview = await kanbanPreview(page);
	const fragments = preview.locator('[data-fragment="kanban-scene"]');
	await expect.poll(() => fragments.count()).toBeGreaterThan(1);
	await expect
		.poll(() =>
			fragments.nth(1).getByTestId('sheet-kanban-stage').first().getAttribute('data-visible')
		)
		.toBe('true');
	const heading = fragments.nth(1).getByTestId('sheet-kanban-stage').first();
	await expect(heading.getByTestId('sheet-kanban-stage-title')).toHaveText(plan.stages[0].title);
	await expect(heading).toContainText('S1');
	await expect
		.poll(() =>
			heading
				.getByTestId('sheet-kanban-stage-title')
				.evaluate(
					(node) =>
						node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight)
				)
		)
		.toBeGreaterThan(2);
	await expect
		.poll(() =>
			fragments
				.nth(1)
				.locator('[data-item]')
				.first()
				.evaluate((item) => {
					const index = item.getAttribute('data-item');
					const measured = document.querySelector(
						`[data-sheet-measurer] [data-testid="sheet-kanban-item"][data-item="${index}"]`
					);
					const hidden = measured?.querySelector('[data-testid="sheet-kanban-stage"]');
					return (
						!!measured &&
						!!hidden &&
						hidden.getAttribute('data-visible') === 'false' &&
						hidden.getAttribute('aria-hidden') === 'true' &&
						getComputedStyle(hidden).visibility === 'hidden' &&
						Math.abs(
							item.getBoundingClientRect().height - measured.getBoundingClientRect().height
						) <= 1
					);
				})
		)
		.toBe(true);
	await expectPaperGeometry(page);
});

test('prints empty lanes and a single explanation for an empty board (AC-65)', async ({ page }) => {
	await load(page, makePlan([kanbanTask('A')], ['s1', 's2']));
	let preview = await kanbanPreview(page);
	const empty = preview.locator('[data-fragment="kanban-scene"] [data-kind="lane-empty"]');
	await expect(empty).toHaveCount(1);
	await expect(empty.getByTestId('sheet-kanban-stage')).toContainText('S2');
	await expect(empty.getByTestId('sheet-kanban-stage-empty')).toHaveText('No tasks in this stage');
	await page.keyboard.press('Escape');
	await load(page, makePlan([], ['s1', 's2']));
	preview = await kanbanPreview(page);
	const fragments = preview.locator('[data-fragment="kanban-scene"]');
	await expect(fragments).toHaveCount(1);
	await expect(fragments.getByTestId('sheet-kanban-empty')).toHaveText('No tasks yet.');
	await expect(fragments.locator('[data-kind="lane-empty"]')).toHaveCount(2);
});

test('paper items retain stage heading height and accessible visibility (AC-65)', async ({
	page
}) => {
	const plan = makePlan(
		[
			kanbanTask('P', { title: 'Parent' }),
			kanbanTask('C1', { parentId: 'P' }),
			kanbanTask('C2', { parentId: 'P', status: 'done' }),
			kanbanTask('A'),
			kanbanTask('B')
		],
		['s1', 's2']
	);
	plan.stages[0].title = 'Long stage title that wraps across at least three lines for every item';
	await load(page, plan);
	const preview = await kanbanPreview(page);
	await preview.getByTestId('print-subtasks').click();
	const fragment = preview.locator('[data-fragment="kanban-scene"]');
	await expect
		.poll(() =>
			fragment
				.locator('[data-item]')
				.evaluateAll((items) =>
					[...new Set(items.map((item) => item.getAttribute('data-kind')))].sort()
				)
		)
		.toEqual(['card-row', 'family-line', 'family-start', 'lane-empty', 'lane-start']);
	await expect
		.poll(() =>
			fragment.locator('[data-item][data-lane="s1"]').evaluateAll((items) =>
				items.every((item) => {
					const heading = item.querySelector('[data-testid="sheet-kanban-stage"]');
					if (!heading) return false;
					const visible = heading.getAttribute('data-visible') === 'true';
					return (
						item.getBoundingClientRect().height + 1 >= heading.getBoundingClientRect().height &&
						(visible ||
							(getComputedStyle(heading).visibility === 'hidden' &&
								heading.getAttribute('aria-hidden') === 'true'))
					);
				})
			)
		)
		.toBe(true);
	await expect(
		fragment.locator('[data-testid="sheet-kanban-stage"][data-visible="false"]')
	).not.toHaveCount(0);
	await expectPaperGeometry(page);
});

test('paper uses 12 px status icons and finished card treatment (AC-2, AC-8)', async ({ page }) => {
	const plan = makePlan([
		kanbanTask('P', { title: 'Parent' }),
		kanbanTask('C', { parentId: 'P', status: 'done' }),
		kanbanTask('D', { status: 'done', title: 'Finished' })
	]);
	await load(page, plan);
	const preview = await kanbanPreview(page);
	await preview.getByTestId('print-subtasks').click();
	const fragments = preview.locator('[data-fragment="kanban-scene"]');
	await expect(fragments.getByTestId('sheet-kanban-line')).toHaveCount(1);
	await expect
		.poll(() =>
			fragments.evaluateAll((parts) =>
				parts.every((part) => {
					const key = part.querySelector('[data-part="repeat"] ul[aria-label="Status"]');
					const icons = [
						...part.querySelectorAll(
							'[data-testid="sheet-kanban-card"] svg, [data-testid="sheet-kanban-line"] svg, ul[aria-label="Status"] svg'
						)
					].filter((svg) => svg.getAttribute('viewBox') === '0 0 24 24');
					return (
						!!key &&
						icons.length >= 6 &&
						icons.every((icon) => {
							const box = icon.getBoundingClientRect();
							return Math.abs(box.width - 12) < 0.5 && Math.abs(box.height - 12) < 0.5;
						})
					);
				})
			)
		)
		.toBe(true);
	const done = fragments.locator('[data-testid="sheet-kanban-card"][data-task-id="D"]');
	await expect(done.locator('svg[viewBox="0 0 24 24"]')).toHaveCount(1);
	await expect
		.poll(() =>
			done
				.getByTestId('sheet-kanban-card-title')
				.evaluate((node) => getComputedStyle(node).textDecorationLine)
		)
		.toContain('line-through');
});

test('opens Task details and returns focus to the same main action on Escape', async ({ page }) => {
	await load(page, makePlan([kanbanTask('A', { title: 'Review' })]));
	await action(page, 'A').click();
	const dialog = page.getByTestId('task-dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByTestId('dialog-title')).toContainText('Review');
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(action(page, 'A')).toBeFocused();
});

test('applies reduced-motion route paint and expansion in the update task without animation', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 1440, height: 1000 });
	const plan = garden();
	const parent = plan.tasks.find((task) => task.title === 'Soil preparation')!;
	const other = plan.tasks.find((task) => task.title === 'Order seeds')!;
	await load(page, plan);
	await expect(board(page).getByTestId('kanban-swimlane')).toHaveCount(3);
	await waitForAnimations(board(page));
	await page.mouse.move(0, 0);
	await page.keyboard.press('Tab');
	await page.getByTestId('diagram-view-kanban').focus();
	const sample = await board(page).evaluate(
		async (root, ids) => {
			const lanes = [...root.querySelectorAll<HTMLElement>('[data-testid="kanban-swimlane"]')];
			const parentAction = root.querySelector<HTMLButtonElement>(
				`[data-diagram-label="${ids.parent}"]`
			)!;
			const otherMark = root.querySelector<HTMLElement>(`[data-diagram-station="${ids.other}"]`)!;
			const toggle = root.querySelector<HTMLButtonElement>(
				`[data-testid="kanban-family"][data-parent="${ids.parent}"] [data-testid="kanban-family-toggle"]`
			)!;
			const created: string[] = [];
			const original = Element.prototype.animate;
			Element.prototype.animate = function (keyframes, options) {
				const animation = original.call(this, keyframes, options);
				if (this.closest('[data-testid="kanban-card"], [data-testid="kanban-item"]'))
					created.push(this.tagName);
				return animation;
			};
			const scopedRunning = () =>
				[
					...root.querySelectorAll<HTMLElement>(
						'[data-testid="kanban-card"], [data-testid="kanban-item"]'
					)
				].flatMap((node) =>
					node
						.getAnimations({ subtree: true })
						.filter(
							(animation) =>
								animation.playState === 'running' &&
								!(
									animation instanceof CSSTransition &&
									animation.transitionProperty.startsWith('outline')
								)
						)
				);
			const colorsMatch = () =>
				[...root.querySelectorAll<HTMLElement>('[data-diagram-station]')].every((wrapper) => {
					const color = getComputedStyle(wrapper).color;
					return [...wrapper.querySelectorAll<SVGElement>('svg, svg *')].every(
						(node) => getComputedStyle(node).color === color
					);
				});
			try {
				const fullColor = getComputedStyle(otherMark).color;
				parentAction.focus();
				const focusVisible = parentAction.matches(':focus-visible');
				await Promise.resolve();
				await Promise.resolve();
				const routeColor = getComputedStyle(otherMark).color;
				const routeRunning = scopedRunning().length;
				const routeColorsMatch = colorsMatch();
				const oldTop = lanes[1].getBoundingClientRect().top;
				toggle.click();
				await Promise.resolve();
				await Promise.resolve();
				const newTop = lanes[1].getBoundingClientRect().top;
				const items = root.querySelectorAll('[data-testid="kanban-item"]').length;
				const expandedRunning = scopedRunning().length;
				const expandedColorsMatch = colorsMatch();
				return {
					focusVisible,
					fullColor,
					routeColor,
					routeRunning,
					routeColorsMatch,
					oldTop,
					newTop,
					items,
					expandedRunning,
					expandedColorsMatch,
					created
				};
			} finally {
				Element.prototype.animate = original;
			}
		},
		{ parent: parent.id, other: other.id }
	);
	expect(sample.focusVisible).toBe(true);
	expect(sample.routeColor).not.toBe(sample.fullColor);
	expect(sample.routeRunning).toBe(0);
	expect(sample.routeColorsMatch).toBe(true);
	expect(sample.items).toBe(2);
	expect(sample.newTop).toBeGreaterThan(sample.oldTop);
	expect(sample.expandedRunning).toBe(0);
	expect(sample.expandedColorsMatch).toBe(true);
	expect(sample.created).toEqual([]);
});

test('projects a parent route collapsed and a subtask route expanded', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 1440, height: 1000 });
	await load(page, isolatedParent(true));
	await expect(board(page).getByTestId('kanban-family')).toHaveCount(1);
	await page.mouse.move(0, 0);
	await expect.poll(() => routeEdges(page)).toEqual([]);
	const p = await routePaint(page, 'P');
	const u = await routePaint(page, 'U');
	await keyboardFocus(page, action(page, 'P'));
	await expect.poll(async () => (await routePaint(page, 'U')).border).not.toBe(u.border);
	expect((await routePaint(page, 'U')).icon).not.toBe(u.icon);
	expect(await routePaint(page, 'P')).toEqual(p);
	expect(await routeEdges(page)).toEqual([]);
	const toggle = board(page).getByTestId('kanban-family-toggle');
	await toggle.click();
	await page.mouse.move(0, 0);
	await expect(board(page).getByTestId('kanban-item')).toHaveCount(2);
	await expect.poll(() => routePaint(page, 'U')).toEqual(u);
	const baseline = Object.fromEntries(
		await Promise.all(
			['P', 'U', 'C1', 'C2'].map(async (id) => [id, await routePaint(page, id)] as const)
		)
	);
	await keyboardFocus(page, action(page, 'C2'));
	await expect.poll(() => routeEdges(page)).toEqual(['C1->C2']);
	for (const id of ['C1', 'C2']) expect(await routePaint(page, id)).toEqual(baseline[id]);
	for (const id of ['P', 'U']) {
		const paint = await routePaint(page, id);
		expect(paint.border).not.toBe(baseline[id].border);
		expect(paint.icon).not.toBe(baseline[id].icon);
	}
});

test('keeps unrelated cycle connectors hidden until their own route is focused', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 1440, height: 1800 });
	await load(page, unrelatedCycle());
	await expect(board(page).getByTestId('kanban-card')).toHaveCount(4);
	const lines = board(page).getByTestId('kanban-dependency');
	await page.mouse.move(0, 0);
	await expect(lines).toHaveCount(0);
	const baseline = Object.fromEntries(
		await Promise.all(
			['A', 'B', 'X', 'Y'].map(async (id) => [id, await routePaint(page, id)] as const)
		)
	);
	await keyboardFocus(page, station(page, 'A'));
	await expect
		.poll(() =>
			lines.evaluateAll((items) =>
				items.map((item) => `${item.getAttribute('data-from')}->${item.getAttribute('data-to')}`)
			)
		)
		.toEqual(['A->B']);
	for (const id of ['A', 'B']) expect(await routePaint(page, id)).toEqual(baseline[id]);
	for (const id of ['X', 'Y']) {
		const paint = await routePaint(page, id);
		expect(paint.border).not.toBe(baseline[id].border);
		expect(paint.icon).not.toBe(baseline[id].icon);
	}
	await keyboardFocus(page, station(page, 'X'));
	await expect
		.poll(() =>
			lines.evaluateAll((items) =>
				items
					.map((item) => `${item.getAttribute('data-from')}->${item.getAttribute('data-to')}`)
					.sort()
			)
		)
		.toEqual(['X->Y', 'Y->X']);
	for (const id of ['X', 'Y']) expect(await routePaint(page, id)).toEqual(baseline[id]);
	for (const id of ['A', 'B']) {
		const paint = await routePaint(page, id);
		expect(paint.border).not.toBe(baseline[id].border);
		expect(paint.icon).not.toBe(baseline[id].icon);
	}
	for (const line of await lines.all()) {
		await expect(line).toHaveAttribute('data-cycle', 'true');
		await expect(line).toHaveCSS('stroke-dasharray', '1px, 4px');
		await expect(line).toHaveCSS('stroke-linecap', 'round');
	}
	await expect(page.getByTestId('task-dialog')).toHaveCount(0);
});

test('hovering the whole card activates its route and moving between its actions retains it', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 1800 });
	await load(page, unrelatedCycle());
	const lines = board(page).getByTestId('kanban-dependency');
	await page.mouse.move(0, 0);
	await expect(lines).toHaveCount(0);
	await action(page, 'A').hover();
	await expect(lines).toHaveCount(1);
	await expect(lines.first()).toHaveAttribute('data-from', 'A');
	await station(page, 'A').hover();
	await expect(lines).toHaveCount(1);
	await page.mouse.move(0, 0);
	await expect(lines).toHaveCount(0);
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
	test(`transfers task focus across Gantt and Kanban with a nonzero board offset (${reducedMotion})`, async ({
		page
	}) => {
		await page.emulateMedia({ reducedMotion });
		await page.setViewportSize({ width: 1440, height: 1000 });
		const plan = done300();
		for (const task of plan.tasks) {
			task.start = '2027-01-02';
			task.end = '2027-01-04';
		}
		await load(page, plan);
		await keyboardFocus(page, action(page, 'D150'));
		await expect
			.poll(() => vertical(page).evaluate((element) => element.scrollTop))
			.toBeGreaterThan(0);
		for (const view of ['gantt', 'kanban']) {
			// Keep task focus while the switch runs, as in the shared stage regression.
			const choice = page.getByTestId(`diagram-view-${view}`);
			if (reducedMotion === 'reduce') {
				const immediate = await choice.evaluate(async (choice) => {
					(choice as HTMLElement).click();
					await new Promise(requestAnimationFrame);
					const root = document.querySelector('[data-testid="diagram-stage"]')!;
					const focused = document.activeElement;
					return {
						view: root.getAttribute('data-view'),
						layers: root.querySelectorAll('[data-diagram-layer]').length,
						task: focused?.closest('[data-route-target]')?.getAttribute('data-route-target'),
						label: focused?.getAttribute('data-diagram-label'),
						moving: root
							.getAnimations({ subtree: true })
							.filter(
								(animation) =>
									animation.playState === 'running' &&
									Number(animation.effect?.getComputedTiming().duration) > 1
							).length
					};
				});
				expect(immediate).toMatchObject({ view, layers: 1, task: 'D150', moving: 0 });
				if (view === 'kanban') expect(immediate.label).toBe('D150');
			} else {
				await choice.evaluate((choice) => (choice as HTMLElement).click());
			}
			await expectView(page, view);
			const target = diagramStage(page).locator(`[data-diagram-label="D150"]`);
			if (view === 'kanban') {
				await expect(target).toBeFocused();
				await expectKanbanFocusContained(target);
			} else {
				await expect
					.poll(() =>
						page.evaluate(() =>
							document.activeElement
								?.closest('[data-route-target]')
								?.getAttribute('data-route-target')
						)
					)
					.toBe('D150');
				await expect
					.poll(() =>
						page.evaluate(() => {
							const item = document
								.querySelector('[data-testid="diagram-stage"] [data-diagram-task="D150"]')!
								.getBoundingClientRect();
							const scroller = document
								.querySelector('[data-testid="gantt-scroller"]')!
								.getBoundingClientRect();
							const stickyHeader = document
								.querySelector('[data-testid="gantt-scroller"] .sticky.top-0')!
								.getBoundingClientRect();
							const body = document
								.querySelector('[data-testid="timeline-body"]')!
								.getBoundingClientRect();
							return (
								item.top >= stickyHeader.bottom - 1 &&
								item.top >= scroller.top - 1 &&
								item.bottom <= scroller.bottom + 1 &&
								item.top >= body.top - 1 &&
								item.bottom <= body.bottom + 1
							);
						})
					)
					.toBe(true);
			}
		}
	});
}

test('a dialog status edit moves the card to the new column without reloading', async ({
	page
}) => {
	await load(page, makePlan([kanbanTask('A')]));
	await expect(column(page, 'todo').locator('[data-diagram-task="A"]')).toHaveCount(1);
	await action(page, 'A').click();
	const dialog = page.getByTestId('task-dialog');
	await expect(dialog).toBeVisible();
	await setTaskStatus(page, dialog, 'done');
	await expect(column(page, 'done').locator('[data-diagram-task="A"]')).toHaveCount(1);
	await expect(column(page, 'todo').locator('[data-diagram-task="A"]')).toHaveCount(0);
	await expectCounts(page, [0, 0, 0, 1]);
	await expect(dialog).toBeVisible();
});

test('returns focus to a moved card and reveals it when the task dialog closes on Escape', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.setViewportSize({ width: 520, height: 800 });
	const plan = makePlan([
		...Array.from({ length: 10 }, (_, i) =>
			kanbanTask(`D${String(i + 1).padStart(2, '0')}`, {
				status: 'done',
				createdAt: new Date(Date.UTC(2027, 0, 1, 0, 0, i)).toISOString()
			})
		),
		kanbanTask('A', { createdAt: '2027-01-01T00:00:20.000Z' }),
		...Array.from({ length: 24 }, (_, i) =>
			kanbanTask(`T${String(i + 1).padStart(2, '0')}`, {
				createdAt: new Date(Date.UTC(2027, 0, 1, 0, 1, i)).toISOString()
			})
		)
	]);
	plan.remarks.push({
		id: 'scroll-notes',
		title: 'Scroll notes',
		bullets: Array.from({ length: 30 }, (_, i) => `Scroll note ${i + 1}`)
	});
	await load(page, plan);
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'tabs');
	await expect
		.poll(() => workspaceContent(page).evaluate((el) => el.scrollHeight > el.clientHeight))
		.toBe(true);
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	const fullIsland = await workspaceTabSize(page);
	expect(fullIsland.tab).toBe(40);

	await expect(column(page, 'todo').locator('[data-diagram-task="A"]')).toHaveCount(1);
	await action(page, 'A').click();
	const dialog = page.getByTestId('task-dialog');
	await expect(dialog).toBeVisible();
	await setTaskStatus(page, dialog, 'done');
	await expect(column(page, 'done').locator('[data-diagram-task="A"]')).toHaveCount(1);
	const monitor = await startTimelineIslandMonitor(page);
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await waitForAnimations(page.locator('#timeline'));
	await waitForAnimations(workspaceTabs(page));
	await waitForFrames(page);
	const samples = await monitor.finish();
	expect(samples.length).toBeGreaterThan(1);
	for (const sample of samples) {
		expect(sample).toEqual({ expanded: 'true', ...fullIsland });
	}
	await expect(action(page, 'A')).toBeFocused();
	await expect.poll(() => strip(page).evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
	await expect.poll(() => vertical(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
	await expectKanbanFocusContained(action(page, 'A'));
	await expect(timelineHandle(page)).toHaveAttribute('aria-expanded', 'true');
	expect(await workspaceTabSize(page)).toEqual(fullIsland);
});

test('reveals an offscreen station target when keyboard focus reaches it', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await load(page, done300());
	await keyboardFocus(page, action(page, 'D150'));
	await vertical(page).evaluate((element) => (element.scrollTop = 0));
	await page.keyboard.press('Tab');
	await expect(station(page, 'D150')).toBeFocused();
	await expect
		.poll(() => vertical(page).evaluate((element) => element.scrollTop))
		.toBeGreaterThan(0);
	await expect(station(page, 'D150')).toBeInViewport();
	await expect
		.poll(() =>
			board(page).evaluate((root) => {
				const station = root
					.querySelector('[data-diagram-station="D150"]')!
					.getBoundingClientRect();
				const heading = root
					.querySelector('[data-testid="kanban-heading"]')!
					.getBoundingClientRect();
				return station.top >= heading.bottom - 1;
			})
		)
		.toBe(true);
});

test('retains station focus across an undone column move and falls back after removal', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await load(page, makePlan([kanbanTask('A'), kanbanTask('B')]));
	await action(page, 'A').click();
	const dialog = page.getByTestId('task-dialog');
	await setTaskStatus(page, dialog, 'done');
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await keyboardFocus(page, station(page, 'A'));
	await page.keyboard.press('ControlOrMeta+z');
	await expect(column(page, 'todo').locator('[data-diagram-task="A"]')).toHaveCount(1);
	await expect(station(page, 'A')).toBeFocused();
	await expect(station(page, 'A')).toBeInViewport();

	await action(page, 'A').click();
	await setTaskStatus(page, dialog, 'canceled');
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await page.keyboard.press('ControlOrMeta+z');
	await expect(action(page, 'A')).toHaveCount(1);
	await keyboardFocus(page, station(page, 'A'));
	await page.keyboard.press('ControlOrMeta+Shift+z');
	await expect(action(page, 'A')).toHaveCount(0);
	await expect(page.getByTestId('diagram-view-kanban')).toBeFocused();
});

test('returns focus to the view choice when a removed card has no survivors in its column', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await load(
		page,
		makePlan([
			kanbanTask('U'),
			kanbanTask('A', { dependsOn: ['U'] }),
			kanbanTask('B', { dependsOn: ['A'] })
		])
	);
	await expect(column(page, 'blocked').locator('[data-diagram-task]')).toHaveCount(2);
	await action(page, 'A').click();
	const dialog = page.getByTestId('task-dialog');
	await setTaskStatus(page, dialog, 'canceled');
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await page.keyboard.press('ControlOrMeta+z');
	await expect(action(page, 'A')).toHaveCount(1);
	await keyboardFocus(page, station(page, 'A'));
	await page.keyboard.press('ControlOrMeta+Shift+z');
	await expect(action(page, 'A')).toHaveCount(0);
	await expect(column(page, 'todo').locator('[data-diagram-task="B"]')).toHaveCount(1);
	await expect(page.getByTestId('diagram-view-kanban')).toBeFocused();
});

test('updates the connector as another card reorders its focused endpoint', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.setViewportSize({ width: 1440, height: 1800 });
	await load(
		page,
		makePlan([kanbanTask('B'), kanbanTask('C'), kanbanTask('D', { dependsOn: ['C'] })])
	);
	await action(page, 'B').click();
	const dialog = page.getByTestId('task-dialog');
	await setTaskStatus(page, dialog, 'done');
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await keyboardFocus(page, action(page, 'D'));
	await keyboardFocus(page, station(page, 'C'));
	const line = board(page).getByTestId('kanban-dependency');
	await expect
		.poll(() =>
			board(page).evaluate((root) => {
				const stripRect = root
					.querySelector<HTMLElement>('[data-testid="kanban-strip"]')!
					.getBoundingClientRect();
				const scrollRect = root
					.querySelector<HTMLElement>('[data-testid="kanban-scroll"]')!
					.getBoundingClientRect();
				const heading = root
					.querySelector<HTMLElement>('[data-testid="kanban-heading"]')!
					.getBoundingClientRect();
				const left = Math.max(scrollRect.left, stripRect.left);
				const right = Math.min(scrollRect.right, stripRect.right);
				const top = Math.max(scrollRect.top, stripRect.top) + heading.height;
				const bottom = Math.min(scrollRect.bottom, stripRect.bottom);
				return ['C', 'D'].every((id) => {
					const box = root
						.querySelector<HTMLElement>(`[data-diagram-task="${id}"]`)!
						.getBoundingClientRect();
					const dot = root
						.querySelector<HTMLElement>(`[data-diagram-station="${id}"]`)!
						.getBoundingClientRect();
					return (
						box.left >= left - 1 &&
						box.right <= right + 1 &&
						box.top >= top - 1 &&
						box.bottom <= bottom + 1 &&
						dot.left >= left - 1 &&
						dot.right <= right + 1 &&
						dot.top >= top - 1 &&
						dot.bottom <= bottom + 1
					);
				});
			})
		)
		.toBe(true);
	await expect(line).toHaveCount(1);
	await expect(line).toHaveAttribute('data-from', 'C');
	await expect(line).toHaveAttribute('data-to', 'D');
	await page.keyboard.press('ControlOrMeta+z');
	await expect
		.poll(() => card(page, 'C').evaluate((node) => node.getAnimations().length))
		.toBeGreaterThan(0);
	await waitForAnimations(board(page));
	await expect(station(page, 'C')).toBeFocused();
	await expect(line).toHaveCount(1);
	await expect(line).toHaveAttribute('data-from', 'C');
	await expect(line).toHaveAttribute('data-to', 'D');
	await expect
		.poll(() =>
			board(page).evaluate((root) => {
				const path = root.querySelector<SVGPathElement>('[data-testid="kanban-dependency"]')!;
				const dot = root.querySelector<HTMLElement>('[data-diagram-station="C"]')!;
				const base = root.getBoundingClientRect();
				const rect = dot.getBoundingClientRect();
				const point = path.getPointAtLength(0);
				return Math.hypot(
					point.x + base.left - rect.left - rect.width / 2,
					point.y + base.top - rect.top - rect.height / 2
				);
			})
		)
		.toBeLessThan(2);
});

test('keeps Kanban, dialog edits and Preview available after an offline reload', async ({
	page,
	context
}) => {
	await load(page, makePlan([kanbanTask('A')]));
	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);
	try {
		await context.setOffline(true);
		await page.reload();
		await expectView(page, 'kanban');
		await action(page, 'A').click();
		const dialog = page.getByTestId('task-dialog');
		await expect(dialog).toBeVisible();
		await setTaskStatus(page, dialog, 'done');
		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);
		await page.reload();
		await expectView(page, 'kanban');
		await expectCounts(page, [0, 0, 0, 1]);
		const preview = await openPreview(page);
		await preview.getByTestId('print-diagram-kanban').click();
		await expect(
			preview.locator('[data-fragment="kanban-scene"]').getByTestId('sheet-kanban-card')
		).toHaveCount(1);
	} finally {
		await context.setOffline(false);
	}
});
