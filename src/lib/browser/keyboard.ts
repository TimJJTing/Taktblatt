/** Keyboard helpers. */

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
