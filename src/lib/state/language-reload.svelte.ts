/**
 * A change of the UI language reloads the page. The reload drops the undo history and the
 * text that is not committed. This state asks the person first when something would be lost.
 * Refer to ADR 9.
 */
import { getContext, setContext } from 'svelte';
import { isTextEditing } from '#lib/browser/keyboard.js';
import type { Locale } from '#lib/domain/locale.js';
import { getLocale, overwriteGetLocale, setLocale } from '#lib/paraglide/runtime.js';
import type { Workspace } from './workspace.svelte.js';

export interface WorkAtRisk {
	canUndo: boolean;
	canRedo: boolean;
	/** A text field has the focus. Its text is not committed yet. */
	editingText: boolean;
	/** A dialog is open. It can hold a draft. */
	dialogOpen: boolean;
}

/** Returns true when a reload would drop something. */
export function losesWork(risk: WorkAtRisk): boolean {
	return risk.canUndo || risk.canRedo || risk.editingText || risk.dialogOpen;
}

export type PendingLanguage = { kind: 'switch'; locale: Locale } | { kind: 'other-tab' };

export class LanguageReload {
	/** The question that waits for an answer. The dialog shows it. */
	pending = $state<PendingLanguage | null>(null);
	/** The language that this page shows. Paraglide reads the saved language on each call. */
	private readonly shown = getLocale();

	constructor(private readonly ws: Workspace) {}

	private atRisk(): boolean {
		return losesWork({
			canUndo: this.ws.history.canUndo,
			canRedo: this.ws.history.canRedo,
			editingText: isTextEditing(document.activeElement),
			dialogOpen: document.querySelector('[role="dialog"]') !== null
		});
	}

	/** The person chose a language in the menu. */
	choose(locale: Locale): void {
		if (locale === getLocale()) return;
		if (this.atRisk()) this.pending = { kind: 'switch', locale };
		else setLocale(locale);
	}

	/** Another tab saved a new language. */
	changedInOtherTab(): void {
		if (!this.atRisk()) {
			location.reload();
			return;
		}
		// Keep this page in its language until the reload. Later dialogs and sheets use it too.
		overwriteGetLocale(() => this.shown);
		this.pending = { kind: 'other-tab' };
	}

	confirm(): void {
		const pending = this.pending;
		this.pending = null;
		if (pending?.kind === 'switch') setLocale(pending.locale);
		else if (pending) location.reload();
	}

	cancel(): void {
		this.pending = null;
	}
}

const KEY = Symbol('language-reload');

export function setLanguageReload(state: LanguageReload): LanguageReload {
	return setContext(KEY, state);
}

export function getLanguageReload(): LanguageReload {
	return getContext<LanguageReload>(KEY);
}
