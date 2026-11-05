import { describe, expect, it } from 'vitest';
import { createEmptyPlan, createTask } from '#lib/domain/factory.js';
import { SCHEMA_VERSION } from '#lib/domain/schema.js';
import { loadExample } from './commands';
import { MemoryStorage } from './memory-storage';
import { KEYS, StorageWriteError } from './storage';
import { ViewerState } from './viewer.svelte';
import { Workspace } from './workspace.svelte';

const open = (storage = new MemoryStorage()) => ({
	storage,
	ws: new Workspace(storage)
});

describe('Workspace', () => {
	it('drops an old locale key from a stored plan at the next save', () => {
		const storage = new MemoryStorage();
		const plan = createEmptyPlan('2027-04-01');
		const stored = JSON.stringify({
			schemaVersion: SCHEMA_VERSION,
			plan: { ...plan, locale: 'ja' }
		});
		storage.setItem(KEYS.plan(plan.id), stored);
		storage.setItem(KEYS.index, JSON.stringify({ planIds: [plan.id], activeId: plan.id }));
		const ws = new Workspace(storage);
		ws.commit((p) => (p.heading = 'Roadmap'));
		const raw = storage.getItem(KEYS.plan(plan.id))!;
		expect(raw).toContain('Roadmap');
		expect(raw).not.toContain('locale');
	});

	it('creates an empty plan on the first start and saves it', () => {
		const { storage, ws } = open();
		expect(ws.plans).toHaveLength(1);
		expect(ws.isPristine).toBe(true);
		expect(storage.getItem(KEYS.plan(ws.plan.id))).not.toBeNull();
		expect(JSON.parse(storage.getItem(KEYS.index)!).activeId).toBe(ws.plan.id);
	});

	it('saves each commit and loads the plan again', () => {
		const { storage, ws } = open();
		ws.commit((p) => (p.heading = 'Roadmap'));
		const again = new Workspace(storage);
		expect(again.plan.heading).toBe('Roadmap');
		expect(again.plans[0].heading).toBe('Roadmap');
	});

	it('does not record a commit that changes nothing', () => {
		const { ws } = open();
		ws.commit(() => {});
		expect(ws.history.canUndo).toBe(false);
	});

	it('undoes and redoes commits', () => {
		const { ws } = open();
		ws.commit((p) => (p.heading = 'One'));
		ws.commit((p) => (p.heading = 'Two'));
		ws.undo();
		expect(ws.plan.heading).toBe('One');
		ws.redo();
		expect(ws.plan.heading).toBe('Two');
	});

	it('does not redo a task discarded by rollback after undo', () => {
		const { storage, ws } = open();
		ws.commit((p) => p.tasks.push(createTask(p.stages[0].id)));
		ws.commit((p) => (p.tasks[0].title = 'Draft'));
		expect(ws.undo()).toBe(true);
		expect(ws.plan.tasks[0].title).toBe('');
		expect(ws.history.canRedo).toBe(true);
		expect(ws.rollback()).toBe(true);
		expect(ws.history.canRedo).toBe(false);
		expect(ws.redo()).toBe(false);
		expect(ws.plan.tasks).toHaveLength(0);
		expect(new Workspace(storage).plan.tasks).toHaveLength(0);
	});

	it('keeps damaged data, starts with an empty plan and reports it', () => {
		const storage = new MemoryStorage();
		storage.setItem(KEYS.index, JSON.stringify({ planIds: ['bad'], activeId: 'bad' }));
		storage.setItem(KEYS.plan('bad'), '{not json');
		const { ws } = open(storage);
		expect(ws.damaged).toHaveLength(1);
		expect(storage.getItem(ws.damaged[0].key)).toBe('{not json');
		expect(ws.plans).toHaveLength(1);
		expect(storage.getItem(KEYS.plan('bad'))).toBeNull();
	});

	it('creates, switches, duplicates, deletes and restores plans', () => {
		const { ws } = open();
		const first = ws.plan.id;
		ws.commit((p) => (p.heading = 'A'));
		ws.duplicatePlan(' (copy)');
		expect(ws.plans.map((p) => p.heading)).toEqual(['A', 'A (copy)']);
		expect(ws.history.canUndo).toBe(false);
		const deleted = ws.deletePlan(ws.plan.id)!;
		expect(ws.plan.id).toBe(first);
		ws.restorePlan(deleted);
		expect(ws.plans.map((p) => p.heading)).toEqual(['A', 'A (copy)']);
		expect(ws.plan.heading).toBe('A (copy)');
		ws.switchTo(first);
		expect(ws.plan.heading).toBe('A');
	});

	it('replaces the last plan with an empty plan when you delete it', () => {
		const { ws } = open();
		const id = ws.plan.id;
		ws.deletePlan(id);
		expect(ws.plans).toHaveLength(1);
		expect(ws.plan.id).not.toBe(id);
	});

	it('imports plans and resolves id conflicts', () => {
		const { ws } = open();
		const existing = JSON.parse(JSON.stringify(ws.plan));
		const incoming = { ...createEmptyPlan(), id: existing.id, heading: 'Imported' };
		expect(ws.importConflicts([incoming])).toHaveLength(1);
		ws.importPlans([incoming], () => 'keep-both', ' (copy)');
		expect(ws.plans.map((p) => p.heading)).toEqual(['', 'Imported (copy)']);
		ws.importPlans([incoming], () => 'replace', ' (copy)');
		expect(ws.plans.map((p) => p.heading)).toEqual(['Imported', 'Imported (copy)']);
		expect(ws.plan.heading).toBe('Imported');
	});

	it('loads the example into a pristine plan and can undo it', () => {
		const { ws } = open();
		const id = ws.plan.id;
		loadExample(ws);
		expect(ws.plan.id).toBe(id);
		expect(ws.plan.tasks.length).toBeGreaterThan(0);
		ws.undo();
		expect(ws.isPristine).toBe(true);
	});

	it('loads a change from a different tab', () => {
		const { storage, ws } = open();
		const other = new Workspace(storage);
		other.commit((p) => (p.heading = 'From tab 2'));
		ws.handleStorageEvent({
			key: KEYS.plan(ws.plan.id),
			newValue: storage.getItem(KEYS.plan(ws.plan.id))
		});
		expect(ws.plan.heading).toBe('From tab 2');
		expect(ws.plans[0].heading).toBe('From tab 2');
	});

	it.each([true, false])(
		'loads the latest stored plan for a queued event (active: %s)',
		(active) => {
			const { storage, ws } = open();
			const id = ws.plan.id;
			const other = new Workspace(storage);
			if (!active) ws.createPlan();
			ws.commit((p) => (p.heading = 'Local edit'));
			other.commit((p) => (p.heading = 'Older write'));
			const event = { key: KEYS.plan(id), newValue: storage.getItem(KEYS.plan(id)) };
			other.commit((p) => (p.heading = 'Latest write'));
			ws.handleStorageEvent(event);
			expect(ws.plans.find((p) => p.id === id)?.heading).toBe('Latest write');
			expect(ws.plan.heading).toBe(active ? 'Latest write' : 'Local edit');
			expect(ws.history.canUndo).toBe(!active);
		}
	);

	it.each([false, true])('ignores a plan event when its key is gone (removal: %s)', (removal) => {
		const { storage, ws } = open();
		ws.commit((p) => (p.heading = 'Local edit'));
		const other = new Workspace(storage);
		other.commit((p) => (p.heading = 'Deleted write'));
		const key = KEYS.plan(ws.plan.id);
		const newValue = removal ? null : storage.getItem(key);
		storage.removeItem(key);
		ws.handleStorageEvent({ key, newValue });
		expect(ws.plan.heading).toBe('Local edit');
		expect(ws.plans[0].heading).toBe('Local edit');
		expect(ws.history.canUndo).toBe(true);
		expect(storage.getItem(key)).toBeNull();
	});

	it('loads the current plan for a queued removal event after the key is restored', () => {
		const { storage, ws } = open();
		const other = new Workspace(storage);
		const key = KEYS.plan(ws.plan.id);
		storage.removeItem(key);
		const event = { key, newValue: null };
		other.commit((p) => (p.heading = 'Restored write'));
		ws.handleStorageEvent(event);
		expect(ws.plan.heading).toBe('Restored write');
		expect(ws.plans[0].heading).toBe('Restored write');
	});
});

