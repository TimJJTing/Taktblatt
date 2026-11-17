/**
 * Current-frame capture and cue flights for the diagram stage. Refer to spec 5.13 and ADR 23.
 *
 * Read rendered nodes in stage CSS pixels, including scroll offsets and running transforms.
 * Move decorative copies of the incoming cues in one clipped flight layer. Keep real task
 * boxes in place. Finish and cancel remove the copies and restore the real cue styles.
 */
import { DIAGRAM_ATTR, type DiagramMotionInfo } from './view-contract.ts';

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Point {
	x: number;
	y: number;
}

/** The current rendered geometry of one task, in stage coordinates. */
export interface TaskGeometry {
	/** The rendered task box, or null when the task has only a label. */
	box: Box | null;
	/** The identity station center and radius, or null. */
	station: (Point & { r: number }) | null;
	/** The rendered label box, or null. Its anchor is the top-left corner. */
	label: Box | null;
	/** The real station elements, or the label elements when there is no station. */
	elements: HTMLElement[];
	/** The parent task id, for an emerging subtask. */
	parentId: string | null;
}

/** Converts a viewport rectangle to a box relative to the stage origin. */
export function toStage(rect: DOMRect, stage: DOMRect): Box {
	return {
		x: rect.left - stage.left,
		y: rect.top - stage.top,
		w: rect.width,
		h: rect.height
	};
}

/** Reads the current box, station and label geometry of every rendered task in `root`. */
export function captureGeometry(root: ParentNode, stage: Element): Map<string, TaskGeometry> {
	const origin = stage.getBoundingClientRect();
	const records = new Map<string, TaskGeometry>();
	const record = (id: string) => {
		let entry = records.get(id);
		if (!entry) {
			entry = { box: null, station: null, label: null, parentId: null, elements: [] };
			records.set(id, entry);
		}
		return entry;
	};
	for (const element of root.querySelectorAll<HTMLElement>(`[${DIAGRAM_ATTR.task}]`)) {
		const id = element.getAttribute(DIAGRAM_ATTR.task)!;
		const entry = record(id);
		entry.box = toStage(element.getBoundingClientRect(), origin);
		entry.parentId = element.getAttribute(DIAGRAM_ATTR.parent);
	}
	for (const element of root.querySelectorAll<HTMLElement>(`[${DIAGRAM_ATTR.station}]`)) {
		const id = element.getAttribute(DIAGRAM_ATTR.station)!;
		const entry = record(id);
		const rect = element.getBoundingClientRect();
		entry.station = {
			x: rect.left + rect.width / 2 - origin.left,
			y: rect.top + rect.height / 2 - origin.top,
			r: rect.width / 2
		};
		entry.elements.push(element);
	}
	for (const element of root.querySelectorAll<HTMLElement>(`[${DIAGRAM_ATTR.label}]`)) {
		const id = element.getAttribute(DIAGRAM_ATTR.label)!;
		const entry = record(id);
		entry.label = toStage(element.getBoundingClientRect(), origin);
		if (!entry.station) entry.elements.push(element);
	}
	return records;
}

/**
 * Compares router identities and connector meanings. Every view pair fades connectors,
 * including a compatible pair. Refer to spec 5.13.
 */
export function routersCompatible(a: DiagramMotionInfo, b: DiagramMotionInfo): boolean {
	return a.routerId === b.routerId && a.connectorSchema === b.connectorSchema;
}

interface Cue extends Box {
	kind: 'station' | 'label';
}

/** Selects the station center, else the label's top-left corner. */
export function cueOf(geometry: TaskGeometry): Cue | null {
	if (geometry.station) {
		const { x, y, r } = geometry.station;
		return { kind: 'station', x, y, w: 2 * r, h: 2 * r };
	}
	return geometry.label ? { kind: 'label', ...geometry.label } : null;
}

/** True when any part of the cue box is inside the stage box. */
function intersects(cue: Cue, stage: DOMRect): boolean {
	const x = cue.x - (cue.kind === 'station' ? cue.w / 2 : 0);
	const y = cue.y - (cue.kind === 'station' ? cue.h / 2 : 0);
	return x < stage.width && y < stage.height && x + cue.w > 0 && y + cue.h > 0;
}

