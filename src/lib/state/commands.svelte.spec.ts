import { describe, expect, it, vi } from 'vitest';
import {
	addTask,
	addMilestone,
	updateMilestone,
	removeMilestone,
	addBand,
	updateBand,
	removeBand,
	updateTask,
	addRemarkSection,
	updateRemarkSection,
	updatePlan,
	updateFooter,
	discardNewTask,
	reorderStages,
	reorderRemarks,
	discardNewRemarkSection,
	moveRemarkSection
} from './commands';
import { MemoryStorage } from './memory-storage';
import { Workspace } from './workspace.svelte';

const open = () => new Workspace(new MemoryStorage(), () => 'en');

describe('commands', () => {
	it.each(['stages', 'remarks'] as const)('requires an exact permutation for %s', (kind) => {
		const ws = open();
		ws.commit((plan) => {
			plan.stages = ['a', 'b'].map((id) => ({ id, title: id, description: '', color: 'blue' }));
			plan.remarks = ['a', 'b'].map((id) => ({ id, title: id, bullets: [] }));
		});
		ws.history.clear();
		const commit = vi.spyOn(ws, 'commit');
		const reorder = kind === 'stages' ? reorderStages : reorderRemarks;
		for (const ids of [[], ['a'], ['a', 'a'], ['a', 'unknown'], ['a', 'b', 'b']]) reorder(ws, ids);
		expect(commit).not.toHaveBeenCalled();
		expect(ws.plan[kind].map((item) => item.id)).toEqual(['a', 'b']);
		reorder(ws, ['b', 'a']);
		expect(ws.plan[kind].map((item) => item.id)).toEqual(['b', 'a']);
		expect(ws.undo()).toBe(true);
		expect(ws.plan[kind].map((item) => item.id)).toEqual(['a', 'b']);
	});

	it('uses the same task normalization for add and update', () => {
		const ws = open();
		const patch = { title: ' Task ', deliverable: ' Result ', owners: [' Ana ', 'ana', ''] };
		const id = addTask(ws, ws.plan.stages[0].id, { parentId: null, patch });
		expect(ws.plan.tasks[0]).toMatchObject({
			title: 'Task',
			deliverable: 'Result',
			owners: ['Ana']
		});
		updateTask(ws, id, patch);
		expect(ws.plan.tasks[0]).toMatchObject({
			title: 'Task',
			deliverable: 'Result',
			owners: ['Ana']
		});
	});

	it('normalizes remarks, plan fields and footer fields', () => {
		const ws = open();
		const patch = { title: ' Notes ', bullets: [' A ', ' ', 'B'] };
		const id = addRemarkSection(ws, patch);
		expect(ws.plan.remarks[0]).toMatchObject({ title: 'Notes', bullets: ['A', 'B'] });
		updateRemarkSection(ws, id, patch);
		expect(ws.plan.remarks[0]).toMatchObject({ title: 'Notes', bullets: ['A', 'B'] });
		updatePlan(ws, { heading: ' Plan ', subheading: ' Sub ', objective: ' Goal ' });
		updateFooter(ws, { note: ' Note ', version: ' v1 ', right: ' Right ' });
		expect(ws.plan).toMatchObject({
			heading: 'Plan',
			subheading: ' Sub ',
			objective: 'Goal',
			footer: { note: 'Note', version: 'v1', right: 'Right' }
		});
	});

	it('discards a new empty remark section without an undo or redo step', () => {
		const ws = open();
		const id = addRemarkSection(ws);
		discardNewRemarkSection(ws, id);
		expect(ws.plan.remarks).toHaveLength(0);
		expect(ws.history.canUndo).toBe(false);
		expect(ws.history.canRedo).toBe(false);
	});

	it('keeps a remark section with content, and removes an emptied section on update', () => {
		const ws = open();
		const id = addRemarkSection(ws, { title: 'Risks' });
		discardNewRemarkSection(ws, id);
		expect(ws.plan.remarks).toHaveLength(1);
		const other = addRemarkSection(ws, { bullets: ['A'] });
		updateRemarkSection(ws, other, { bullets: [' '] });
		expect(ws.plan.remarks.map((r) => r.id)).toEqual([id]);
		expect(ws.undo()).toBe(true);
		expect(ws.plan.remarks.find((r) => r.id === other)?.bullets).toEqual(['A']);
	});

	it('moves a remark section and ignores moves past the ends', () => {
		const ws = open();
		const a = addRemarkSection(ws, { title: 'A' });
		const b = addRemarkSection(ws, { title: 'B' });
		moveRemarkSection(ws, a, -1);
		expect(ws.plan.remarks.map((r) => r.id)).toEqual([a, b]);
		moveRemarkSection(ws, a, 1);
		expect(ws.plan.remarks.map((r) => r.id)).toEqual([b, a]);
	});

	it('discards a new empty task without an undo or redo step', () => {
		const ws = open();
		const id = addTask(ws, ws.plan.stages[0].id);
		discardNewTask(ws, id);
		expect(ws.plan.tasks).toHaveLength(0);
		expect(ws.history.canUndo).toBe(false);
		expect(ws.history.canRedo).toBe(false);
	});

	it('keeps other edits when an older empty task is discarded', () => {
		const ws = open();
		const id = addTask(ws, ws.plan.stages[0].id);
		updatePlan(ws, { heading: 'Keep' });
		discardNewTask(ws, id);
		expect(ws.plan.tasks).toHaveLength(0);
		expect(ws.plan.heading).toBe('Keep');
		ws.undo();
		expect(ws.plan.tasks[0].id).toBe(id);
	});

	it('keeps tasks with content or children', () => {
		const ws = open();
		const id = addTask(ws, ws.plan.stages[0].id);
		addTask(ws, ws.plan.stages[0].id, { parentId: id });
		discardNewTask(ws, id);
		expect(ws.plan.tasks).toHaveLength(2);
		updateTask(ws, id, { done: true });
		discardNewTask(ws, id);
		expect(ws.plan.tasks).toHaveLength(2);
	});
});

