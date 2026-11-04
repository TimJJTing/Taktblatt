/**
 * Transient state of the preview and of print. It is not in the plan and not in the viewer state.
 * `open` is true while the preview shows. `printing` is true between the print events
 * when the preview is not open.
 */
import { getContext, setContext, tick } from 'svelte';

export class PreviewState {
	open = $state(false);
	/** True while the app renders the sheets for a print without the preview. */
	printing = $state(false);
	/** The element that opened the preview. The focus goes back to it on close. */
	private opener: HTMLElement | null = null;

	show(opener: HTMLElement | null): void {
		this.opener = opener;
		this.open = true;
	}

	hide(): void {
		this.open = false;
		const opener = this.opener;
		this.opener = null;
		// Wait for the page behind the preview to lose the inert state.
		void tick().then(() => opener?.focus());
	}
}

const CONTEXT = Symbol('preview');

export function setPreview(preview: PreviewState): PreviewState {
	return setContext(CONTEXT, preview);
}

export function getPreview(): PreviewState {
	return getContext<PreviewState>(CONTEXT);
}