/** Copies the incoming cue without task identity, focus or route input. */
function copyCue(element: HTMLElement, cue: Cue, id: string): HTMLElement {
	const copy = element.cloneNode(true) as HTMLElement;
	for (const node of [copy, ...copy.querySelectorAll('*')]) {
		for (const name of node.getAttributeNames()) {
			if (
				/^(id|tabindex|data-diagram-.*|data-route-.*|data-testid|aria-describedby|aria-controls|aria-labelledby)$/.test(
					name
				)
			)
				node.removeAttribute(name);
		}
	}
	const style = getComputedStyle(element);
	Object.assign(copy.style, {
		position: 'absolute',
		inset: 'auto',
		left: `${cue.x - (cue.kind === 'station' ? cue.w / 2 : 0)}px`,
		top: `${cue.y - (cue.kind === 'station' ? cue.h / 2 : 0)}px`,
		width: `${cue.w}px`,
		height: `${cue.h}px`,
		minWidth: '0',
		minHeight: '0',
		maxWidth: 'none',
		maxHeight: 'none',
		boxSizing: 'border-box',
		margin: '0',
		translate: 'none',
		rotate: 'none',
		scale: 'none',
		transform: 'none',
		transformOrigin: 'center',
		visibility: 'visible',
		pointerEvents: 'none',
		color: style.color,
		font: style.font,
		letterSpacing: style.letterSpacing
	});
	copy.inert = true;
	copy.setAttribute('data-flight-copy', id);
	return copy;
}

/**
 * Moves incoming cue copies between captured anchors. The stage supplies a duration from
 * motionDuration(). Finish and cancel use the same cleanup. A zero duration changes no DOM.
 */
export function createFlight(
	stage: Element,
	outgoing: ReadonlyMap<string, TaskGeometry>,
	incoming: ReadonlyMap<string, TaskGeometry>,
	duration: number
): { animations: Animation[]; capture: () => Map<string, TaskGeometry>; cancel: () => void } {
	const animations: Animation[] = [];
	const copies = new Map<string, { element: HTMLElement; cue: Cue; parentId: string | null }>();
	const hidden = new Map<HTMLElement, { visibility: string; opacity: string | null }>();
	let canceled = false;
	const cancel = () => {
		if (canceled) return;
		canceled = true;
		for (const animation of animations) animation.cancel();
		for (const { element } of copies.values()) element.remove();
		copies.clear();
		for (const [element, previous] of hidden) {
			element.style.visibility = previous.visibility;
			if (previous.opacity !== null) element.style.opacity = previous.opacity;
		}
		hidden.clear();
	};
	const capture = () => {
		const origin = stage.getBoundingClientRect();
		const records = new Map<string, TaskGeometry>();
		for (const [id, { element, cue, parentId }] of copies) {
			const box = toStage(element.getBoundingClientRect(), origin);
			records.set(id, {
				box: null,
				station:
					cue.kind === 'station'
						? { x: box.x + box.w / 2, y: box.y + box.h / 2, r: box.w / 2 }
						: null,
				label: cue.kind === 'label' ? box : null,
				elements: [],
				parentId
			});
		}
		return records;
	};
	const layer = stage.querySelector<HTMLElement>(`[${DIAGRAM_ATTR.flight}]`);
	if (duration <= 0 || !layer) return { animations, capture, cancel };
	const bounds = stage.getBoundingClientRect();
	const prepared: {
		id: string;
		geometry: TaskGeometry;
		own: TaskGeometry | undefined;
		from: Cue;
		to: Cue;
		copy: HTMLElement;
	}[] = [];
	// Read incoming paint while all copies are detached and all real cues are unchanged.
	for (const [id, geometry] of incoming) {
		const own = outgoing.get(id);
		const source = own ?? (geometry.parentId ? outgoing.get(geometry.parentId) : undefined);
		const from = source ? cueOf(source) : null;
		const to = cueOf(geometry);
		const element = geometry.elements[0];
		if (!from || !to || !element || (!intersects(from, bounds) && !intersects(to, bounds)))
			continue;
		const copy = copyCue(element, to, id);
		prepared.push({ id, geometry, own, from, to, copy });
	}
	for (const { id, geometry, own, from, to, copy } of prepared) {
		layer.append(copy);
		copies.set(id, { element: copy, cue: to, parentId: geometry.parentId });
		const scale = from.kind === 'station' && to.kind === 'station' && to.w > 0 ? from.w / to.w : 1;
		animations.push(
			copy.animate(
				[
					{ transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${scale})` },
					{ transform: 'translate(0px, 0px) scale(1)' }
				],
				{ duration, easing: 'cubic-bezier(0.33, 1, 0.68, 1)', fill: 'both' }
			)
		);
		for (const real of [...(own?.elements ?? []), ...geometry.elements]) {
			if (hidden.has(real)) continue;
			// A focused label must stay focusable. Hide its paint without hiding the focus target.
			const focusedLabel =
				real.hasAttribute(DIAGRAM_ATTR.label) &&
				!real.hasAttribute(DIAGRAM_ATTR.station) &&
				real.contains(document.activeElement);
			hidden.set(real, {
				visibility: real.style.visibility,
				opacity: focusedLabel ? real.style.opacity : null
			});
			if (focusedLabel) {
				real.style.opacity = '0';
			} else {
				real.style.visibility = 'hidden';
			}
		}
	}
	void Promise.allSettled(animations.map((animation) => animation.finished)).then(cancel);
	return { animations, capture, cancel };
}
