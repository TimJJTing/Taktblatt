import { matchLocale } from '#lib/domain/locale.ts';
import { defineCustomClientStrategy } from '#lib/paraglide/runtime.js';

// The first UI language is the first supported language of the browser. Paraglide's own
// `preferredLanguage` strategy does not know zh-Hant-TW or zh-HK. On the first getLocale(),
// Paraglide saves the language it found, so a later change of the browser language has no
// effect. The language menu saves later choices, so this strategy has nothing to write.
defineCustomClientStrategy('custom-navigator', {
	getLocale: () =>
		matchLocale(navigator.languages?.length ? navigator.languages : [navigator.language]),
	setLocale: () => {}
});
