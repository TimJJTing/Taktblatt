import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import '../../../routes/layout.css';
import ExpandToggle from './ExpandToggle.svelte';

const motion = vi.hoisted(() => ({ reduced: false, calls: [] as number[] }));
vi.mock('#lib/motion.ts', async (original) => ({
	...(await original<typeof import('#lib/motion.ts')>()),
	motionDuration: (ms: number) => {
		motion.calls.push(ms);
		return motion.reduced ? 0 : ms;
	}
}));

async function tabFromStart(container: Element) {
	const start = document.createElement('button');
	start.type = 'button';
	container.prepend(start);
	start.focus();
	try {
		await userEvent.tab();
	} finally {
		start.remove();
	}
}

describe('ExpandToggle', () => {
	afterEach(() => {
		motion.reduced = false;
		motion.calls = [];
	});

	it('names the native button and exposes its expanded state', async () => {
		const screen = await render(ExpandToggle, {
			expanded: false,
			task: 'Soil',
			onToggle: () => {},
			testid: 'toggle'
		});
		const button = screen.getByRole('button', { name: 'Expand Soil' });
		await expect.element(button).toHaveAttribute('aria-expanded', 'false');
		expect(button.element().tagName).toBe('BUTTON');
		await screen.rerender({ expanded: true, task: 'Soil', onToggle: () => {}, testid: 'toggle' });
		await expect
			.element(screen.getByRole('button', { name: 'Collapse Soil' }))
			.toHaveAttribute('aria-expanded', 'true');
	});

	it('passes keyboard activations once each and keeps focus', async () => {
		const onToggle = vi.fn<(event: MouseEvent) => void>();
		const screen = await render(ExpandToggle, {
			expanded: false,
			task: 'Soil',
			onToggle,
			testid: 'toggle'
		});
		const button = screen.getByRole('button', { name: 'Expand Soil' });
		await tabFromStart(screen.container);
		await expect.element(button).toHaveFocus();
		for (const key of ['{Enter}', ' ']) {
			await userEvent.keyboard(key);
			await expect.element(button).toHaveFocus();
		}
		expect(onToggle).toHaveBeenCalledTimes(2);
		for (const [event] of onToggle.mock.calls) {
			expect(event).toBeInstanceOf(MouseEvent);
			expect(event.detail).toBe(0);
		}
	});

	it('passes pointer clicks without blurring the button', async () => {
		const onToggle = vi.fn<(event: MouseEvent) => void>();
		const screen = await render(ExpandToggle, {
			expanded: false,
			task: 'Soil',
			onToggle,
			testid: 'toggle'
		});
		const button = screen.getByRole('button', { name: 'Expand Soil' });
		await button.click();
		expect(onToggle).toHaveBeenCalledOnce();
		expect(onToggle.mock.calls[0][0]).toBeInstanceOf(MouseEvent);
		expect(onToggle.mock.calls[0][0].detail).toBeGreaterThan(0);
		await expect.element(button).toHaveFocus();
	});

	it('forwards controls, test id and other button attributes', async () => {
		const props = {
			expanded: false,
			task: 'Soil',
			onToggle: () => {},
			testid: 'custom-toggle',
			'data-example': 'forwarded'
		};
		const screen = await render(ExpandToggle, props);
		const button = screen.getByTestId('custom-toggle');
		await expect.element(button).toHaveAttribute('data-example', 'forwarded');
		expect(button.element().hasAttribute('aria-controls')).toBe(false);
		await screen.rerender({ ...props, controls: 'children' });
		await expect.element(button).toHaveAttribute('aria-controls', 'children');
	});

	it('renders a 20 pixel button and a target of at least 24 pixels when large', async () => {
		const props = { expanded: false, task: 'Soil', onToggle: () => {}, testid: 'toggle' };
		const screen = await render(ExpandToggle, props);
		const button = screen.getByTestId('toggle');
		await expect.element(button).toBeVisible();
		let box = button.element().getBoundingClientRect();
		expect(box.width).toBe(20);
		expect(box.height).toBe(20);
		await screen.rerender({ ...props, large: true });
		box = button.element().getBoundingClientRect();
		expect(box.width).toBeGreaterThanOrEqual(24);
		expect(box.height).toBeGreaterThanOrEqual(24);
	});

	it('shows an outline after keyboard focus', async () => {
		const screen = await render(ExpandToggle, {
			expanded: false,
			task: 'Soil',
			onToggle: () => {},
			testid: 'toggle'
		});
		const button = screen.getByRole('button', { name: 'Expand Soil' });
		await tabFromStart(screen.container);
		await expect.element(button).toHaveFocus();
		const style = getComputedStyle(button.element());
		expect(style.outlineStyle).not.toBe('none');
		expect(style.outlineStyle).not.toBe('auto');
		expect(parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(2);
	});

	it('uses a zero-duration 200 ms chevron turn with reduced motion', async () => {
		motion.reduced = true;
		const screen = await render(ExpandToggle, {
			expanded: true,
			task: 'Soil',
			onToggle: () => {},
			testid: 'toggle'
		});
		const button = screen.getByRole('button', { name: 'Collapse Soil' });
		await expect.element(button).toBeVisible();
		const chevron = button.element().querySelector('svg');
		expect(chevron).not.toBeNull();
		expect(motion.calls).toContain(200);
		expect(getComputedStyle(chevron!.parentElement!).transitionDuration).toBe('0s');
	});
});
