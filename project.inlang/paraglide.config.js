import { defineConfig } from '@inlang/paraglide-js';

export default defineConfig({
	outdir: './src/lib/paraglide',
	emitTsDeclarations: true,
	// The app is a static SPA. The UI language is viewer state, so do not use the URL.
	// `custom-navigator` is defined in src/hooks.client.ts. It reads all of navigator.languages.
	strategy: ['localStorage', 'custom-navigator', 'baseLocale'],
	localStorageKey: 'taktblatt:locale'
});
