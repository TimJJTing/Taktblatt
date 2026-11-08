/**
 * Viewer state: settings for this browser only. They are not in the plan file.
 * The UI language is kept by Paraglide (key `taktblatt:locale`).
 * Refer to ADR 4.
 */
import { getContext, setContext } from 'svelte';
import * as v from 'valibot';
import { KEYS } from '#lib/state/storage.ts';

export const GANTT_HEIGHT = { default: 0.35, max: 0.5, minPx: 120 } as const;

const ViewerSchema = v.object({
	splitRatio: v.fallback(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0.5),
	narrowTab: v.fallback(v.picklist(['plan', 'work-plan']), 'plan'),
	expanded: v.optional(v.record(v.string(), v.array(v.string())), {}),
	ganttPinned: v.optional(v.boolean(), false),
	timelineLegendsCollapsed: v.optional(v.boolean()),
	ganttHeight: v.optional(
		v.pipe(v.number(), v.minValue(0), v.maxValue(GANTT_HEIGHT.max)),
		GANTT_HEIGHT.default
	)
});

type ViewerData = v.InferOutput<typeof ViewerSchema>;

export class ViewerState {
	/** The expanded task ids, for each plan. The Gantt and the table share them. */
	expanded = $state<Record<string, string[]>>({});
	ganttPinned = $state(false);
	splitRatio = $state(0.5);
	narrowTab = $state<'plan' | 'work-plan'>('plan');
	timelineLegendsCollapsed = $state(false);
	/** The pinned Timeline section height, as a fraction of the viewport height. */
	ganttHeight = $state<number>(GANTT_HEIGHT.default);

	constructor(private readonly storage: Storage) {
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
		this.timelineLegendsCollapsed = data.timelineLegendsCollapsed ?? data.ganttPinned;
		this.ganttHeight = data.ganttHeight;
	}

	private save(): void {
		const data: ViewerData = {
			expanded: $state.snapshot(this.expanded),
			splitRatio: this.splitRatio,
			narrowTab: this.narrowTab,
			ganttPinned: this.ganttPinned,
			timelineLegendsCollapsed: this.timelineLegendsCollapsed,
			ganttHeight: this.ganttHeight
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

	setTimelineLegendsCollapsed(value: boolean): void {
		this.timelineLegendsCollapsed = value;
		this.save();
	}

	setGanttHeight(fraction: number): void {
		this.ganttHeight = Math.min(GANTT_HEIGHT.max, Math.max(0, fraction));
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
