import { matchLocale } from '#lib/domain/locale.js';
import { defineCustomClientStrategy } from '#lib/paraglide/runtime.js';

// The first UI language is the first supported language of the browser. Paraglide's own
// `preferredLanguage` strategy does not know zh-Hant-TW or zh-HK. The language menu saves
// the choice, so this strategy has nothing to write.
defineCustomClientStrategy('custom-navigator', {
	getLocale: () => matchLocale(navigator.languages),
	setLocale: () => {}
});
