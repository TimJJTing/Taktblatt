import { describe, expect, it } from 'vitest';
import { createEmptyPlan } from '#lib/domain/factory.js';
import { MemoryStorage } from './memory-storage';
import { KEYS } from './storage';
import { ViewerState } from './viewer.svelte';
import { Workspace } from './workspace.svelte';

const open = (storage = new MemoryStorage()) => ({
	storage,
	ws: new Workspace(storage, () => 'en')
});

describe('Workspace', () => {
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
		const again = new Workspace(storage, () => 'en');
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
		const incoming = { ...createEmptyPlan('en'), id: existing.id, heading: 'Imported' };
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
		ws.loadExample();
		expect(ws.plan.id).toBe(id);
		expect(ws.plan.tasks.length).toBeGreaterThan(0);
		ws.undo();
		expect(ws.isPristine).toBe(true);
	});

	it('loads a change from a different tab', () => {
		const { storage, ws } = open();
		const other = new Workspace(storage, () => 'en');
		other.commit((p) => (p.heading = 'From tab 2'));
		ws.handleStorageEvent({
			key: KEYS.plan(ws.plan.id),
			newValue: storage.getItem(KEYS.plan(ws.plan.id))
		});
		expect(ws.plan.heading).toBe('From tab 2');
		expect(ws.plans[0].heading).toBe('From tab 2');
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
