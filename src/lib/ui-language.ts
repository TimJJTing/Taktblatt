import { intlLocale } from '#lib/domain/format.js';
import { getLocale } from '#lib/paraglide/runtime.js';

/**
 * The UI language as a BCP 47 tag for `Intl` (dates, numbers, sorting).
 * It is the only language of the app: it governs the texts, the dates and the print.
 * A change of the UI language reloads the page, so the result needs no reactive state.
 */
export function uiIntl(): string {
	return intlLocale(getLocale());
}
