/** Keyboard helpers. */

/** Return true while an input method composes text. */
export function isComposing(event: KeyboardEvent): boolean {
	return event.isComposing || event.keyCode === 229;
}

/** Returns true when Cmd (macOS) or Ctrl (other systems) is pressed. */
export function isModKey(event: KeyboardEvent): boolean {
	return event.metaKey || event.ctrlKey;
}

/** Returns true when the focus is in a text field. Then the browser handles undo itself. */
export function isTextEditing(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	if (target instanceof HTMLTextAreaElement) return true;
	if (target instanceof HTMLInputElement) {
		return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(
			target.type
		);
	}
	return false;
}

/**
 * The next choice of a roving radio group (one Tab stop, arrows move the selection).
 * Right and Down go forward, Left and Up go back; both wrap. Home and End go to the first and
 * last choice. Returns null for other keys and during text composition.
 */
export function radioGroupIndex(event: KeyboardEvent, index: number, count: number): number | null {
	if (isComposing(event) || count === 0) return null;
	switch (event.key) {
		case 'ArrowRight':
		case 'ArrowDown':
			return (index + 1) % count;
		case 'ArrowLeft':
		case 'ArrowUp':
			return (index - 1 + count) % count;
		case 'Home':
			return 0;
		case 'End':
			return count - 1;
		default:
			return null;
	}
}

/** Focuses the radio choice at `index` in `group`. */
export function focusRadio(group: ParentNode | null | undefined, index: number): void {
	group?.querySelectorAll<HTMLElement>('[role="radio"]')[index]?.focus();
}
