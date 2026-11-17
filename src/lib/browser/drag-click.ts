/** A pointer move of this distance or more starts a drag. */
export const DRAG_START_PX = 4;

/** Suppress the click after a drag. Keep keyboard clicks. */
export function suppressNextClick(): () => void {
	const clear = () => {
		document.removeEventListener('click', suppress, true);
		document.removeEventListener('pointerdown', clear, true);
		window.clearTimeout(timeout);
	};
	const suppress = (event: MouseEvent) => {
		if (event.detail !== 0) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
		clear();
	};
	document.addEventListener('click', suppress, { capture: true, once: true });
	document.addEventListener('pointerdown', clear, { capture: true, once: true });
	const timeout = window.setTimeout(clear, 400);
	return clear;
}
