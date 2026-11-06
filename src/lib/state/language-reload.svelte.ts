/**
 * A change of the UI language reloads the page. The reload drops the undo history and the
 * drafts of open dialogs. This state asks the person first when something would be lost.
 * Refer to ADR 9.
 */
import { getContext, setContext } from 'svelte';
import { isTextEditing } from '#lib/browser/keyboard.ts';
import { getLocale, overwriteGetLocale, setLocale, type Locale } from '#lib/paraglide/runtime.js';
import type { Workspace } from './workspace.svelte.ts';

export interface WorkAtRisk {
	canUndo: boolean;
	canRedo: boolean;
	/** A dialog with a draft is open. The print preview is not such a dialog. */
	dialogOpen: boolean;
}

/** Returns true when a reload would drop something. */
export function losesWork(risk: WorkAtRisk): boolean {
	return risk.canUndo || risk.canRedo || risk.dialogOpen;
}

/** The parts that tests replace. */
export interface LanguageReloadEnv {
	reload: () => void;
	setLocale: (locale: Locale) => void;
}

const browserEnv: LanguageReloadEnv = {
	reload: () => location.reload(),
	setLocale: (locale) => void setLocale(locale)
};

export class LanguageReload {
	/** True while the question shows. */
	open = $state(false);
	/** The wording of the question. It stays when the question closes, for the exit animation. */
	kind = $state<'switch' | 'other-tab'>('switch');
	private target: Locale | null = null;
	/** The language that this page shows until the next reload. */
	private readonly shown = getLocale();

	constructor(
		private readonly ws: Workspace,
		private readonly preview: { open: boolean },
		private readonly env: LanguageReloadEnv = browserEnv
	) {
		// Paraglide reads the saved language on each call. Pin it, so a change in another tab
		// cannot mix two languages in this page (later dialogs, the print sheets).
		overwriteGetLocale(() => this.shown);
	}

	private atRisk(): boolean {
		return losesWork({
			canUndo: this.ws.history.canUndo,
			canRedo: this.ws.history.canRedo,
			dialogOpen: !this.preview.open && document.querySelector('[role="dialog"]') !== null
		});
	}

	/** The person chose a language in the menu. */
	choose(locale: Locale): void {
		// The same language: save it again, in case another tab saved a different one. No reload.
		if (locale === this.shown) {
			this.env.setLocale(locale);
			return;
		}
		if (this.atRisk()) {
			this.kind = 'switch';
			this.target = locale;
			this.open = true;
		} else this.env.setLocale(locale);
	}

	/** Another tab saved a language (`newValue` is null when it removed the key). */
	changedInOtherTab(newValue: string | null): void {
		if (newValue === null || newValue === this.shown) {
			// The change went back. A question about it is obsolete.
			if (this.kind === 'other-tab') this.open = false;
			return;
		}
		// A text field that has the focus commits on blur. Then the history shows the change.
		const active = document.activeElement;
		if (active instanceof HTMLElement && isTextEditing(active)) active.blur();
		if (!this.atRisk()) {
			this.env.reload();
			return;
		}
		this.kind = 'other-tab';
		this.open = true;
	}

	confirm(): void {
		this.open = false;
		if (this.kind === 'switch' && this.target) this.env.setLocale(this.target);
		else if (this.kind === 'other-tab') this.env.reload();
	}

	cancel(): void {
		this.open = false;
	}
}

const KEY = Symbol('language-reload');

export function setLanguageReload(state: LanguageReload): LanguageReload {
	return setContext(KEY, state);
}

export function getLanguageReload(): LanguageReload {
	return getContext<LanguageReload>(KEY);
}
