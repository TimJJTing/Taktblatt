/**
 * Viewer state: settings for this browser only. They are not in the plan file.
 * The UI language is kept by Paraglide (key `taktblatt:locale`).
 * Refer to ADR 4.
 */
import { getContext, setContext } from 'svelte';
import * as v from 'valibot';
import { GANTT_VIEW_ID, type DiagramViewId } from '#lib/domain/diagram.ts';
import { KEYS } from '#lib/state/storage.ts';

export const GANTT_HEIGHT = { default: 0.35, max: 0.5, narrowMax: 0.4, minPx: 120 } as const;

const ViewerSchema = v.object({
	splitRatio: v.fallback(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0.5),
	narrowTab: v.fallback(v.picklist(['plan', 'work-plan']), 'plan'),
	expanded: v.optional(v.record(v.string(), v.array(v.string())), {}),
	ganttPinned: v.optional(v.boolean(), false),
	timelineCollapsed: v.fallback(v.boolean(), false),
	timelineLegendsCollapsed: v.optional(v.boolean()),
	timelineKeepOpen: v.fallback(v.boolean(), false),
	ganttHeight: v.optional(
		v.pipe(v.number(), v.minValue(0), v.maxValue(GANTT_HEIGHT.max)),
		GANTT_HEIGHT.default
	),
	// The registry validates the ids after parsing. Refer to `resolveDiagramView`.
	diagramView: v.fallback(v.optional(v.string()), undefined),
	printDiagrams: v.fallback(v.optional(v.array(v.unknown())), undefined)
});

/** Resolves a stored view id. An unknown or unregistered id gives Gantt. */
export function resolveDiagramView(value: unknown, ids: readonly DiagramViewId[]): DiagramViewId {
	return typeof value === 'string' && ids.includes(value) ? value : GANTT_VIEW_ID;
}

/**
 * Resolves a stored print selection. Keeps registered string ids once, in registry order.
 * A missing, non-array or empty selection gives Gantt only.
 */
export function resolvePrintDiagrams(
	value: unknown,
	ids: readonly DiagramViewId[]
): DiagramViewId[] {
	if (!Array.isArray(value)) return [GANTT_VIEW_ID];
	const selected = ids.filter((id) => value.includes(id));
	return selected.length > 0 ? selected : [GANTT_VIEW_ID];
}

type ViewerData = v.InferOutput<typeof ViewerSchema>;

export class ViewerState {
	/** The expanded task ids, for each plan. The Gantt and the table share them. */
	expanded = $state<Record<string, string[]>>({});
	ganttPinned = $state(false);
	splitRatio = $state(0.5);
	narrowTab = $state<'plan' | 'work-plan'>('plan');
	timelineCollapsed = $state(false);
	/** The legend state in split view. */
	timelineLegendsCollapsed = $state(false);
	/** Keeps the Timeline open on user scroll with tabs. */
	timelineKeepOpen = $state(false);
	/** The pinned Timeline section height, as a fraction of the viewport height. */
	ganttHeight = $state<number>(GANTT_HEIGHT.default);
	/** The diagram in the Timeline section, shared by all plans. */
	diagramView = $state<DiagramViewId>(GANTT_VIEW_ID);
	/** The diagrams to print, in print order, shared by all plans. */
	printDiagrams = $state<DiagramViewId[]>([GANTT_VIEW_ID]);

	/**
	 * @param viewIds The registered diagram view ids in display and print order.
	 */
	constructor(
		private readonly storage: Storage,
		private readonly viewIds: readonly DiagramViewId[] = [GANTT_VIEW_ID]
	) {
		let data: ViewerData = v.parse(ViewerSchema, {});
		try {
			const raw = storage.getItem(KEYS.viewer);
			if (raw !== null) {
				data = v.parse(ViewerSchema, JSON.parse(raw));
			}
		} catch {
			// Viewer state is not important. Use the defaults.
		}
		this.expanded = data.expanded;
		this.splitRatio = data.splitRatio;
		this.narrowTab = data.narrowTab;
		this.ganttPinned = data.ganttPinned;
		this.timelineCollapsed = data.timelineCollapsed;
		this.timelineLegendsCollapsed = data.timelineLegendsCollapsed ?? data.ganttPinned;
		this.timelineKeepOpen = data.timelineKeepOpen;
		this.ganttHeight = data.ganttHeight;
		this.diagramView = resolveDiagramView(data.diagramView, viewIds);
		this.printDiagrams = resolvePrintDiagrams(data.printDiagrams, viewIds);
	}

