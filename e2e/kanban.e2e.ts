import { expect, test, type Page } from '@playwright/test';
import { SCHEMA_VERSION, type Plan } from '#lib/domain/schema.ts';
import { makePlan } from '#lib/domain/test-helpers.ts';
import {
	done300,
	kanbanTask,
	mixedBoard,
	unrelatedCycle
} from '#lib/scene/kanban-fixtures.test-helper.ts';
import {
	chooseView,
	diagramStage,
	expectView,
	focusPreviousControl,
	importJson,
	openApp,
	openPreview,
	setTaskStatus,
	waitForAnimations
} from './helpers.ts';

const board = (page: Page) => page.getByTestId('kanban');
const vertical = (page: Page) => board(page).getByTestId('kanban-scroll');
const strip = (page: Page) => board(page).getByTestId('kanban-strip');
const column = (page: Page, id: string) =>
	board(page).locator(`[data-testid="kanban-column"][data-column="${id}"]`);
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
	const columns = board(page).getByTestId('kanban-column');
	await expect(columns).toHaveCount(4);
	for (const [i, id] of ['blocked', 'todo', 'in_progress', 'done'].entries()) {
		await expect(columns.nth(i)).toHaveAttribute('data-column', id);
		await expect(column(page, id).getByTestId('kanban-count')).toHaveText(String(counts[i]));
	}
}

async function keyboardFocus(page: Page, target: ReturnType<typeof action>) {
	await focusPreviousControl(target);
	await page.keyboard.press('Tab');
	await expect(target).toBeFocused();
}

test('selects Kanban in the existing Timeline and keeps Gantt available', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await load(page, mixedBoard());
	await expectView(page, 'kanban');
	await expectCounts(page, [1, 3, 1, 3]);
	await expect(board(page).locator('[data-diagram-task]')).toHaveCount(8);
	await expect(page.getByTestId('diagram-view-gantt')).toBeVisible();
	await chooseView(page, 'gantt');
	await expect(page.getByTestId('gantt')).toBeVisible();
	await chooseView(page, 'kanban');
	await expectCounts(page, [1, 3, 1, 3]);
});

