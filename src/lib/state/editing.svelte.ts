/**
 * Transient editing state of the workspace: the new row or remark section that waits for input,
 * the open task modal and the linked highlight. It is not saved.
 */
import { getContext, setContext } from 'svelte';
import { motionDuration } from '#lib/motion.ts';
import { RouteFocusState } from './route-focus.svelte.ts';

/** The duration of the row flash, before motionDuration. The row-flash class uses it. */
export const FLASH_MS = 1200;

/** Calls `fn` after the next two frames, so that the browser draws one frame between. */
function afterNextFrame(fn: () => void) {
	if (typeof requestAnimationFrame !== 'function') {
		setTimeout(fn, 0);
		return;
	}
	requestAnimationFrame(() => requestAnimationFrame(fn));
}

export class EditingState {
	// Stub: slice 4 implementation pending.
	readonly routeFocus = new RouteFocusState();
	/** The id of a new task. Its title starts in edit mode. */
	newTaskId = $state<string | null>(null);
	/** The id of a new remark section. Its title starts in edit mode. */
	newRemarkSectionId = $state<string | null>(null);
	/** The id of the task in the task modal. */
	detailsTaskId = $state<string | null>(null);
	/** The element that opened the task modal. The focus goes back to it. */
	detailsReturnFocus: HTMLElement | null = null;
	/** The task that has hover or focus, for the linked highlight between Gantt and table. */
	highlightId = $state<string | null>(null);
	/** The task whose dependency route is lit across diagram views. */
	routeId = $state<string | null>(null);
	/** A task row that flashes one time, after a jump from the Gantt. */
	flashId = $state<string | null>(null);

	#flashTimer: ReturnType<typeof setTimeout> | undefined;
	#flashCount = 0;

	openDetails(id: string, from: HTMLElement | null) {
		this.detailsReturnFocus = from;
		this.detailsTaskId = id;
	}

	/**
	 * Flashes the table row of a task one time. A new call starts the flash again.
	 * The flash class goes away for one frame, so that the CSS animation starts again.
	 */
	flash(id: string) {
		clearTimeout(this.#flashTimer);
		this.flashId = null;
		const count = ++this.#flashCount;
		afterNextFrame(() => {
			if (count !== this.#flashCount) return;
			this.flashId = id;
			this.#flashTimer = setTimeout(
				() => {
					if (this.flashId === id) this.flashId = null;
				},
				motionDuration(FLASH_MS) + 50
			);
		});
	}
}

const CONTEXT = Symbol('editing');

export function setEditing(state: EditingState): EditingState {
	return setContext(CONTEXT, state);
}

export function getEditing(): EditingState {
	return getContext<EditingState>(CONTEXT);
}