describe('timeline commands', () => {
	it('adds, updates and deletes a milestone with one commit for each change', () => {
		const ws = open();
		const commit = vi.spyOn(ws, 'commit');
		const id = addMilestone(ws, {
			title: ' Review ',
			description: ' Discuss ',
			date: '2027-03-01',
			symbol: 'flag'
		});
		expect(commit).toHaveBeenCalledTimes(1);
		expect(ws.plan.milestones[0]).toMatchObject({
			id,
			title: 'Review',
			description: 'Discuss',
			date: '2027-03-01',
			symbol: 'flag'
		});
		expect(ws.undo()).toBe(true);
		expect(ws.plan.milestones).toEqual([]);
		expect(ws.undo()).toBe(false);
		ws.redo();
		ws.history.clear();
		updateMilestone(ws, id, {
			title: ' Launch ',
			description: ' Ship ',
			date: '2027-04-01',
			symbol: 'star'
		});
		expect(commit).toHaveBeenCalledTimes(2);
		expect(ws.plan.milestones[0]).toMatchObject({
			title: 'Launch',
			description: 'Ship',
			date: '2027-04-01',
			symbol: 'star'
		});
		ws.undo();
		expect(ws.plan.milestones[0].title).toBe('Review');
		expect(ws.undo()).toBe(false);
		ws.history.clear();
		removeMilestone(ws, id);
		expect(commit).toHaveBeenCalledTimes(3);
		expect(ws.plan.milestones).toEqual([]);
		ws.undo();
		expect(ws.plan.milestones[0].id).toBe(id);
		expect(ws.undo()).toBe(false);
	});

	it('adds, updates and deletes a band with one commit for each change', () => {
		const ws = open();
		const commit = vi.spyOn(ws, 'commit');
		const id = addBand(ws, {
			title: ' Review ',
			start: '2027-01-01',
			end: '2027-02-01',
			color: 'blue'
		});
		expect(commit).toHaveBeenCalledTimes(1);
		expect(ws.plan.bands[0]).toMatchObject({
			id,
			title: 'Review',
			start: '2027-01-01',
			end: '2027-02-01',
			color: 'blue'
		});
		ws.undo();
		expect(ws.plan.bands).toEqual([]);
		expect(ws.undo()).toBe(false);
		ws.redo();
		ws.history.clear();
		updateBand(ws, id, {
			title: ' Launch ',
			start: '2027-03-01',
			end: '2027-04-01',
			color: 'green'
		});
		expect(commit).toHaveBeenCalledTimes(2);
		expect(ws.plan.bands[0]).toMatchObject({
			title: 'Launch',
			start: '2027-03-01',
			end: '2027-04-01',
			color: 'green'
		});
		ws.undo();
		expect(ws.plan.bands[0].title).toBe('Review');
		expect(ws.undo()).toBe(false);
		ws.history.clear();
		removeBand(ws, id);
		expect(commit).toHaveBeenCalledTimes(3);
		expect(ws.plan.bands).toEqual([]);
		ws.undo();
		expect(ws.plan.bands[0].id).toBe(id);
		expect(ws.undo()).toBe(false);
	});

	it('does not record unchanged or missing timeline entries', () => {
		const ws = open();
		const milestone = addMilestone(ws, { title: 'Review', description: 'Discuss' });
		const band = addBand(ws, { title: 'Launch' });
		ws.history.clear();
		updateMilestone(ws, milestone, { title: ' Review ', description: ' Discuss ' });
		updateBand(ws, band, { title: ' Launch ' });
		updateMilestone(ws, 'missing', { title: 'No' });
		updateBand(ws, 'missing', { title: 'No' });
		removeMilestone(ws, 'missing');
		removeBand(ws, 'missing');
		expect(ws.history.canUndo).toBe(false);
	});
});
