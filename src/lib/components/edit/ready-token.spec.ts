import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('defines the static ready colour with the other paper tokens', () => {
	const component = readFileSync(new URL('./ReadyDot.svelte', import.meta.url), 'utf8');
	const stylesheet = readFileSync(new URL('../../../routes/layout.css', import.meta.url), 'utf8');
	expect(component).not.toMatch(/#[\da-f]{3,8}\b/i);
	expect(component).toContain('bg-paper-ready');
	expect(stylesheet).toMatch(/--color-paper-ready:\s*#2e9d5b\s*;/i);
});