describe('ViewerState', () => {
	it('keeps the expand state for each plan and the Gantt settings', () => {
		const storage = new MemoryStorage();
		const viewer = new ViewerState(storage);
		viewer.toggleExpanded('p1', 't1');
		viewer.setGanttPinned(true);
		viewer.setGanttHeight(0.9);
		const again = new ViewerState(storage);
		expect(again.isExpanded('p1', 't1')).toBe(true);
		expect(again.isExpanded('p2', 't1')).toBe(false);
		expect(again.ganttPinned).toBe(true);
		expect(again.ganttHeight).toBe(0.5);
	});
});

it.each(['switch', 'plan-event', 'index-event', 'export', 'delete'])(
	'keeps invalid stored data and reports it during %s',
	(action) => {
		const { storage, ws } = open();
		const id = ws.plan.id;
		ws.createPlan();
		const activeId = ws.plan.id;
		storage.setItem(KEYS.plan(id), '{broken');
		if (action === 'switch') ws.switchTo(id);
		if (action === 'plan-event') ws.handleStorageEvent({ key: KEYS.plan(id), newValue: '{broken' });
		if (action === 'index-event')
			ws.handleStorageEvent({ key: KEYS.index, newValue: storage.getItem(KEYS.index) });
		if (action === 'export') ws.allPlans();
		if (action === 'delete') ws.deletePlan(id);
		expect(ws.damaged).toHaveLength(1);
		expect(storage.getItem(ws.damaged[0].key)).toBe('{broken');
		expect(ws.plan.id).toBe(activeId);
	}
);

