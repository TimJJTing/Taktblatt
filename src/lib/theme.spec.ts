import { describe, expect, it } from 'vitest';
import { KEYS } from '#lib/state/storage.js';
import { initialThemeScript, THEME_COLORS } from './theme.js';

interface Run {
	stored?: string | null;
	systemDark?: boolean;
	storageFails?: boolean;
}

/** Runs the startup script against a fake page and gives the result. */
function run({ stored = null, systemDark = false, storageFails = false }: Run) {
	const items = new Map<string, string>();
	if (stored !== null) items.set(KEYS.theme, stored);
	const localStorage = {
		getItem(key: string) {
			if (storageFails) throw new Error('blocked');
			return items.get(key) ?? null;
		}
	};
	const classes = new Set<string>();
	const root = {
		classList: {
			toggle: (name: string, force: boolean) => (force ? classes.add(name) : classes.delete(name))
		},
		style: { colorScheme: '' }
	};
	const meta = { content: THEME_COLORS.light };
	const document = {
		documentElement: root,
		querySelector: (selector: string) => (selector === 'meta[name="theme-color"]' ? meta : null)
	};
	const matchMedia = (query: string) => ({
		matches: query === '(prefers-color-scheme: dark)' && systemDark
	});
	new Function('localStorage', 'document', 'matchMedia', initialThemeScript())(
		localStorage,
		document,
		matchMedia
	);
	return {
		dark: classes.has('dark'),
		colorScheme: root.style.colorScheme,
		themeColor: meta.content
	};
}

describe('initialThemeScript', () => {
	it('applies a saved dark theme on a light system', () => {
		expect(run({ stored: 'dark' })).toMatchObject({
			dark: true,
			colorScheme: 'dark',
			themeColor: THEME_COLORS.dark
		});
	});

	it('applies a saved light theme on a dark system', () => {
		expect(run({ stored: 'light', systemDark: true })).toMatchObject({
			dark: false,
			colorScheme: 'light',
			themeColor: THEME_COLORS.light
		});
	});

	it('follows the system for System, a missing value and an invalid value', () => {
		for (const stored of ['system', null, 'invalid']) {
			expect(run({ stored, systemDark: true })).toMatchObject({
				dark: true,
				themeColor: THEME_COLORS.dark
			});
			expect(run({ stored, systemDark: false })).toMatchObject({
				dark: false,
				themeColor: THEME_COLORS.light
			});
		}
	});

	it('follows the system when the browser blocks storage', () => {
		expect(run({ storageFails: true, systemDark: true })).toMatchObject({
			dark: true,
			colorScheme: 'dark',
			themeColor: THEME_COLORS.dark
		});
	});
});
