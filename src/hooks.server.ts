import type { Handle } from '@sveltejs/kit/hooks';
import { initialThemeScript } from '#lib/theme.ts';

// The build prerenders the page shell. This hook puts the theme startup script into it.
const themeScript = initialThemeScript();

export const handle: Handle = ({ event, resolve }) =>
	resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%taktblatt.theme%', themeScript)
	});
