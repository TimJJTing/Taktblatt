/**
 * Motion adapter hooks of the diagram stage. Refer to ADR 20 and docs/spec.md, section 5.13.
 *
 * The stage samples the rendered task nodes of a view (`DIAGRAM_ATTR`). `getBoundingClientRect`
 * reads the current frame: it includes running tweens, transforms, the sticky label area and all
 * scroll offsets. The hooks convert the result to stage coordinates in CSS pixels.
 * This module has the capture, apply, finish and cancel hooks and the scroll-container hooks.
 * The FLIP flight layer across scroll containers and cross-router connector interpolation are
 * deferred shared work. A false `routersCompatible` result identifies that path.
 */
import { DIAGRAM_ATTR, type DiagramMotionInfo } from './view-contract.ts';

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
	radius: number;
}

export interface Point {
	x: number;
	y: number;
}

/** The current rendered geometry of one task, in stage coordinates. */
export interface TaskGeometry {
	/** The task box, or null when the task has only a label. */
	box: Box | null;
	/** The identity station center and radius, or null. */
	station: (Point & { r: number }) | null;
	/** The label position (its top-left corner), or null. */
	label: Point | null;
	/** The parent task id, for an emerging subtask. */
	parentId: string | null;
}

/** Converts a viewport rectangle to a box relative to the stage origin. */
export function toStage(rect: DOMRect, stage: DOMRect, radius = 0): Box {
	return {
		x: rect.left - stage.left,
		y: rect.top - stage.top,
		w: rect.width,
		h: rect.height,
		radius
	};
}

function radiusOf(element: Element): number {
	const value = parseFloat(getComputedStyle(element).borderTopLeftRadius);
	return Number.isFinite(value) ? value : 0;
}

/**
 * Reads the current geometry of every rendered task in `root`.
 * A task with a label and no box keeps its label position. A task with neither has no record.
 */
export function captureGeometry(root: ParentNode, stage: Element): Map<string, TaskGeometry> {
	const origin = stage.getBoundingClientRect();
	const records = new Map<string, TaskGeometry>();
	const record = (id: string) => {
		let entry = records.get(id);
		if (!entry) {
			entry = { box: null, station: null, label: null, parentId: null };
			records.set(id, entry);
		}
		return entry;
	};
	for (const element of root.querySelectorAll<HTMLElement>(`[${DIAGRAM_ATTR.task}]`)) {
		const id = element.getAttribute(DIAGRAM_ATTR.task)!;
		const entry = record(id);
		entry.box = toStage(element.getBoundingClientRect(), origin, radiusOf(element));
		entry.parentId = element.getAttribute(DIAGRAM_ATTR.parent);
		const station = element.querySelector(`[${DIAGRAM_ATTR.station}]`);
		if (station) {
			const rect = station.getBoundingClientRect();
			entry.station = {
				x: rect.left + rect.width / 2 - origin.left,
				y: rect.top + rect.height / 2 - origin.top,
				r: rect.width / 2
			};
		}
	}
	for (const element of root.querySelectorAll<HTMLElement>(`[${DIAGRAM_ATTR.label}]`)) {
		const id = element.getAttribute(DIAGRAM_ATTR.label)!;
		const rect = element.getBoundingClientRect();
		record(id).label = { x: rect.left - origin.left, y: rect.top - origin.top };
	}
	return records;
}

/**
 * The source of a destination task: its own outgoing record, else the parent's box or label
 * (an emerging subtask). Null means: no source, fade in at the destination.
 */
export function sourceBox(
	id: string,
	parentId: string | null,
	outgoing: ReadonlyMap<string, TaskGeometry>
): Box | null {
	const own = outgoing.get(id);
	if (own?.box) return own.box;
	if (own?.label) return { ...own.label, w: 0, h: 0, radius: 0 };
	const parent = parentId === null ? undefined : outgoing.get(parentId);
	if (parent?.box) return parent.box;
	if (parent?.label) return { ...parent.label, w: 0, h: 0, radius: 0 };
	return null;
}

