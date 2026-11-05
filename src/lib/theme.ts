import { KEYS } from '#lib/state/storage.js';

/** The browser and PWA theme colors for each resolved screen theme. */
export const THEME_COLORS = { light: '#ffffff', dark: '#0e0f13' } as const;

/**
 * The source of the startup script in `src/app.html`. The script applies the saved screen theme
 * before the first paint. The app starts on the client only, so ModeWatcher cannot do this in
 * time. After the start, ModeWatcher keeps the theme current. Blocked storage gives the System
 * theme.
 * Refer to docs/spec.md, section 5.1.
 */
export function initialThemeScript(): string {
	const key = JSON.stringify(KEYS.theme);
	const colors = JSON.stringify(THEME_COLORS);
	return `(function () {
	var saved = null;
	try {
		saved = localStorage.getItem(${key});
	} catch (error) {}
	var dark = saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
	var root = document.documentElement;
	root.classList.toggle('dark', dark);
	root.style.colorScheme = dark ? 'dark' : 'light';
	var meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.content = dark ? ${colors}.dark : ${colors}.light;
})();`;
}
