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
	moveRemarkSection,
	addStage,
	updateStage,
	moveStage,
	removeStage,
	moveTask,
	removeTasks,
	renameOwnerEverywhere,
	loadExample
} from './commands.ts';
import { mentionToken } from '#lib/domain/mentions.ts';
import { MemoryStorage } from './memory-storage.ts';
import { Workspace } from './workspace.svelte.ts';

const open = () => new Workspace(new MemoryStorage());

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

	it('falls back to removing an empty remark section when another commit happened after creation', () => {
		const ws = open();
		const id = addRemarkSection(ws);
		updatePlan(ws, { heading: 'Keep' });
		discardNewRemarkSection(ws, id);
		expect(ws.plan.remarks).toHaveLength(0);
		expect(ws.plan.heading).toBe('Keep');
		expect(ws.undo()).toBe(true);
		expect(ws.plan.remarks.map((r) => r.id)).toEqual([id]);
	});

	it('keeps a remark section with content, and keeps an emptied existing section on update', () => {
		const ws = open();
		const id = addRemarkSection(ws, { title: 'Risks' });
		discardNewRemarkSection(ws, id);
		expect(ws.plan.remarks).toHaveLength(1);
		const other = addRemarkSection(ws, { bullets: ['A'] });
		updateRemarkSection(ws, other, { bullets: [' '] });
		expect(ws.plan.remarks.map((r) => r.id)).toEqual([id, other]);
		expect(ws.plan.remarks[1].bullets).toEqual([]);
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

	it('keeps tasks with content or children when discarding', () => {
		const ws = open();
		const stageId = ws.plan.stages[0].id;
		const id = addTask(ws, stageId);
		addTask(ws, stageId, { parentId: id });
		discardNewTask(ws, id);
		expect(ws.plan.tasks).toHaveLength(2);
		updateTask(ws, id, { status: 'done' });
		discardNewTask(ws, id);
		expect(ws.plan.tasks).toHaveLength(2);

		for (const patch of [
			{ deliverable: 'Spec' },
			{ start: '2027-01-01' },
			{ end: '2027-01-02' },
			{ owners: ['Ana'] },
			{ note: 'Check' },
			{ dependsOn: [id] }
		]) {
			const filled = addTask(ws, stageId, { parentId: null, patch });
			discardNewTask(ws, filled);
			expect(ws.plan.tasks.some((t) => t.id === filled)).toBe(true);
		}
	});

	it('deletes an empty task via commit when history is empty', () => {
		const ws = open();
		const stageId = ws.plan.stages[0].id;
		const orphanEmpty = addTask(ws, stageId);
		ws.history.clear();
		expect(ws.history.peek()).toBeNull();
		discardNewTask(ws, orphanEmpty);
		expect(ws.plan.tasks.some((t) => t.id === orphanEmpty)).toBe(false);
		expect(ws.undo()).toBe(true);
		expect(ws.plan.tasks.some((t) => t.id === orphanEmpty)).toBe(true);
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

	it('sets the paper size as one undo step and ignores the same size', () => {
		const ws = open();
		expect(ws.plan.paper).toBe('a4');
		ws.history.clear();
		updatePlan(ws, { paper: 'a4' });
		expect(ws.history.canUndo).toBe(false);
		updatePlan(ws, { paper: 'letter' });
		expect(ws.plan.paper).toBe('letter');
		expect(ws.undo()).toBe(true);
		expect(ws.plan.paper).toBe('a4');
		expect(ws.history.canUndo).toBe(false);
		ws.redo();
		expect(ws.plan.paper).toBe('letter');
	});
});

describe('stage commands', () => {
	it('adds a stage at a position with the next free color as one undo step', () => {
		const ws = open();
		const first = ws.plan.stages[0];
		ws.history.clear();
		const id = addStage(ws, 0);
		expect(ws.plan.stages.map((s) => s.id)).toEqual([id, first.id]);
		expect(ws.plan.stages[0].color).not.toBe(first.color);
		const last = addStage(ws, ws.plan.stages.length);
		expect(ws.plan.stages.at(-1)?.id).toBe(last);
		ws.undo();
		ws.undo();
		expect(ws.plan.stages.map((s) => s.id)).toEqual([first.id]);
		expect(ws.history.canUndo).toBe(false);
	});

	it('trims stage text on update and ignores a missing stage', () => {
		const ws = open();
		const id = ws.plan.stages[0].id;
		ws.history.clear();
		updateStage(ws, 'missing', { title: 'No' });
		expect(ws.history.canUndo).toBe(false);
		updateStage(ws, id, { title: ' Build ', description: ' Code ', color: 'red' });
		expect(ws.plan.stages[0]).toMatchObject({ title: 'Build', description: 'Code', color: 'red' });
		ws.undo();
		expect(ws.plan.stages[0].title).toBe('');
	});

	it('moves a stage and ignores moves past the ends', () => {
		const ws = open();
		const a = ws.plan.stages[0].id;
		const b = addStage(ws, 1);
		ws.history.clear();
		moveStage(ws, a, -1);
		moveStage(ws, b, 1);
		moveStage(ws, 'missing', 1);
		expect(ws.history.canUndo).toBe(false);
		moveStage(ws, a, 1);
		expect(ws.plan.stages.map((s) => s.id)).toEqual([b, a]);
		ws.undo();
		expect(ws.plan.stages.map((s) => s.id)).toEqual([a, b]);
	});

	it('removes a stage with its tasks and subtasks and cleans references as one undo step', () => {
		const ws = open();
		const keep = ws.plan.stages[0].id;
		const drop = addStage(ws, 1);
		const parent = addTask(ws, drop);
		const child = addTask(ws, drop, { parentId: parent });
		const other = addTask(ws, keep, {
			parentId: null,
			patch: { title: 'Other', dependsOn: [parent], note: `See ${mentionToken(child)} now` }
		});
		ws.history.clear();
		const before = $state.snapshot(ws.plan);
		removeStage(ws, drop);
		expect(ws.plan.stages.map((s) => s.id)).toEqual([keep]);
		expect(ws.plan.tasks.map((t) => t.id)).toEqual([other]);
		expect(ws.plan.tasks[0].dependsOn).toEqual([]);
		expect(ws.plan.tasks[0].note).not.toContain('@[task:');
		expect(ws.undo()).toBe(true);
		expect($state.snapshot(ws.plan)).toEqual(before);
		expect(ws.history.canUndo).toBe(false);
	});
});

describe('task commands', () => {
	it('sets canceled with one undo step and restores it with redo', () => {
		const ws = open();
		const id = addTask(ws, ws.plan.stages[0].id);
		ws.history.clear();
		updateTask(ws, id, { status: 'canceled' });
		expect(ws.plan.tasks[0].status).toBe('canceled');
		expect(ws.undo()).toBe(true);
		expect(ws.plan.tasks[0].status).toBe('todo');
		expect(ws.history.canUndo).toBe(false);
		expect(ws.redo()).toBe(true);
		expect(ws.plan.tasks[0].status).toBe('canceled');
		expect(ws.history.canRedo).toBe(false);
	});

	it('keeps an otherwise empty new task with in-progress status', () => {
		const ws = open();
		const id = addTask(ws, ws.plan.stages[0].id);
		updateTask(ws, id, { status: 'in_progress' });
		discardNewTask(ws, id);
		expect(ws.plan.tasks.find((task) => task.id === id)?.status).toBe('in_progress');
	});

	it('restores a status change with one undo and redo step and ignores the current status', () => {
		const ws = open();
		const id = addTask(ws, ws.plan.stages[0].id);
		ws.history.clear();
		updateTask(ws, id, { status: 'todo' });
		expect(ws.history.canUndo).toBe(false);
		updateTask(ws, id, { status: 'in_progress' });
		expect(ws.plan.tasks[0].status).toBe('in_progress');
		expect(ws.undo()).toBe(true);
		expect(ws.plan.tasks[0].status).toBe('todo');
		expect(ws.history.canUndo).toBe(false);
		expect(ws.redo()).toBe(true);
		expect(ws.plan.tasks[0].status).toBe('in_progress');
		expect(ws.history.canRedo).toBe(false);
	});

	it.each(['delete', 'move'] as const)(
		'keeps the stored parent values when its last child is removed by %s in one undo and redo step',
		(action) => {
			const ws = open();
			const stageId = ws.plan.stages[0].id;
			const parent = addTask(ws, stageId, {
				parentId: null,
				patch: { start: '2027-02-05', end: '2027-02-10', owners: ['Own'], status: 'in_progress' }
			});
			const child = addTask(ws, stageId, {
				parentId: parent,
				patch: { start: '2027-02-01', end: '2027-02-20', owners: ['Child'], status: 'done' }
			});
			ws.history.clear();
			const before = $state.snapshot(ws.plan);
			const parentBefore = $state.snapshot(ws.plan.tasks.find((task) => task.id === parent)!);
			expect(parentBefore).toMatchObject({
				start: '2027-02-01',
				end: '2027-02-20',
				owners: ['Own', 'Child'],
				status: 'done'
			});
			expect(ws.history.canUndo).toBe(false);
			expect(ws.history.canRedo).toBe(false);
			if (action === 'delete') removeTasks(ws, [child]);
			else moveTask(ws, child, { target: { stageId, parentId: null }, fixes: [] });
			const expected = {
				start: '2027-02-01',
				end: '2027-02-20',
				owners: ['Own', 'Child'],
				status: 'done'
			};
			expect(ws.plan.tasks.find((task) => task.id === parent)).toEqual(parentBefore);
			expect(ws.plan.tasks.find((task) => task.id === parent)).toMatchObject(expected);
			expect(ws.index.state.get(parent)!.eff).toEqual(expected);
			expect(ws.index.children.get(parent) ?? []).toHaveLength(0);
			const after = $state.snapshot(ws.plan);
			expect(ws.undo()).toBe(true);
			expect($state.snapshot(ws.plan)).toEqual(before);
			expect(ws.index.children.get(parent)?.map((task) => task.id)).toEqual([child]);
			expect(ws.history.canUndo).toBe(false);
			expect(ws.redo()).toBe(true);
			expect($state.snapshot(ws.plan)).toEqual(after);
			expect(ws.index.state.get(parent)!.eff).toEqual(expected);
			expect(ws.history.canRedo).toBe(false);
		}
	);

	it('discards a new empty only subtask by rolling back its creation and parent expansion', () => {
		const ws = open();
		const stageId = ws.plan.stages[0].id;
		const parent = addTask(ws, stageId, {
			parentId: null,
			patch: { start: '2027-02-01', end: '2027-02-20', owners: ['Own'], status: 'done' }
		});
		ws.history.clear();
		const before = $state.snapshot(ws.plan);
		const child = addTask(ws, stageId, { parentId: parent });
		discardNewTask(ws, child);
		expect($state.snapshot(ws.plan)).toEqual(before);
		expect(ws.history.canUndo).toBe(false);
		expect(ws.history.canRedo).toBe(false);
	});

	it('keeps the parent values when an empty subtask is discarded after another step', () => {
		const ws = open();
		const stageId = ws.plan.stages[0].id;
		const parent = addTask(ws, stageId, {
			parentId: null,
			patch: { owners: ['Own'], status: 'done' }
		});
		const child = addTask(ws, stageId, { parentId: parent });
		ws.history.clear();
		const before = $state.snapshot(ws.plan);
		discardNewTask(ws, child);
		expect(ws.plan.tasks.find((task) => task.id === child)).toBeUndefined();
		expect(ws.plan.tasks.find((task) => task.id === parent)).toEqual(
			before.tasks.find((task) => task.id === parent)
		);
		const after = $state.snapshot(ws.plan);
		expect(ws.undo()).toBe(true);
		expect($state.snapshot(ws.plan)).toEqual(before);
		expect(ws.history.canUndo).toBe(false);
		expect(ws.redo()).toBe(true);
		expect($state.snapshot(ws.plan)).toEqual(after);
		expect(ws.history.canRedo).toBe(false);
	});

	it('updates cached dependent readiness after a dependency status change, undo and redo', () => {
		const ws = open();
		const stageId = ws.plan.stages[0].id;
		const dependency = addTask(ws, stageId);
		const dependent = addTask(ws, stageId, {
			parentId: null,
			patch: { dependsOn: [dependency] }
		});
		ws.history.clear();
		const readiness = () => ws.index.state.get(dependent)!.readiness;
		const blocked = { kind: 'blocked', blockers: [{ kind: 'task', id: dependency }] };
		const ready = { kind: 'ready', via: 'dependencies', count: 1 };
		expect(readiness()).toEqual(blocked);
		updateTask(ws, dependency, { status: 'done' });
		expect(readiness()).toEqual(ready);
		expect(ws.undo()).toBe(true);
		expect(readiness()).toEqual(blocked);
		expect(ws.history.canUndo).toBe(false);
		expect(ws.redo()).toBe(true);
		expect(readiness()).toEqual(ready);
		expect(ws.history.canRedo).toBe(false);
	});

	it('removes several tasks with their subtasks in one undo step', () => {
		const ws = open();
		const stage = ws.plan.stages[0].id;
		const a = addTask(ws, stage, { parentId: null, patch: { title: 'A' } });
		addTask(ws, stage, { parentId: a, patch: { title: 'A1' } });
		const b = addTask(ws, stage, { parentId: null, patch: { title: 'B' } });
		const c = addTask(ws, stage, { parentId: null, patch: { title: 'C', dependsOn: [b] } });
		ws.history.clear();
		removeTasks(ws, [a, b, 'missing']);
		expect(ws.plan.tasks.map((t) => t.id)).toEqual([c]);
		expect(ws.plan.tasks[0].dependsOn).toEqual([]);
		ws.undo();
		expect(ws.plan.tasks).toHaveLength(4);
		expect(ws.history.canUndo).toBe(false);
	});

	it('ignores an update of a missing task', () => {
		const ws = open();
		ws.history.clear();
		updateTask(ws, 'missing', { title: 'No' });
		expect(ws.history.canUndo).toBe(false);
	});

	it('moves a task and applies fixes in one undoable commit, and ignores a no-op move', () => {
		const ws = open();
		const s1 = ws.plan.stages[0].id;
		const s2 = addStage(ws, 1);
		const parent = addTask(ws, s2, { parentId: null, patch: { title: 'Parent' } });
		const task = addTask(ws, s1, {
			parentId: null,
			patch: { title: 'Child', start: '2027-05-01', dependsOn: [parent] }
		});
		updateTask(ws, parent, { dependsOn: [task] });
		ws.history.clear();

		// Moving to its current location with no fixes is a no-op.
		moveTask(ws, task, { target: { stageId: s1, parentId: null }, fixes: [] });
		expect(ws.history.canUndo).toBe(false);

		moveTask(ws, task, {
			target: { stageId: s2, parentId: parent },
			fixes: [
				{ kind: 'remove-scope-dependency', taskId: task, dependencyId: parent },
				{ kind: 'remove-parent-dependency', parentId: parent },
				{ kind: 'clear-date', field: 'start', dependencyId: parent, dependentId: task }
			]
		});
		const moved = ws.plan.tasks.find((t) => t.id === task)!;
		const newParent = ws.plan.tasks.find((t) => t.id === parent)!;
		expect(moved).toMatchObject({
			stageId: s2,
			parentId: parent,
			start: null,
			dependsOn: []
		});
		expect(newParent.dependsOn).toEqual([]);
		expect(ws.undo()).toBe(true);
		expect(ws.plan.tasks.find((t) => t.id === task)).toMatchObject({
			stageId: s1,
			parentId: null,
			start: '2027-05-01',
			dependsOn: [parent]
		});
		expect(ws.plan.tasks.find((t) => t.id === parent)?.dependsOn).toEqual([task]);
		expect(ws.history.canUndo).toBe(false);
		expect(ws.redo()).toBe(true);
		expect(ws.plan.tasks.find((t) => t.id === task)).toMatchObject({
			stageId: s2,
			parentId: parent,
			start: null,
			dependsOn: []
		});
		expect(ws.plan.tasks.find((t) => t.id === parent)?.dependsOn).toEqual([]);
		expect(ws.history.canRedo).toBe(false);
	});
});

describe('renameOwnerEverywhere', () => {
	it('renames an owner in all tasks, merges duplicates and makes one undo step', () => {
		const ws = open();
		const stage = ws.plan.stages[0].id;
		addTask(ws, stage, { parentId: null, patch: { owners: ['ana', 'Bo'] } });
		addTask(ws, stage, { parentId: null, patch: { owners: ['ANA'] } });
		addTask(ws, stage, { parentId: null, patch: { owners: ['Cy'] } });
		ws.history.clear();
		renameOwnerEverywhere(ws, 'Ana', ' Bo ');
		expect(ws.plan.tasks.map((t) => t.owners)).toEqual([['Bo'], ['Bo'], ['Cy']]);
		ws.undo();
		expect(ws.plan.tasks.map((t) => t.owners)).toEqual([['ana', 'Bo'], ['ANA'], ['Cy']]);
		expect(ws.history.canUndo).toBe(false);
	});

	it('ignores an empty new name', () => {
		const ws = open();
		addTask(ws, ws.plan.stages[0].id, { parentId: null, patch: { owners: ['Ana'] } });
		ws.history.clear();
		renameOwnerEverywhere(ws, 'Ana', '   ');
		expect(ws.plan.tasks[0].owners).toEqual(['Ana']);
		expect(ws.history.canUndo).toBe(false);
	});
});

describe('loadExample', () => {
	it('keeps the plan id and creation time', () => {
		const ws = open();
		const { id, createdAt } = ws.plan;
		ws.history.clear();
		loadExample(ws);
		expect(ws.plan.id).toBe(id);
		expect(ws.plan.createdAt).toBe(createdAt);
		expect(ws.plan.tasks.length).toBeGreaterThan(0);
		expect(ws.undo()).toBe(true);
		expect(ws.plan.tasks).toEqual([]);
	});
});

describe('planned-window commands', () => {
	const setup = () => {
		const ws = open();
		const stageId = ws.plan.stages[0].id;
		const parent = addTask(ws, stageId, {
			parentId: null,
			patch: { start: '2027-02-05', end: '2027-02-20', owners: ['Own'], status: 'done' }
		});
		return { ws, stageId, parent };
	};

	const expectOneStep = (ws: Workspace, before: typeof ws.plan, after: typeof ws.plan) => {
		expect(ws.undo()).toBe(true);
		expect($state.snapshot(ws.plan)).toEqual(before);
		expect(ws.history.canUndo).toBe(false);
		expect(ws.redo()).toBe(true);
		expect($state.snapshot(ws.plan)).toEqual(after);
		expect(ws.history.canRedo).toBe(false);
	};

	it('stores wider dates and subtask owners in the same undo step as a subtask edit', () => {
		const { ws, stageId, parent } = setup();
		const child = addTask(ws, stageId, {
			parentId: parent,
			patch: { start: '2027-02-10', end: '2027-02-15' }
		});
		ws.history.clear();
		const before = $state.snapshot(ws.plan);
		updateTask(ws, child, {
			start: '2027-02-01',
			end: '2027-03-01',
			owners: ['Ann'],
			status: 'in_progress'
		});
		expect(ws.plan.tasks.find((task) => task.id === parent)).toMatchObject({
			start: '2027-02-01',
			end: '2027-03-01',
			owners: ['Own', 'Ann'],
			status: 'in_progress'
		});
		expectOneStep(ws, before, $state.snapshot(ws.plan));
	});

	it.each([
		{ name: 'moves inside', start: '2027-02-07', end: '2027-02-17' },
		{ name: 'narrows', start: '2027-02-11', end: '2027-02-14' }
	])(
		'keeps the parent window and owners when a subtask $name and loses its owner',
		({ start, end }) => {
			const { ws, stageId, parent } = setup();
			const child = addTask(ws, stageId, {
				parentId: parent,
				patch: { start: '2027-02-10', end: '2027-02-15', owners: ['Ann'] }
			});
			const parentBefore = $state.snapshot(ws.plan.tasks.find((task) => task.id === parent)!);
			expect(parentBefore.owners).toEqual(['Own', 'Ann']);
			ws.history.clear();
			const before = $state.snapshot(ws.plan);
			updateTask(ws, child, { start, end, owners: [] });
			expect(ws.plan.tasks.find((task) => task.id === parent)).toEqual(parentBefore);
			expectOneStep(ws, before, $state.snapshot(ws.plan));
		}
	);

	it('keeps the planned dates and owners when adding an empty subtask and stores todo status', () => {
		const { ws, stageId, parent } = setup();
		ws.history.clear();
		const before = $state.snapshot(ws.plan);
		addTask(ws, stageId, { parentId: parent });
		expect(ws.plan.tasks.find((task) => task.id === parent)).toMatchObject({
			start: '2027-02-05',
			end: '2027-02-20',
			owners: ['Own'],
			status: 'todo'
		});
		expectOneStep(ws, before, $state.snapshot(ws.plan));
	});

	it('widens the destination parent and writes its derived status in the move undo step', () => {
		const { ws, stageId, parent } = setup();
		const child = addTask(ws, stageId, {
			parentId: null,
			patch: { start: '2027-01-01', end: '2027-03-31', owners: ['Ann'], status: 'in_progress' }
		});
		ws.history.clear();
		const before = $state.snapshot(ws.plan);
		moveTask(ws, child, { target: { stageId, parentId: parent }, fixes: [] });
		expect(ws.plan.tasks.find((task) => task.id === child)?.parentId).toBe(parent);
		expect(ws.plan.tasks.find((task) => task.id === parent)).toMatchObject({
			start: '2027-01-01',
			end: '2027-03-31',
			owners: ['Own', 'Ann'],
			status: 'in_progress'
		});
		expectOneStep(ws, before, $state.snapshot(ws.plan));
	});

	it('keeps the full parent values when all subtasks are deleted in one command', () => {
		const { ws, stageId, parent } = setup();
		const a = addTask(ws, stageId, {
			parentId: parent,
			patch: { start: '2027-01-01', status: 'done' }
		});
		const b = addTask(ws, stageId, {
			parentId: parent,
			patch: { end: '2027-03-31', owners: ['Ann'], status: 'canceled' }
		});
		const parentBefore = $state.snapshot(ws.plan.tasks.find((task) => task.id === parent)!);
		expect(parentBefore).toMatchObject({
			start: '2027-01-01',
			end: '2027-03-31',
			owners: ['Own', 'Ann'],
			status: 'done'
		});
		ws.history.clear();
		const before = $state.snapshot(ws.plan);
		removeTasks(ws, [a, b]);
		expect(ws.plan.tasks).toEqual([parentBefore]);
		expectOneStep(ws, before, $state.snapshot(ws.plan));
	});
});
