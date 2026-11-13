import '../../../routes/layout.css';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import { fixtureView } from '#lib/components/diagram/fixture-views.test-helper.ts';
import { createViewRegistry, type ViewRegistry } from '#lib/components/diagram/view-registry.ts';
import { view as ganttView } from '#lib/components/timeline/diagram-view.ts';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { getLocale, overwriteGetLocale } from '#lib/paraglide/runtime.js';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { ViewerState } from '#lib/state/viewer.svelte.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import PreviewTest from './PreviewDialog.test.svelte';

const listView = fixtureView('test-list', { order: 15, label: 'Test list' });
const boardView = fixtureView('test-board', {
	order: 25,
	label: 'Test board',
	orientation: 'landscape'
});
const DIAGRAM_FRAGMENTS = ['gantt', 'test-list-scene', 'test-board-scene'];

const originalLocale = getLocale;
let ws: Workspace;
beforeEach(() => {
	ws = new Workspace(new MemoryStorage());
	ws.commit((plan) => {
		const stageId = plan.stages[0].id;
		plan.range = { start: '2027-01-01', end: '2027-02-28' };
		plan.tasks = Array.from({ length: 6 }, (_, i) =>
			makeTask({
				id: `task-${i}`,
				title: `Task ${i}`,
				stageId,
				start: '2027-01-04',
				end: '2027-02-10'
			})
		);
	});
});
afterEach(() => overwriteGetLocale(originalLocale));

async function mount(registry: ViewRegistry) {
	const viewer = new ViewerState(new MemoryStorage(), registry.ids);
	const screen = await render(PreviewTest, { workspace: ws, viewer, registry });
	const container = screen.container;
	await document.fonts.ready;
	const checkbox = (id: string) =>
		container.querySelector<HTMLButtonElement>(`[data-testid="print-diagram-${id}"]`)!;
	const sheets = () => [...container.querySelectorAll<HTMLElement>('[data-testid="sheet"]')];
	/** The diagram fragments of each sheet, in sheet order. */
	const layout = () =>
		sheets().map((sheet) => ({
			orientation: sheet.dataset.orientation,
			fragments: [...sheet.querySelectorAll<HTMLElement>('[data-fragment]')].map(
				(fragment) => fragment.dataset.fragment!
			)
		}));
	const diagramOrder = () => [
		...new Set(
			layout()
				.flatMap((sheet) => sheet.fragments)
				.filter((id) => DIAGRAM_FRAGMENTS.includes(id))
		)
	];
	await expect.poll(() => sheets().length).toBeGreaterThan(0);
	return { container, viewer, checkbox, sheets, layout, diagramOrder };
}

const threeViews = () => createViewRegistry([boardView, ganttView, listView]);

describe('Preview diagram selection', () => {
	it('keeps the last selected diagram and explains why in the UI language', async () => {
		overwriteGetLocale(() => 'de');
		const { container, checkbox } = await mount(threeViews());
		const group = container.querySelector<HTMLElement>('[data-testid="print-diagrams"]')!;
		expect(group.getAttribute('role')).toBe('group');
		expect(group.getAttribute('aria-label')).toBe('Zu druckende Diagramme');
		expect(group.textContent).toMatch(/Gantt.*Test list.*Test board/);
		expect(checkbox('gantt').getAttribute('aria-checked')).toBe('true');
		expect(checkbox('gantt').disabled).toBe(true);
		for (const id of ['test-list', 'test-board']) {
			expect(checkbox(id).getAttribute('aria-checked')).toBe('false');
			expect(checkbox(id).disabled).toBe(false);
		}
		const min = container.querySelector<HTMLElement>('[data-testid="print-diagrams-min"]')!;
		expect(min.textContent?.trim()).toBe('Mindestens ein Diagramm auswählen');
		expect(min.checkVisibility()).toBe(true);
		expect(group.getAttribute('aria-describedby')).toBe(min.id);

		await userEvent.click(checkbox('test-list'));
		await expect.poll(() => checkbox('gantt').disabled).toBe(false);
		expect(container.querySelector('[data-testid="print-diagrams-min"]')).toBeNull();
	});

	it('prints selected diagrams in registry order, whatever the click order, with one page total', async () => {
		const { viewer, checkbox, sheets, layout, diagramOrder } = await mount(threeViews());
		expect(diagramOrder()).toEqual(['gantt']);
		await userEvent.click(checkbox('test-board'));
		await expect.poll(diagramOrder).toEqual(['gantt', 'test-board-scene']);
		await userEvent.click(checkbox('test-list'));
		await expect.poll(diagramOrder).toEqual(['gantt', 'test-list-scene', 'test-board-scene']);
		expect(viewer.printDiagrams).toEqual(['gantt', 'test-list', 'test-board']);

		// Each diagram after the first starts on a new sheet.
		const sheetOf = (id: string) => layout().findIndex((sheet) => sheet.fragments.includes(id));
		const list = sheetOf('test-list-scene');
		expect(layout()[list].fragments[0]).toBe('test-list-scene');
		expect(list).toBeGreaterThan(sheetOf('gantt'));
		expect(sheetOf('test-board-scene')).toBeGreaterThan(list);
		const totals = sheets().map(
			(sheet) => sheet.querySelector('[data-testid="page-number"]')?.textContent?.trim() ?? ''
		);
		expect(totals).toEqual(totals.map((_, i) => `${i + 1} / ${totals.length}`));

		await userEvent.click(checkbox('test-list'));
		await expect.poll(diagramOrder).toEqual(['gantt', 'test-board-scene']);
	});

	it('prints a landscape diagram on its own landscape sheets', async () => {
		const { checkbox, sheets, layout } = await mount(threeViews());
		await userEvent.click(checkbox('test-board'));
		await expect
			.poll(() => layout().some((sheet) => sheet.fragments.includes('test-board-scene')))
			.toBe(true);
		for (const sheet of layout()) {
			const board = sheet.fragments.includes('test-board-scene');
			expect(sheet.orientation).toBe(board ? 'landscape' : 'portrait');
			if (board) expect(sheet.fragments.every((id) => id === 'test-board-scene')).toBe(true);
		}
		const wide = sheets().find((sheet) => sheet.dataset.orientation === 'landscape')!;
		const box = wide.getBoundingClientRect();
		expect(box.width).toBeGreaterThan(box.height);

		// A landscape first diagram starts a new sheet after the portrait header.
		await userEvent.click(checkbox('gantt'));
		await expect
			.poll(() => layout().some((sheet) => sheet.fragments.includes('gantt')))
			.toBe(false);
		const [first, second] = layout();
		expect(first).toEqual({ orientation: 'portrait', fragments: ['header'] });
		expect(second.orientation).toBe('landscape');
		expect(second.fragments[0]).toBe('test-board-scene');
		// The stage overview after a landscape last diagram starts a portrait sheet.
		const rest = layout().slice(2);
		const after = rest.find((sheet) => !sheet.fragments.includes('test-board-scene'));
		expect(after?.orientation).toBe('portrait');
	});

	it('has no diagram group with Gantt alone', async () => {
		const { container, diagramOrder } = await mount(createViewRegistry([ganttView]));
		expect(container.querySelector('[data-testid="print-diagrams"]')).toBeNull();
		expect(diagramOrder()).toEqual(['gantt']);
	});
});
