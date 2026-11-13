import { describe, expect, it } from 'vitest';
import { MemoryStorage } from './memory-storage.ts';
import { KEYS } from './storage.ts';
import { GANTT_HEIGHT, ViewerState } from './viewer.svelte.ts';

describe('ViewerState', () => {
	it('defaults the split ratio and narrow tab for new and older viewer data', () => {
		for (const data of [null, { ganttPinned: true, expanded: { p1: ['t1'] } }]) {
			const storage = new MemoryStorage();
			if (data) storage.setItem(KEYS.viewer, JSON.stringify(data));
			const viewer = new ViewerState(storage);
			expect(viewer.splitRatio).toBe(0.5);
			expect(viewer.narrowTab).toBe('plan');
			if (data) {
				expect(viewer.ganttPinned).toBe(true);
				expect(viewer.isExpanded('p1', 't1')).toBe(true);
			}
		}
	});

	it('persists layout preferences when other viewer settings are saved', () => {
		const storage = new MemoryStorage();
		const viewer = new ViewerState(storage);
		viewer.setSplitRatio(0.63);
		viewer.setNarrowTab('work-plan');
		viewer.setGanttPinned(true);
		viewer.setGanttHeight(0.42);
		viewer.setTimelineLegendsCollapsed(false);
		viewer.setExpanded('p1', 't1', true);
		const again = new ViewerState(storage);
		expect(again.splitRatio).toBe(0.63);
		expect(again.narrowTab).toBe('work-plan');
		expect(again.ganttPinned).toBe(true);
		expect(again.ganttHeight).toBe(0.42);
		expect(again.timelineLegendsCollapsed).toBe(false);
		expect(again.isExpanded('p1', 't1')).toBe(true);
		again.setNarrowTab('plan');
		again.setSplitRatio(0.37);
		expect(new ViewerState(storage).narrowTab).toBe('plan');
		expect(new ViewerState(storage).splitRatio).toBe(0.37);
	});

	it.each([
		[-0.2, 0],
		[1.2, 1],
		[0, 0],
		[1, 1],
		[0.63, 0.63]
	])('clamps split ratio %s to %s and persists it', (input, expected) => {
		const storage = new MemoryStorage();
		const viewer = new ViewerState(storage);
		viewer.setSplitRatio(input);
		expect(viewer.splitRatio).toBe(expected);
		expect(new ViewerState(storage).splitRatio).toBe(expected);
	});

	it.each([NaN, Infinity, -Infinity])(
		'keeps a finite split ratio after invalid setter input %s',
		(input) => {
			const storage = new MemoryStorage();
			const viewer = new ViewerState(storage);
			viewer.setSplitRatio(0.63);
			viewer.setSplitRatio(input);
			expect(Number.isFinite(viewer.splitRatio)).toBe(true);
			expect(viewer.splitRatio).toBeGreaterThanOrEqual(0);
			expect(viewer.splitRatio).toBeLessThanOrEqual(1);
			expect(new ViewerState(storage).splitRatio).toBe(viewer.splitRatio);
		}
	);

	it.each(['x', null, -0.1, 1.1])(
		'defaults only an invalid stored split ratio (%s)',
		(splitRatio) => {
			const storage = new MemoryStorage();
			storage.setItem(
				KEYS.viewer,
				JSON.stringify({
					splitRatio,
					narrowTab: 'work-plan',
					ganttPinned: true,
					ganttHeight: 0.42,
					expanded: { p1: ['t1'] }
				})
			);
			const viewer = new ViewerState(storage);
			expect(viewer.splitRatio).toBe(0.5);
			expect(viewer.narrowTab).toBe('work-plan');
			expect(viewer.ganttPinned).toBe(true);
			expect(viewer.ganttHeight).toBe(0.42);
			expect(viewer.isExpanded('p1', 't1')).toBe(true);
		}
	);

	it.each(['other', null, 1])('defaults only an invalid stored narrow tab (%s)', (narrowTab) => {
		const storage = new MemoryStorage();
		storage.setItem(
			KEYS.viewer,
			JSON.stringify({
				splitRatio: 0.63,
				narrowTab,
				ganttPinned: true,
				timelineLegendsCollapsed: false
			})
		);
		const viewer = new ViewerState(storage);
		expect(viewer.narrowTab).toBe('plan');
		expect(viewer.splitRatio).toBe(0.63);
		expect(viewer.ganttPinned).toBe(true);
		expect(viewer.timelineLegendsCollapsed).toBe(false);
	});

	it('defaults timeline collapse for new and older viewer data', () => {
		for (const data of [null, { ganttPinned: true, narrowTab: 'work-plan' }]) {
			const storage = new MemoryStorage();
			if (data) storage.setItem(KEYS.viewer, JSON.stringify(data));
			const viewer = new ViewerState(storage);
			expect(viewer.timelineCollapsed).toBe(false);
			if (data) {
				expect(viewer.ganttPinned).toBe(true);
				expect(viewer.narrowTab).toBe('work-plan');
			}
		}
	});

	it('persists timeline collapse through other viewer updates and expansion', () => {
		const storage = new MemoryStorage();
		const viewer = new ViewerState(storage);
		viewer.setTimelineCollapsed(true);
		viewer.setSplitRatio(0.63);
		viewer.setNarrowTab('work-plan');
		viewer.setGanttPinned(true);
		viewer.setGanttHeight(0.42);
		viewer.setTimelineLegendsCollapsed(false);
		viewer.setExpanded('p1', 't1', true);
		const again = new ViewerState(storage);
		expect(again.timelineCollapsed).toBe(true);
		expect(again.splitRatio).toBe(0.63);
		expect(again.narrowTab).toBe('work-plan');
		expect(again.ganttPinned).toBe(true);
		expect(again.ganttHeight).toBe(0.42);
		expect(again.timelineLegendsCollapsed).toBe(false);
		expect(again.isExpanded('p1', 't1')).toBe(true);
		again.setTimelineCollapsed(false);
		expect(new ViewerState(storage).timelineCollapsed).toBe(false);
		expect(JSON.parse(storage.getItem(KEYS.viewer)!).timelineCollapsed).toBe(false);
	});

	it.each(['yes', null, 1])('defaults only invalid timeline collapse (%s)', (timelineCollapsed) => {
		const storage = new MemoryStorage();
		storage.setItem(
			KEYS.viewer,
			JSON.stringify({
				timelineCollapsed,
				splitRatio: 0.63,
				narrowTab: 'work-plan',
				ganttPinned: true,
				ganttHeight: 0.42,
				timelineLegendsCollapsed: false,
				expanded: { p1: ['t1'] }
			})
		);
		const viewer = new ViewerState(storage);
		expect(viewer.timelineCollapsed).toBe(false);
		expect(viewer.splitRatio).toBe(0.63);
		expect(viewer.narrowTab).toBe('work-plan');
		expect(viewer.ganttPinned).toBe(true);
		expect(viewer.ganttHeight).toBe(0.42);
		expect(viewer.timelineLegendsCollapsed).toBe(false);
		expect(viewer.isExpanded('p1', 't1')).toBe(true);
	});

	it.each([undefined, 'yes'])(
		'defaults Keep open without dropping older viewer preferences (%s)',
		(timelineKeepOpen) => {
			const storage = new MemoryStorage();
			storage.setItem(
				KEYS.viewer,
				JSON.stringify({
					timelineKeepOpen,
					ganttPinned: true,
					timelineCollapsed: true,
					narrowTab: 'work-plan'
				})
			);
			const viewer = new ViewerState(storage);
			expect(viewer.timelineKeepOpen).toBe(false);
			expect(viewer.ganttPinned).toBe(true);
			expect(viewer.timelineCollapsed).toBe(true);
			expect(viewer.narrowTab).toBe('work-plan');
		}
	);

	it('persists Keep open independently of collapse and split pin changes', () => {
		const storage = new MemoryStorage();
		const viewer = new ViewerState(storage);
		viewer.setTimelineKeepOpen(true);
		viewer.setGanttPinned(true);
		viewer.setTimelineCollapsed(true);
		const again = new ViewerState(storage);
		expect(again.timelineKeepOpen).toBe(true);
		expect(again.ganttPinned).toBe(true);
		expect(again.timelineCollapsed).toBe(true);
		again.setTimelineKeepOpen(false);
		expect(new ViewerState(storage).timelineKeepOpen).toBe(false);
		expect(new ViewerState(storage).ganttPinned).toBe(true);
	});

	it('drops the obsolete narrow legend preference when saving viewer data', () => {
		const storage = new MemoryStorage();
		storage.setItem(
			KEYS.viewer,
			JSON.stringify({ narrowLegendsCollapsed: false, timelineLegendsCollapsed: true })
		);
		const viewer = new ViewerState(storage);
		viewer.setNarrowTab('work-plan');
		expect(JSON.parse(storage.getItem(KEYS.viewer)!)).not.toHaveProperty('narrowLegendsCollapsed');
		expect(new ViewerState(storage).timelineLegendsCollapsed).toBe(true);
	});

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

	it('forgets and restores expanded tasks for a plan and ignores no-op calls', () => {
		const storage = new MemoryStorage();
		const viewer = new ViewerState(storage);
		viewer.setExpanded('p1', 't1', true);
		viewer.setExpanded('p1', 't2', true);
		const savedIds = viewer.expandedIds('p1');
		expect(savedIds).toEqual(['t1', 't2']);

		viewer.forgetPlan('unknown');
		expect(viewer.expandedIds('p1')).toEqual(['t1', 't2']);

		viewer.forgetPlan('p1');
		expect(viewer.expandedIds('p1')).toEqual([]);
		expect(new ViewerState(storage).expandedIds('p1')).toEqual([]);

		viewer.restorePlan('p1', []);
		expect('p1' in viewer.expanded).toBe(false);

		viewer.restorePlan('p1', savedIds);
		expect(viewer.expandedIds('p1')).toEqual(['t1', 't2']);
		expect(new ViewerState(storage).expandedIds('p1')).toEqual(['t1', 't2']);
	});

	it('keeps setExpanded idempotent when expanding an already expanded task', () => {
		const viewer = new ViewerState(new MemoryStorage());
		viewer.setExpanded('p1', 't1', true);
		viewer.setExpanded('p1', 't1', true);
		expect(viewer.expandedIds('p1')).toEqual(['t1']);
	});

	it('clamps a negative ganttHeight to 0', () => {
		const viewer = new ViewerState(new MemoryStorage());
		viewer.setGanttHeight(-0.2);
		expect(viewer.ganttHeight).toBe(0);
	});

	it('falls back to default ganttHeight when stored ganttHeight is out of range', () => {
		const storage = new MemoryStorage();
		storage.setItem(KEYS.viewer, JSON.stringify({ ganttHeight: 0.9 }));
		expect(new ViewerState(storage).ganttHeight).toBe(GANTT_HEIGHT.default);
		storage.setItem(KEYS.viewer, JSON.stringify({ ganttHeight: -0.1 }));
		expect(new ViewerState(storage).ganttHeight).toBe(GANTT_HEIGHT.default);
	});
});

