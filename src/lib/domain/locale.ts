/** The supported languages. A spec checks that they match the Paraglide locales. */
export const LOCALES = ['en', 'de', 'zh-TW', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

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