it('keeps an invalid index received from another tab', () => {
	const { storage, ws } = open();
	storage.setItem(KEYS.index, 'invalid');
	ws.handleStorageEvent({ key: KEYS.index, newValue: 'invalid' });
	expect(ws.damaged).toHaveLength(1);
	expect(storage.getItem(ws.damaged[0].key)).toBe('invalid');
});

/** A storage that throws once, on write number `failOn`, like a full localStorage. */
class QuotaStorage extends MemoryStorage {
	failOn = Infinity;

	setItem(key: string, value: string): void {
		this.failOn -= 1;
		if (this.failOn === 0) throw new DOMException('full', 'QuotaExceededError');
		super.setItem(key, value);
	}
}

describe('Workspace import when the storage is full', () => {
	it('restores the stored plans and keeps the list unchanged', () => {
		const storage = new QuotaStorage();
		const ws = new Workspace(storage);
		const existing = ws.activePlan();
		const before = Object.fromEntries(
			[KEYS.index, KEYS.plan(existing.id)].map((key) => [key, storage.getItem(key)])
		);
		const replaced = { ...structuredClone(existing), heading: 'Replaced' };
		const fresh1 = createEmptyPlan('2027-04-01');
		const fresh2 = createEmptyPlan('2027-04-01');
		// The first two plan writes work. The third write fails.
		storage.failOn = 3;
		expect(() => ws.importPlans([replaced, fresh1, fresh2], () => 'replace', ' (copy)')).toThrow(
			StorageWriteError
		);
		expect(storage.getItem(KEYS.plan(existing.id))).toBe(before[KEYS.plan(existing.id)]);
		expect(storage.getItem(KEYS.plan(fresh1.id))).toBeNull();
		expect(storage.getItem(KEYS.plan(fresh2.id))).toBeNull();
		expect(storage.getItem(KEYS.index)).toBe(before[KEYS.index]);
		expect(ws.plans.map((p) => p.id)).toEqual([existing.id]);
		expect(ws.plan.heading).toBe(existing.heading);
	});

	it('restores the plans when only the index write fails', () => {
		const storage = new QuotaStorage();
		const ws = new Workspace(storage);
		const fresh = createEmptyPlan('2027-04-01');
		// The plan write works. The index write fails.
		storage.failOn = 2;
		expect(() => ws.importPlans([fresh], () => 'keep-both', ' (copy)')).toThrow(StorageWriteError);
		expect(storage.getItem(KEYS.plan(fresh.id))).toBeNull();
		expect(ws.plans).toHaveLength(1);
	});
});
