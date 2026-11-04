import { describe, expect, it, vi } from 'vitest';
import {
	addTask,
	updateTask,
	addRemarkSection,
	updateRemarkSection,
	updatePlan,
	updateFooter,
	discardNewTask,
	reorderStages,
	reorderRemarks
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
			subheading: 'Sub',
			objective: 'Goal',
			footer: { note: 'Note', version: 'v1', right: 'Right' }
		});
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
