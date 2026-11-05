/**
 * The Paraglide options. The Vite plugin and `scripts/i18n.mjs` both read them.
 * The `paraglide-js compile` command cannot set `localStorageKey`, so the script uses the API.
 */
/** @type {import("@inlang/paraglide-js").CompilerOptions & { strategy: any }} */
export const paraglideOptions = {
	project: './project.inlang',
	outdir: './src/lib/paraglide',
	emitTsDeclarations: true,
	// The app is a static SPA. The UI language is viewer state, so do not use the URL.
	// `custom-navigator` is defined in src/hooks.client.ts. It reads all of navigator.languages.
	strategy: ['localStorage', 'custom-navigator', 'baseLocale'],
	localStorageKey: 'taktblatt:locale'
};