describe('ViewerState diagram views', () => {
	const THREE = ['gantt', 'test-list', 'test-board'] as const;

	/** Stores viewer data with valid older fields next to the given diagram fields. */
	const stored = (fields: Record<string, unknown>) => {
		const storage = new MemoryStorage();
		storage.setItem(
			KEYS.viewer,
			JSON.stringify({ splitRatio: 0.63, ganttPinned: true, ganttHeight: 0.42, ...fields })
		);
		return storage;
	};

	const expectOlderFields = (viewer: ViewerState) => {
		expect(viewer.splitRatio).toBe(0.63);
		expect(viewer.ganttPinned).toBe(true);
		expect(viewer.ganttHeight).toBe(0.42);
	};

	it('defaults the view to Gantt and the print selection to Gantt only', () => {
		const viewer = new ViewerState(new MemoryStorage());
		expect(viewer.diagramView).toBe('gantt');
		expect(viewer.printDiagrams).toEqual(['gantt']);
	});

	it('keeps a stored registered view', () => {
		const viewer = new ViewerState(stored({ diagramView: 'test-list' }), THREE);
		expect(viewer.diagramView).toBe('test-list');
		expectOlderFields(viewer);
	});

	it.each([
		['an unknown id', 'other'],
		['a number', 1],
		['null', null],
		['an object', { id: 'test-list' }]
	])('resolves %s as the stored view to Gantt and keeps other fields', (_, diagramView) => {
		const viewer = new ViewerState(stored({ diagramView }), THREE);
		expect(viewer.diagramView).toBe('gantt');
		expectOlderFields(viewer);
	});

	it('resolves a stored view that is not registered to Gantt', () => {
		const viewer = new ViewerState(stored({ diagramView: 'route-map' }));
		expect(viewer.diagramView).toBe('gantt');
		expectOlderFields(viewer);
	});

	it.each([
		['absent', undefined],
		['null', null],
		['a scalar', 'test-list'],
		['an object', { 0: 'test-list' }],
		['an empty array', []],
		['only unknown ids', ['other', 'route-map']],
		['only non-string values', [1, null, {}]]
	])('uses Gantt only when the stored print selection is %s', (_, printDiagrams) => {
		const viewer = new ViewerState(stored({ printDiagrams }), THREE);
		expect(viewer.printDiagrams).toEqual(['gantt']);
		expectOlderFields(viewer);
	});

	it('uses Gantt only for a stored Route map and Kanban selection when only Gantt is registered', () => {
		const viewer = new ViewerState(stored({ printDiagrams: ['route-map', 'kanban'] }));
		expect(viewer.printDiagrams).toEqual(['gantt']);
		expectOlderFields(viewer);
	});

	it('keeps only valid registered ids, removes duplicates and uses registry order', () => {
		const viewer = new ViewerState(
			stored({
				printDiagrams: ['test-board', 7, 'other', 'test-list', 'test-board', null, 'test-list']
			}),
			THREE
		);
		expect(viewer.printDiagrams).toEqual(['test-list', 'test-board']);
		expectOlderFields(viewer);
	});

	it('sorts a stored print selection in registry order', () => {
		const viewer = new ViewerState(
			stored({ printDiagrams: ['test-board', 'gantt', 'test-list'] }),
			THREE
		);
		expect(viewer.printDiagrams).toEqual(['gantt', 'test-list', 'test-board']);
	});

	it('does not need Gantt in a valid stored print selection', () => {
		const viewer = new ViewerState(stored({ printDiagrams: ['test-board'] }), THREE);
		expect(viewer.printDiagrams).toEqual(['test-board']);
	});

	it('keeps the view and the print selection independent', () => {
		const viewer = new ViewerState(
			stored({ diagramView: 'test-board', printDiagrams: ['test-list'] }),
			THREE
		);
		expect(viewer.diagramView).toBe('test-board');
		expect(viewer.printDiagrams).toEqual(['test-list']);
	});

	it('sets a registered view, persists it and ignores unregistered ids', () => {
		const storage = new MemoryStorage();
		const viewer = new ViewerState(storage, THREE);
		viewer.setGanttHeight(0.42);
		viewer.setDiagramView('test-board');
		expect(viewer.diagramView).toBe('test-board');
		viewer.setDiagramView('route-map');
		expect(viewer.diagramView).toBe('test-board');
		const again = new ViewerState(storage, THREE);
		expect(again.diagramView).toBe('test-board');
		expect(again.printDiagrams).toEqual(['gantt']);
		expect(again.ganttHeight).toBe(0.42);
		expect(JSON.parse(storage.getItem(KEYS.viewer)!).diagramView).toBe('test-board');
	});

	it('keeps the print selection in registry order regardless of the click order', () => {
		const storage = new MemoryStorage();
		const viewer = new ViewerState(storage, THREE);
		viewer.setPrintDiagram('test-board', true);
		viewer.setPrintDiagram('test-list', true);
		expect(viewer.printDiagrams).toEqual(['gantt', 'test-list', 'test-board']);
		viewer.setPrintDiagram('gantt', false);
		expect(viewer.printDiagrams).toEqual(['test-list', 'test-board']);
		viewer.setPrintDiagram('gantt', true);
		expect(viewer.printDiagrams).toEqual(['gantt', 'test-list', 'test-board']);
		viewer.setPrintDiagram('route-map', true);
		expect(viewer.printDiagrams).toEqual(['gantt', 'test-list', 'test-board']);
		const again = new ViewerState(storage, THREE);
		expect(again.printDiagrams).toEqual(['gantt', 'test-list', 'test-board']);
		expect(again.diagramView).toBe('gantt');
	});

	it('does not clear the last selected print diagram', () => {
		const storage = new MemoryStorage();
		const viewer = new ViewerState(storage, THREE);
		viewer.setPrintDiagram('test-list', true);
		viewer.setPrintDiagram('gantt', false);
		expect(viewer.printDiagrams).toEqual(['test-list']);
		viewer.setPrintDiagram('test-list', false);
		expect(viewer.printDiagrams).toEqual(['test-list']);
		expect(new ViewerState(storage, THREE).printDiagrams).toEqual(['test-list']);
	});

	it('keeps the diagram fields when other viewer settings are saved', () => {
		const storage = new MemoryStorage();
		const viewer = new ViewerState(storage, THREE);
		viewer.setDiagramView('test-list');
		viewer.setPrintDiagram('test-board', true);
		viewer.setSplitRatio(0.3);
		viewer.setExpanded('p1', 't1', true);
		const again = new ViewerState(storage, THREE);
		expect(again.diagramView).toBe('test-list');
		expect(again.printDiagrams).toEqual(['gantt', 'test-board']);
	});
});
