import { describe, expect, it } from 'vitest';
import TriangleIcon from '@lucide/svelte/icons/triangle';
import SquareIcon from '@lucide/svelte/icons/square';
import HexagonIcon from '@lucide/svelte/icons/hexagon';
import PentagonIcon from '@lucide/svelte/icons/pentagon';
import BookmarkIcon from '@lucide/svelte/icons/bookmark';
import HeartIcon from '@lucide/svelte/icons/heart';
import { MILESTONE_SYMBOLS as symbolKeys } from '#lib/domain/schema.ts';
import FilledMapPin from './FilledMapPin.svelte';
import { MILESTONE_SYMBOLS as icons } from './milestone-symbols.ts';

describe('milestone symbol icons', () => {
	it.each(symbolKeys)('has an icon for the schema key %s', (symbol) => {
		expect(icons[symbol]).toBeDefined();
	});

	it.each([
		['triangle', TriangleIcon],
		['square', SquareIcon],
		['hexagon', HexagonIcon],
		['pentagon', PentagonIcon],
		['bookmark', BookmarkIcon],
		['heart', HeartIcon]
	] as const)('maps %s to the specified Lucide component', (symbol, component) => {
		expect((icons as Record<string, unknown>)[symbol]).toBe(component);
	});

	// Lucide's map pin loses its centre when filled, so the pin uses its own filled shape.
	it('maps pin to the filled map pin with a hole', () => {
		expect(icons.pin).toBe(FilledMapPin);
	});
});
