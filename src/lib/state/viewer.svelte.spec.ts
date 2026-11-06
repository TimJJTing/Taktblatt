import { describe, expect, it } from 'vitest';
import { MemoryStorage } from './memory-storage.ts';
import { KEYS } from './storage.ts';
import { GANTT_HEIGHT, ViewerState } from './viewer.svelte.ts';

describe('ViewerState', () => {
	it('starts with collapsed legends when older viewer data is pinned', () => {
		const storage = new MemoryStorage();
		storage.setItem(
			KEYS.viewer,
			JSON.stringify({ expanded: { p1: ['t1'] }, ganttPinned: true, ganttHeight: 0.42 })
		);
		const viewer = new ViewerState(storage);
		expect(viewer.timelineLegendsCollapsed).toBe(true);
		expect(viewer.ganttPinned).toBe(true);
		expect(viewer.ganttHeight).toBe(0.42);
		expect(viewer.isExpanded('p1', 't1')).toBe(true);
	});

	it.each([false, undefined])(
		'starts with expanded legends when older viewer data is unpinned or has no pin setting (%s)',
		(ganttPinned) => {
			const storage = new MemoryStorage();
			storage.setItem(KEYS.viewer, JSON.stringify({ ganttPinned, ganttHeight: 0.42 }));
			const viewer = new ViewerState(storage);
			expect(viewer.timelineLegendsCollapsed).toBe(false);
			expect(viewer.ganttPinned).toBe(false);
			expect(viewer.ganttHeight).toBe(0.42);
		}
	);

	it('starts unpinned with expanded legends when no viewer data is stored', () => {
		const viewer = new ViewerState(new MemoryStorage());
		expect(viewer.timelineLegendsCollapsed).toBe(false);
		expect(viewer.ganttPinned).toBe(false);
		expect(viewer.ganttHeight).toBe(GANTT_HEIGHT.default);
		expect(viewer.expandedIds('p1')).toEqual([]);
	});

	it.each([
		[false, false],
		[false, true],
		[true, false],
		[true, true]
	])(
		'keeps an explicit legend preference for either pin state (pin: %s, collapsed: %s)',
		(ganttPinned, timelineLegendsCollapsed) => {
			const storage = new MemoryStorage();
			storage.setItem(KEYS.viewer, JSON.stringify({ ganttPinned, timelineLegendsCollapsed }));
			const viewer = new ViewerState(storage);
			expect(viewer.ganttPinned).toBe(ganttPinned);
			expect(viewer.timelineLegendsCollapsed).toBe(timelineLegendsCollapsed);
		}
	);

	it('uses viewer defaults when stored viewer data is unreadable', () => {
		const storage = new MemoryStorage();
		storage.setItem(KEYS.viewer, '{not json');
		const viewer = new ViewerState(storage);
		expect(viewer.timelineLegendsCollapsed).toBe(false);
		expect(viewer.ganttPinned).toBe(false);
		expect(viewer.ganttHeight).toBe(GANTT_HEIGHT.default);
		expect(viewer.expandedIds('p1')).toEqual([]);
	});

	it('uses viewer defaults when the stored legend preference is invalid', () => {
		const storage = new MemoryStorage();
		storage.setItem(
			KEYS.viewer,
			JSON.stringify({
				timelineLegendsCollapsed: 'yes',
				ganttPinned: true,
				ganttHeight: 0.42,
				expanded: { p1: ['t1'] }
			})
		);
		const viewer = new ViewerState(storage);
		expect(viewer.timelineLegendsCollapsed).toBe(false);
		expect(viewer.ganttPinned).toBe(false);
		expect(viewer.ganttHeight).toBe(GANTT_HEIGHT.default);
		expect(viewer.expandedIds('p1')).toEqual([]);
	});

	it.each([true, false])(
		'keeps the legend preference when other viewer settings are saved (%s)',
		(collapsed) => {
			const storage = new MemoryStorage();
			const viewer = new ViewerState(storage);
			viewer.setTimelineLegendsCollapsed(collapsed);
			viewer.setGanttPinned(true);
			viewer.setGanttHeight(0.4);
			viewer.toggleExpanded('p1', 't1');
			const again = new ViewerState(storage);
			expect(again.timelineLegendsCollapsed).toBe(collapsed);
			expect(again.ganttPinned).toBe(true);
			expect(again.ganttHeight).toBe(0.4);
			expect(again.isExpanded('p1', 't1')).toBe(true);
			again.setTimelineLegendsCollapsed(!collapsed);
			expect(new ViewerState(storage).timelineLegendsCollapsed).toBe(!collapsed);
		}
	);

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