test('retains done-300 with equal cards, an unbroken title, sticky headings and keyboard endpoints', async ({
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
				const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
				const cards = [...root.querySelectorAll<HTMLElement>('[data-diagram-task]')];
				const done = root.querySelector<HTMLElement>('[data-column="done"]')!;
				const long = root.querySelector<HTMLElement>('[data-diagram-task="D150"]')!;
				return (
					cards.every((node) => Math.abs(node.getBoundingClientRect().height - 11 * rem) < 0.6) &&
					long.getBoundingClientRect().width <= done.getBoundingClientRect().width + 0.5 &&
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

test('fits a whole column when the board strip is narrower than 16rem', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await load(page, makePlan([kanbanTask('A')]));
	await board(page).evaluate((element) => (element.style.maxWidth = '200px'));
	await expect
		.poll(() =>
			strip(page).evaluate((element) => {
				const column = element.querySelector<HTMLElement>('[data-column="todo"]')!;
				return column.getBoundingClientRect().width <= element.clientWidth + 1;
			})
		)
		.toBe(true);
	await expect
		.poll(() => strip(page).evaluate((element) => element.scrollWidth > element.clientWidth))
		.toBe(true);
});

test('Preview paginates each Done id once with repeated counts on landscape A4 and Letter', async ({
	page
}) => {
	test.setTimeout(120000);
	await page.setViewportSize({ width: 1440, height: 1000 });
	const plan = done300(true);
	await load(page, plan);
	const preview = await openPreview(page);
	await preview.getByTestId('print-diagram-kanban').click();
	await preview.getByTestId('print-diagram-gantt').click();
	for (const paper of ['a4', 'letter']) {
		await preview.getByTestId(`paper-${paper}`).click();
		const fragments = preview.locator('[data-fragment="kanban-scene"]');
		const cards = fragments.getByTestId('sheet-kanban-card');
		await expect
			.poll(() =>
				cards.evaluateAll((items) => items.map((item) => item.getAttribute('data-task-id')))
			)
			.toEqual(plan.tasks.map((task) => task.id));
		expect(await fragments.count()).toBeGreaterThan(1);
		await expect
			.poll(() =>
				fragments.evaluateAll((items) =>
					items.every((fragment) => {
						const sheet = fragment.closest<HTMLElement>('[data-testid="sheet"]')!;
						const repeat = fragment.querySelector('[data-part="repeat"]')!;
						const counts = [...repeat.querySelectorAll('[data-testid="kanban-count"]')].map(
							(count) => count.textContent?.trim()
						);
						return (
							sheet.dataset.orientation === 'landscape' &&
							/Kanban/.test(repeat.textContent ?? '') &&
							['Blocked', 'Todo', 'In progress', 'Done'].every((label) =>
								repeat.textContent?.includes(label)
							) &&
							counts.join('/') === '0/0/0/300'
						);
					})
				)
			)
			.toBe(true);
		await expect
			.poll(() =>
				cards.evaluateAll((items) =>
					items.every((item) => {
						const card = item.getBoundingClientRect();
						const row = item.closest('[data-item]')!.getBoundingClientRect();
						return (
							Math.abs(card.height - (34 * 96) / 25.4) < 0.6 &&
							card.top >= row.top - 0.6 &&
							card.bottom <= row.bottom + 0.6
						);
					})
				)
			)
			.toBe(true);
		await expect(
			fragments.locator('button, [data-route], [data-testid="kanban-dependency"]')
		).toHaveCount(0);
	}
	await page.emulateMedia({ media: 'print' });
	await expect(
		preview.locator('[data-fragment="kanban-scene"]').getByTestId('sheet-kanban-card')
	).toHaveCount(300);
	await page.emulateMedia({ media: 'screen' });
});

test('prints a pale Done stage rule while retaining the solid station dot', async ({ page }) => {
	await load(page, makePlan([kanbanTask('open'), kanbanTask('done', { status: 'done' })]));
	const preview = await openPreview(page);
	await preview.getByTestId('print-diagram-kanban').click();
	const open = preview.locator(
		'[data-fragment="kanban-scene"] [data-testid="sheet-kanban-card"][data-task-id="open"]'
	);
	const done = preview.locator(
		'[data-fragment="kanban-scene"] [data-testid="sheet-kanban-card"][data-task-id="done"]'
	);
	await expect(open).toHaveCount(1);
	await expect(done).toHaveCount(1);
	const paint = (selector: typeof open) =>
		selector.evaluate((element) => ({
			rule: getComputedStyle(element).borderLeftColor,
			dot: getComputedStyle(element.querySelector('svg.station-dot')!).color,
			circles: element.querySelectorAll('svg.station-dot circle').length
		}));
	const openPaint = await paint(open);
	const donePaint = await paint(done);
	expect(donePaint.rule).not.toBe(openPaint.rule);
	expect(donePaint.dot).toBe(openPaint.dot);
	expect(donePaint.circles).toBe(1);
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

test('keeps unrelated cycle connectors hidden until their own route is focused', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 1800 });
	await load(page, unrelatedCycle());
	const lines = board(page).getByTestId('kanban-dependency');
	await page.mouse.move(0, 0);
	await expect(lines).toHaveCount(0);
	await keyboardFocus(page, station(page, 'A'));
	await expect
		.poll(() =>
			lines.evaluateAll((items) =>
				items.map((item) => `${item.getAttribute('data-from')}->${item.getAttribute('data-to')}`)
			)
		)
		.toEqual(['A->B']);
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
	await page.waitForTimeout(350);
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
				await expect(target).toBeInViewport();
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
	await expect(action(page, 'B')).toBeFocused();
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
	await keyboardFocus(page, station(page, 'C'));
	const line = board(page).getByTestId('kanban-dependency');
	await expect(line).toHaveCount(1);
	await page.keyboard.press('ControlOrMeta+z');
	await expect
		.poll(() => card(page, 'C').evaluate((node) => node.getAnimations().length))
		.toBeGreaterThan(0);
	await waitForAnimations(board(page));
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