	private save(): void {
		const data: ViewerData = {
			expanded: $state.snapshot(this.expanded),
			splitRatio: this.splitRatio,
			narrowTab: this.narrowTab,
			ganttPinned: this.ganttPinned,
			timelineCollapsed: this.timelineCollapsed,
			timelineLegendsCollapsed: this.timelineLegendsCollapsed,
			timelineKeepOpen: this.timelineKeepOpen,
			ganttHeight: this.ganttHeight,
			diagramView: this.diagramView,
			printDiagrams: [...this.printDiagrams]
		};
		this.storage.setItem(KEYS.viewer, JSON.stringify(data));
	}

	isExpanded(planId: string, taskId: string): boolean {
		return this.expanded[planId]?.includes(taskId) ?? false;
	}

	setExpanded(planId: string, taskId: string, value: boolean): void {
		const current = this.expanded[planId] ?? [];
		const next = value
			? current.includes(taskId)
				? current
				: [...current, taskId]
			: current.filter((id) => id !== taskId);
		this.expanded = { ...this.expanded, [planId]: next };
		this.save();
	}

	toggleExpanded(planId: string, taskId: string): void {
		this.setExpanded(planId, taskId, !this.isExpanded(planId, taskId));
	}

	setSplitRatio(value: number): void {
		if (!Number.isFinite(value)) return;
		this.splitRatio = Math.min(1, Math.max(0, value));
		this.save();
	}

	setNarrowTab(value: 'plan' | 'work-plan'): void {
		this.narrowTab = value;
		this.save();
	}

	setGanttPinned(value: boolean): void {
		this.ganttPinned = value;
		this.save();
	}

	setTimelineCollapsed(value: boolean): void {
		this.timelineCollapsed = value;
		this.save();
	}

	setTimelineLegendsCollapsed(value: boolean): void {
		this.timelineLegendsCollapsed = value;
		this.save();
	}

	setTimelineKeepOpen(value: boolean): void {
		this.timelineKeepOpen = value;
		this.save();
	}

	setGanttHeight(fraction: number): void {
		this.ganttHeight = Math.min(GANTT_HEIGHT.max, Math.max(0, fraction));
		this.save();
	}

	/** Selects the diagram view. An unregistered id does nothing. */
	setDiagramView(id: DiagramViewId): void {
		if (!this.viewIds.includes(id) || this.diagramView === id) return;
		this.diagramView = id;
		this.save();
	}

	/** Adds or removes a diagram from print. The last selected diagram stays. */
	setPrintDiagram(id: DiagramViewId, selected: boolean): void {
		if (!this.viewIds.includes(id) || selected === this.printDiagrams.includes(id)) return;
		if (!selected && this.printDiagrams.length === 1) return;
		this.printDiagrams = selected
			? resolvePrintDiagrams([...this.printDiagrams, id], this.viewIds)
			: this.printDiagrams.filter((item) => item !== id);
		this.save();
	}

	/** Returns the ids of the expanded tasks of a plan. */
	expandedIds(planId: string): string[] {
		return [...(this.expanded[planId] ?? [])];
	}

	/** Puts back the expanded tasks of a plan. Use it after `forgetPlan`, for example on Undo. */
	restorePlan(planId: string, ids: readonly string[]): void {
		if (ids.length === 0) return;
		this.expanded = { ...this.expanded, [planId]: [...ids] };
		this.save();
	}

	/** Removes the viewer state of a plan that does not exist any more. */
	forgetPlan(planId: string): void {
		if (!(planId in this.expanded)) return;
		const next = { ...this.expanded };
		delete next[planId];
		this.expanded = next;
		this.save();
	}
}

const CONTEXT = Symbol('viewer');

export function setViewer(viewer: ViewerState): ViewerState {
	return setContext(CONTEXT, viewer);
}

export function getViewer(): ViewerState {
	return getContext<ViewerState>(CONTEXT);
}