/** True only when both views use the same router with the same connector point meaning. */
export function routersCompatible(a: DiagramMotionInfo, b: DiagramMotionInfo): boolean {
	return a.routerId === b.routerId && a.connectorSchema === b.connectorSchema;
}

/** The scroll container of a task node: its nearest scrolling ancestor inside the stage. */
export interface ScrollContainer {
	element: HTMLElement;
	/** The viewport bounds of the container, in stage coordinates. */
	bounds: Box;
	scrollLeft: number;
	scrollTop: number;
}

export function scrollContainerOf(element: Element, stage: Element): ScrollContainer | null {
	const origin = stage.getBoundingClientRect();
	for (let node = element.parentElement; node && node !== stage; node = node.parentElement) {
		const style = getComputedStyle(node);
		const scrolls = /(auto|scroll)/.test(style.overflowX + style.overflowY);
		if (scrolls) {
			return {
				element: node,
				bounds: toStage(node.getBoundingClientRect(), origin),
				scrollLeft: node.scrollLeft,
				scrollTop: node.scrollTop
			};
		}
	}
	return null;
}

const FLIGHT = Symbol('diagram-flight');
type Flying = HTMLElement & { [FLIGHT]?: Animation };

/** The transform that draws a box laid out at `here` at `box` instead. */
function offset(box: Box, here: Box): string | null {
	const dx = box.x - here.x;
	const dy = box.y - here.y;
	const sx = here.w > 0 && box.w > 0 ? box.w / here.w : 1;
	const sy = here.h > 0 && box.h > 0 ? box.h / here.h : 1;
	if (
		Math.abs(dx) < 0.5 &&
		Math.abs(dy) < 0.5 &&
		Math.abs(sx - 1) < 0.01 &&
		Math.abs(sy - 1) < 0.01
	)
		return null;
	return `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
}

/**
 * Apply: moves each task box of `root` from its source to its rendered position (FLIP).
 * `toward` moves outgoing boxes from their current frame to the destination.
 * A box in flight continues from its current rendered frame: the hook reads that frame,
 * cancels the old flight, and starts the new one there. Returns the started animations.
 * Duration 0 starts nothing.
 */
export function applyTransition(
	root: ParentNode,
	stage: Element,
	other: ReadonlyMap<string, TaskGeometry>,
	duration: number,
	direction: 'from' | 'toward',
	/** For `toward`: the frame captured before the change, if the layout has changed since. */
	before?: ReadonlyMap<string, TaskGeometry>
): Animation[] {
	if (duration <= 0) return [];
	const origin = stage.getBoundingClientRect();
	const animations: Animation[] = [];
	for (const element of root.querySelectorAll<Flying>(`[${DIAGRAM_ATTR.task}]`)) {
		const id = element.getAttribute(DIAGRAM_ATTR.task)!;
		const source = sourceBox(id, element.getAttribute(DIAGRAM_ATTR.parent), other);
		if (!source) continue;
		// Read the current frame before canceling the old flight, then the layout position.
		const current = before?.get(id)?.box ?? toStage(element.getBoundingClientRect(), origin);
		element[FLIGHT]?.cancel();
		element[FLIGHT] = undefined;
		const here = toStage(element.getBoundingClientRect(), origin);
		const first = offset(direction === 'from' ? source : current, here);
		const last = direction === 'from' ? null : offset(source, here);
		if (first === last) continue;
		// The keyframes carry the origin, so no inline style stays after the animation.
		const frame = (transform: string | null) => ({
			transform: transform ?? 'none',
			transformOrigin: '0 0'
		});
		const animation = element.animate([frame(first), frame(last)], {
			duration,
			easing: 'cubic-bezier(0.33, 1, 0.68, 1)',
			// Replace, not add: an added transform-origin would sum with the default 50 % 50 %.
			// Task boxes position with `translate` and `left`, not with `transform`.
			fill: direction === 'toward' ? 'forwards' : 'none'
		});
		element[FLIGHT] = animation;
		animations.push(animation);
	}
	return animations;
}

/** Finish or cancel: stops the animations and removes their temporary state. */
export function stopTransition(animations: readonly Animation[]): void {
	for (const animation of animations) animation.cancel();
}
