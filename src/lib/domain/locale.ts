import { getLocale } from '#lib/paraglide/runtime.js';
import { intlLocale } from './format';
import { LOCALES, type Locale } from './schema';

/** Chinese regions that write Traditional Chinese. */
const TRADITIONAL_REGIONS = new Set(['tw', 'hk', 'mo']);

function matchTag(tag: string): Locale | undefined {
	const [language, ...rest] = tag.toLowerCase().split('-');
	if (language === 'zh') {
		// Only Traditional Chinese is supported. Simplified or unspecified Chinese is not matched.
		const script = rest.find((part) => part.length === 4);
		if (script) return script === 'hant' ? 'zh-TW' : undefined;
		return rest.some((part) => TRADITIONAL_REGIONS.has(part)) ? 'zh-TW' : undefined;
	}
	return LOCALES.find((locale) => locale.toLowerCase() === language);
}

/**
 * Picks the first supported language from a list of BCP 47 tags (for example `navigator.languages`).
 * A region or script variant matches its base language: de-AT gives de.
 */
export function matchLocale(languages: readonly string[]): Locale | undefined {
	for (const tag of languages) {
		const match = matchTag(tag);
		if (match) return match;
	}
	return undefined;
}

/** The UI language. It is the only language of the app: it governs the texts, the dates and the print. */
export function uiLocale(): Locale {
	const locale = getLocale();
	return (LOCALES as readonly string[]).includes(locale) ? (locale as Locale) : 'en';
}

/** The UI language as a BCP 47 tag for `Intl` (dates, numbers, sorting). */
export function uiIntl(): string {
	return intlLocale(uiLocale());
}
