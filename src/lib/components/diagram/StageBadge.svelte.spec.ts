import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StageBadge from './StageBadge.svelte';

describe('StageBadge', () => {
	afterEach(() => {
		document.documentElement.style.removeProperty('color-scheme');
	});

	it('shows the supplied stage label and uses the stage fill and badge text in both themes', async () => {
		const screen = await render(StageBadge, { color: 'blue', label: 'S2' });
		const badge = screen.getByText('S2');
		await expect.element(badge).toBeVisible();
		const element = badge.element();
		document.documentElement.style.colorScheme = 'light';
		await expect
			.poll(() => {
				const style = getComputedStyle(element);
				return { fill: style.backgroundColor, text: style.color };
			})
			.toEqual({ fill: 'rgb(36, 86, 201)', text: 'rgb(255, 255, 255)' });

		document.documentElement.style.colorScheme = 'dark';
		await expect
			.poll(() => {
				const style = getComputedStyle(element);
				return { fill: style.backgroundColor, text: style.color };
			})
			.toEqual({ fill: 'rgb(110, 151, 236)', text: 'rgb(19, 22, 26)' });
	});

	it('keeps the paper badge light and still in a dark screen theme', async () => {
		document.documentElement.style.colorScheme = 'dark';
		const screen = await render(StageBadge, { color: 'red', label: 'S3', still: true });
		const badge = screen.getByText('S3').element();
		expect(getComputedStyle(badge).backgroundColor).toBe('rgb(200, 53, 45)');
		expect(getComputedStyle(badge).color).toBe('rgb(255, 255, 255)');
		expect(badge.getAnimations({ subtree: true })).toHaveLength(0);
	});
});
