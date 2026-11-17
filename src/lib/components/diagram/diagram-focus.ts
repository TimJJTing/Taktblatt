/**
 * Shared diagram focus, reveal, and task-dialog return-focus helpers.
 * Refer to docs/spec/diagram-views.md#513-diagram-views, and ADR 20.
 */
import type { TaskIndex } from '#lib/domain/derive.ts';
import {
	beginTimelineLayoutChange,
	endTimelineLayoutChange
} from '#lib/components/app/app-layout.svelte.ts';
import { MOTION_SETTLE_MS } from '#lib/motion.ts';
import { DIAGRAM_ATTR, ROUTE_ATTR, type DiagramViewId } from './view-contract.ts';

export interface ReturnFocusCaptured {
	planId: string;
	viewId: DiagramViewId;
	taskId: string;
	parentId: string | null;
	from: HTMLElement | null;
}

export interface ReturnFocusCurrent {
	planId: () => string;
	viewId: () => DiagramViewId;
	stage: () => HTMLElement | null;
	controls: string;
	onReveal?: (row: { top: number; bottom: number }) => void;
	onFallback?: () => void;
}

/** Returns the task id of a task box, label or route target that contains `element`. */
export function taskIdOf(element: Element | null): string | null {
	const node = element?.closest(
		`[${DIAGRAM_ATTR.task}], [${DIAGRAM_ATTR.label}], [${ROUTE_ATTR.target}]`
	);
	return (
		node?.getAttribute(DIAGRAM_ATTR.task) ??
		node?.getAttribute(DIAGRAM_ATTR.label) ??
		node?.getAttribute(ROUTE_ATTR.target) ??
		null
	);
}

/** Returns the active view layer. Outgoing layers cannot receive focus. */
export function activeDiagramLayer(stage: HTMLElement | null): HTMLElement | null {
	return (
		Array.from(stage?.querySelectorAll<HTMLElement>(`[${DIAGRAM_ATTR.layer}]`) ?? []).find(
			(layer) => !layer.hasAttribute('inert') && layer.getAttribute('aria-hidden') !== 'true'
		) ?? null
	);
}

/** Returns the selected switch choice that controls the stage. */
export function selectedDiagramChoice(controls: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(
		`[role="radio"][aria-controls="${CSS.escape(controls)}"][aria-checked="true"]`
	);
}

/**
 * Returns the focus target of a task in `root`: its focusable task box, else its task label,
 * else its keyboard route target.
 */
export function taskFocusTarget(root: ParentNode, taskId: string): HTMLElement | null {
	const id = CSS.escape(taskId);
	const candidates = [
		...root.querySelectorAll<HTMLElement>(`[${DIAGRAM_ATTR.task}="${id}"]`),
		...root.querySelectorAll<HTMLElement>(`[${DIAGRAM_ATTR.label}="${id}"]`),
		...root.querySelectorAll<HTMLElement>(
			`[${ROUTE_ATTR.target}="${id}"][${ROUTE_ATTR.focus}="keyboard"]`
		)
	];
	return (
		candidates.find((element) => {
			if (
				!element.matches(
					'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
				) ||
				element.matches('[disabled], [tabindex="-1"]')
			)
				return false;
			// Dialogs can hide the app outside this root until close-time focus returns.
			for (let node: HTMLElement | null = element; node; node = node.parentElement) {
				if (node.matches('[inert], [hidden], [aria-hidden="true"]')) return false;
				if (node === root) break;
			}
			return true;
		}) ?? null
	);
}

/**
 * Resolves the focus target for a task in `root`, falling back to the visible parent from the
 * captured `parentId` and then to `'switch'`.
 */
export function resolveTaskFocus(
	root: ParentNode,
	target: { taskId: string; parentId: string | null }
): HTMLElement | 'switch' {
	return (
		taskFocusTarget(root, target.taskId) ??
		(target.parentId ? taskFocusTarget(root, target.parentId) : null) ??
		'switch'
	);
}

/**
 * Reveals `element` immediately inside each marked scroll container up to `stage`, then invokes
 * `onReveal` for the Timeline body.
 */
