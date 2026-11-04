/**
 * Viewer state: settings for this browser only. They are not in the plan file.
 * The UI language is kept by Paraglide (key `taktblatt:locale`).
 * Refer to ADR 4.
 */
import { getContext, setContext } from 'svelte';
import * as v from 'valibot';
import { KEYS } from './storage';

export const GANTT_HEIGHT = { default: 0.35, max: 0.5, minPx: 120 } as const;

const ViewerSchema = v.object({
	expanded: v.optional(v.record(v.string(), v.array(v.string())), {}),
	ganttPinned: v.optional(v.boolean(), false),
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
	/** The pinned Gantt height, as a fraction of the viewport height. */
	ganttHeight = $state<number>(GANTT_HEIGHT.default);

	constructor(private readonly storage: Storage) {
		const raw = storage.getItem(KEYS.viewer);
		let data: ViewerData = v.parse(ViewerSchema, {});
		if (raw !== null) {
			try {
				data = v.parse(ViewerSchema, JSON.parse(raw));
			} catch {
				// Viewer state is not important. Use the defaults.
			}
		}
		this.expanded = data.expanded;
		this.ganttPinned = data.ganttPinned;
		this.ganttHeight = data.ganttHeight;
	}

	private save(): void {
		const data: ViewerData = {
			expanded: $state.snapshot(this.expanded),
			ganttPinned: this.ganttPinned,
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

	setGanttPinned(value: boolean): void {
		this.ganttPinned = value;
		this.save();
	}

	setGanttHeight(fraction: number): void {
		this.ganttHeight = Math.min(GANTT_HEIGHT.max, Math.max(0, fraction));
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
