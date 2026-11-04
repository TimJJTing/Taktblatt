/**
 * Transient editing state of the workspace: the new row that waits for input,
 * the open task modal and the linked highlight. It is not saved.
 */
import { getContext, setContext } from 'svelte';

export class EditingState {
	/** The id of a new task. Its title starts in edit mode. */
	newTaskId = $state<string | null>(null);
	/** The id of the task in the task modal. */
	detailsTaskId = $state<string | null>(null);
	/** The element that opened the task modal. The focus goes back to it. */
	detailsReturnFocus: HTMLElement | null = null;
	/** The task that has hover or focus, for the linked highlight between Gantt and table. */
	highlightId = $state<string | null>(null);
	/** A task row that flashes one time, after a jump from the Gantt. */
	flashId = $state<string | null>(null);

	openDetails(id: string, from: HTMLElement | null) {
		this.detailsReturnFocus = from;
		this.detailsTaskId = id;
	}
}

const CONTEXT = Symbol('editing');

export function setEditing(state: EditingState): EditingState {
	return setContext(CONTEXT, state);
}

export function getEditing(): EditingState {
	return getContext<EditingState>(CONTEXT);
}