export function revealTarget(
	element: HTMLElement,
	stage: HTMLElement | null,
	onReveal?: (row: { top: number; bottom: number }) => void
): void {
	const token = beginTimelineLayoutChange();
	try {
		for (
			let parent = element.parentElement;
			parent && parent !== stage;
			parent = parent.parentElement
		) {
			if (!parent.hasAttribute(DIAGRAM_ATTR.scroller)) continue;
			const rect = parent.getBoundingClientRect();
			const target = element.getBoundingClientRect();
			const style = getComputedStyle(parent);
			const padding = (value: string) => Number.parseFloat(value) || 0;
			const top = rect.top + parent.clientTop + padding(style.scrollPaddingTop);
			const bottom =
				rect.top + parent.clientTop + parent.clientHeight - padding(style.scrollPaddingBottom);
			const left = rect.left + parent.clientLeft + padding(style.scrollPaddingLeft);
			const right =
				rect.left + parent.clientLeft + parent.clientWidth - padding(style.scrollPaddingRight);
			if (parent.scrollHeight > parent.clientHeight) {
				parent.scrollTop +=
					target.top < top ? target.top - top : Math.max(0, target.bottom - bottom);
			}
			if (parent.scrollWidth > parent.clientWidth) {
				parent.scrollLeft +=
					target.left < left ? target.left - left : Math.max(0, target.right - right);
			}
		}
		const rect = element.getBoundingClientRect();
		onReveal?.({ top: rect.top, bottom: rect.bottom });
	} finally {
		// Scroll events arrive after the synchronous reveal. Keep them marked as app scrolling.
		setTimeout(() => endTimelineLayoutChange(token), MOTION_SETTLE_MS);
	}
}

/** Rechecks dialog-return clearance after focus handlers and finite ancestor motion settle. */
function revealAfterMotion(
	element: HTMLElement,
	stage: HTMLElement | null,
	current: ReturnFocusCurrent
): void {
	const planId = current.planId();
	const viewId = current.viewId();
	const taskId = taskIdOf(element);
	const layer = element.closest(`[${DIAGRAM_ATTR.layer}]`);
	const reconcile = () => {
		if (
			!element.isConnected ||
			document.activeElement !== element ||
			current.stage() !== stage ||
			current.planId() !== planId ||
			current.viewId() !== viewId ||
			taskIdOf(element) !== taskId ||
			(layer
				? activeDiagramLayer(stage) !== layer
				: selectedDiagramChoice(current.controls) !== element)
		)
			return;
		const animations: Animation[] = [];
		for (
			let node: HTMLElement | null = element;
			node && node !== stage;
			node = node.parentElement
		) {
			animations.push(
				...node
					.getAnimations()
					.filter(
						(animation) =>
							(animation.playState === 'running' || animation.pending) &&
							animation.effect?.getComputedTiming().endTime !== Infinity
					)
			);
		}
		if (animations.length) {
			// Cancellation can replace a move. Recheck current motion before the final reveal.
			void Promise.allSettled(animations.map((animation) => animation.finished)).then(reconcile);
		} else {
			revealTarget(element, stage, current.onReveal);
		}
	};
	// The caller focuses the returned node synchronously after resolution.
	queueMicrotask(reconcile);
}

/**
 * Builds a close-time return-focus resolver for a task dialog opened from a diagram node.
 */
export function diagramReturnFocus(
	captured: ReturnFocusCaptured,
	current?: ReturnFocusCurrent
): () => HTMLElement | null {
	return () => {
		if (!current) return null;
		const stage = current.stage();
		const layer = activeDiagramLayer(stage);
		let target: HTMLElement | 'switch' = 'switch';
		if (
			current.planId() === captured.planId &&
			current.viewId() === captured.viewId &&
			layer?.getAttribute(DIAGRAM_ATTR.view) === captured.viewId
		) {
			const from = captured.from;
			target =
				from?.isConnected && layer.contains(from) && taskIdOf(from) === captured.taskId
					? from
					: resolveTaskFocus(layer, captured);
		}
		const element = target === 'switch' ? selectedDiagramChoice(current.controls) : target;
		if (element) {
			revealTarget(element, stage, current.onReveal);
			revealAfterMotion(element, stage, current);
		}
		if (target === 'switch' || taskIdOf(element) !== captured.taskId) current.onFallback?.();
		return element;
	};
}

/**
 * Captures the parent task id of `element` from `data-diagram-parent`, falling back to `index`.
 */
export function parentIdOf(element: Element | null, index: TaskIndex): string | null {
	const marked = element?.closest(`[${DIAGRAM_ATTR.parent}]`);
	if (marked) return marked.getAttribute(DIAGRAM_ATTR.parent) || null;
	const id = taskIdOf(element);
	return id ? (index.byId.get(id)?.parentId ?? null) : null;
}
