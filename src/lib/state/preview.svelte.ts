/**
 * Transient state of the preview and of print. It is not in the plan and not in the viewer state.
 * `open` is true while the preview shows. `printing` is true between the print events
 * when the preview is not open.
 */
import { flushSync, getContext, setContext, tick } from 'svelte';
import { isTextEditing } from '#lib/browser/keyboard.ts';

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

	/**
	 * Renders and measures the sheets for a print without the preview.
	 * Chrome refuses the callback of the Trusted Types policy of Svelte (`createHTML`) inside
	 * `beforeprint`. The first render of a template then throws. So the app calls this before
	 * the print starts.
	 */
	renderSheets(): void {
		// An inline field in edit mode holds the new text in a draft. Blur commits it.
		// This must come first: the commit can render new blocks.
		const active = document.activeElement;
		if (active instanceof HTMLElement && isTextEditing(active)) active.blur();
		flushSync();
		if (this.open) return;
		this.printing = true;
		// The first flush renders the hidden blocks. The next flush measures and renders the sheets.
		flushSync();
		flushSync();
	}

	/** Opens the print dialog. The sheets render first. */
	print(): void {
		this.renderSheets();
		window.print();
		// Normally `afterprint` or the end of the print media has reset the flag by now.
		// If not (print is off, or a webview ignores it), the next input of the user resets it.
		if (this.printing) this.resetOnInput();
	}

	private stopWaiting: (() => void) | null = null;

	private resetOnInput(): void {
		this.stopWaiting?.();
		const reset = () => {
			this.stopWaiting?.();
			this.printing = false;
		};
		const options = { capture: true };
		window.addEventListener('pointerdown', reset, options);
		window.addEventListener('keydown', reset, options);
		this.stopWaiting = () => {
			window.removeEventListener('pointerdown', reset, options);
			window.removeEventListener('keydown', reset, options);
			this.stopWaiting = null;
		};
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
