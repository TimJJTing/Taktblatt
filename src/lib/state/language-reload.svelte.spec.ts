import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLocale, overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import { LanguageReload, losesWork } from './language-reload.svelte.ts';
import type { Workspace } from './workspace.svelte.ts';

const none = { canUndo: false, canRedo: false, dialogOpen: false };

describe('losesWork', () => {
	it('is false when nothing would be dropped', () => {
		expect(losesWork(none)).toBe(false);
	});

	it.each(['canUndo', 'canRedo', 'dialogOpen'] as const)('is true for %s', (key) => {
		expect(losesWork({ ...none, [key]: true })).toBe(true);
	});
});

describe('LanguageReload', () => {
	const original = getLocale;
	const cleanup: Element[] = [];
	afterEach(() => {
		localStorage.removeItem('taktblatt:locale');
		overwriteGetLocale(original);
		cleanup.splice(0).forEach((el) => el.remove());
	});

	function setup(history = { canUndo: false, canRedo: false }, preview = { open: false }) {
		const env = { reload: vi.fn(), setLocale: vi.fn() };
		const reload = new LanguageReload({ history } as unknown as Workspace, preview, env);
		const shown = getLocale();
		const other: Locale = shown === 'de' ? 'en' : 'de';
		return { reload, env, history, preview, shown, other };
	}

	const addToPage = <T extends Element>(el: T): T => {
		document.body.append(el);
		cleanup.push(el);
		return el;
	};

	it('pins the shown language, whatever another tab saves', () => {
		const { shown, other } = setup();
		localStorage.setItem('taktblatt:locale', other);
		expect(getLocale()).toBe(shown);
		localStorage.setItem('taktblatt:locale', shown);
	});

	describe('a choice in the menu', () => {
		it('switches at once when nothing would be dropped', () => {
			const { reload, env, other } = setup();
			reload.choose(other);
			expect(env.setLocale).toHaveBeenCalledWith(other);
			expect(reload.open).toBe(false);
		});

		it('asks first when there is history, then confirm switches', () => {
			const { reload, env, other } = setup({ canUndo: true, canRedo: false });
			reload.choose(other);
			expect(reload.open).toBe(true);
			expect(reload.kind).toBe('switch');
			expect(env.setLocale).not.toHaveBeenCalled();
			reload.confirm();
			expect(env.setLocale).toHaveBeenCalledWith(other);
			expect(reload.open).toBe(false);
		});

		it('keeps everything on cancel and keeps the wording while it closes', () => {
			const { reload, env, other } = setup({ canUndo: false, canRedo: true });
			reload.choose(other);
			reload.cancel();
			expect(reload.open).toBe(false);
			expect(reload.kind).toBe('switch');
			expect(env.setLocale).not.toHaveBeenCalled();
		});

		it('saves the shown language again without a question', () => {
			const { reload, env, shown } = setup({ canUndo: true, canRedo: false });
			reload.choose(shown);
			expect(env.setLocale).toHaveBeenCalledWith(shown);
			expect(reload.open).toBe(false);
		});

		it('asks when a dialog is open, but not for the print preview', () => {
			const { reload, env, other } = setup();
			addToPage(document.createElement('div')).setAttribute('role', 'dialog');
			reload.choose(other);
			expect(reload.open).toBe(true);
			reload.cancel();
			const preview = setup(undefined, { open: true });
			preview.reload.choose(preview.other);
			expect(preview.reload.open).toBe(false);
			expect(env.setLocale).not.toHaveBeenCalled();
			expect(preview.env.setLocale).toHaveBeenCalled();
		});
	});

	describe('a change in another tab', () => {
		it('reloads at once when nothing would be dropped', () => {
			const { reload, env, other } = setup();
			reload.changedInOtherTab(other);
			expect(env.reload).toHaveBeenCalled();
			expect(reload.open).toBe(false);
		});

		it('asks when there is history; confirm reloads, cancel does not', () => {
			const { reload, env, other } = setup({ canUndo: true, canRedo: false });
			reload.changedInOtherTab(other);
			expect(reload.open).toBe(true);
			expect(reload.kind).toBe('other-tab');
			reload.cancel();
			expect(env.reload).not.toHaveBeenCalled();
			reload.changedInOtherTab(other);
			reload.confirm();
			expect(env.reload).toHaveBeenCalledTimes(1);
		});

		it('closes the question when the other tab restores the language or removes the key', () => {
			const { reload, env, shown, other } = setup({ canUndo: true, canRedo: false });
			reload.changedInOtherTab(other);
			reload.changedInOtherTab(shown);
			expect(reload.open).toBe(false);

			reload.changedInOtherTab(other);
			expect(reload.open).toBe(true);
			reload.changedInOtherTab(null);
			expect(reload.open).toBe(false);
			expect(env.reload).not.toHaveBeenCalled();
		});

		it('does not reload for the shown language or a removed key', () => {
			const { reload, env, shown } = setup();
			reload.changedInOtherTab(shown);
			reload.changedInOtherTab(null);
			expect(env.reload).not.toHaveBeenCalled();
		});

		it('commits a text field first, then looks at the history', () => {
			const { reload, history, other } = setup();
			const input = addToPage(document.createElement('input'));
			input.addEventListener('blur', () => (history.canUndo = true));
			input.focus();
			reload.changedInOtherTab(other);
			expect(reload.open).toBe(true);
		});
	});
});
