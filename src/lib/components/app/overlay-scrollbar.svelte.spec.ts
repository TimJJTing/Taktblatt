import { describe, expect, it, vi } from 'vitest';
import { overlayScrollbar } from './overlay-scrollbar.ts';

function scrollArea(selfHosted = false) {
	const host = document.createElement('div');
	const node = document.createElement('div');
	const content = document.createElement('div');
	host.style.cssText = 'position:relative;width:200px;height:200px;';
	node.style.cssText = 'width:100%;height:100%;overflow:auto;scrollbar-width:none;';
	content.style.height = '1000px';
	node.append(content);
	host.append(node);
	document.body.append(host);
	const action = overlayScrollbar(node, { host: selfHosted ? node : host });
	const layer = host.querySelector<HTMLElement>('[data-overlay-scrollbar]')!;
	const thumb = layer.querySelector<HTMLElement>('[data-overlay-thumb="y"]')!;
	return {
		host,
		node,
		content,
		action,
		layer,
		thumb,
		destroy: () => {
			action.destroy();
			host.remove();
		}
	};
}

const moveMouse = (node: HTMLElement) =>
	node.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', bubbles: true }));

describe('overlay scrollbar press rule', () => {
	it('lets only the visible thumb take presses', () => {
		const area = scrollArea();
		try {
			expect(getComputedStyle(area.thumb).pointerEvents).toBe('none');
			moveMouse(area.node);
			expect(area.layer.dataset.visible).toBe('true');
			expect(getComputedStyle(area.thumb).pointerEvents).toBe('auto');
			expect(getComputedStyle(area.layer).pointerEvents).toBe('none');
		} finally {
			area.destroy();
		}
	});

	it('stops taking presses when the thumb hides', () => {
		vi.useFakeTimers();
		const area = scrollArea();
		try {
			moveMouse(area.node);
			vi.advanceTimersByTime(799);
			expect(area.layer.dataset.visible).toBe('true');
			expect(getComputedStyle(area.thumb).pointerEvents).toBe('auto');
			vi.advanceTimersByTime(1);
			expect(area.layer.dataset.visible).toBe('false');
			expect(getComputedStyle(area.thumb).pointerEvents).toBe('none');
		} finally {
			area.destroy();
			vi.useRealTimers();
		}
	});
});

describe('overlay scrollbar lifecycle', () => {
	it('removes the layer and stops reveals after destroy', () => {
		vi.useFakeTimers();
		const area = scrollArea();
		const errors = vi.fn();
		window.addEventListener('error', errors);
		try {
			area.action.destroy();
			const removedLayer = area.layer.outerHTML;
			expect(area.host.querySelector('[data-overlay-scrollbar]')).toBeNull();
			expect(area.node.classList.contains('overlay-scroll')).toBe(false);
			expect(() => {
				area.node.scrollTop = 100;
				area.node.dispatchEvent(new Event('scroll'));
				moveMouse(area.node);
				vi.advanceTimersByTime(1000);
			}).not.toThrow();
			expect(area.layer.outerHTML).toBe(removedLayer);
			expect(area.host.querySelector('[data-overlay-scrollbar]')).toBeNull();
			expect(errors).not.toHaveBeenCalled();
		} finally {
			area.host.remove();
			window.removeEventListener('error', errors);
			vi.useRealTimers();
		}
	});

	it('keeps exactly one layer when the axis or host changes', () => {
		const area = scrollArea();
		const newHost = document.createElement('div');
		area.host.append(newHost);
		area.content.style.width = '1000px';
		try {
			area.action.update({ host: area.host, axis: 'both' });
			expect(area.host.querySelectorAll('[data-overlay-scrollbar]')).toHaveLength(1);
			expect(area.layer.isConnected).toBe(false);
			expect(area.host.querySelectorAll('[data-overlay-thumb]')).toHaveLength(2);
			const previousLayer = area.host.querySelector('[data-overlay-scrollbar]')!;
			area.action.update({ host: newHost, axis: 'x' });
			expect(area.host.querySelectorAll('[data-overlay-scrollbar]')).toHaveLength(1);
			expect(previousLayer.isConnected).toBe(false);
			expect(newHost.querySelectorAll('[data-overlay-scrollbar]')).toHaveLength(1);
			expect(newHost.querySelector('[data-overlay-thumb="x"]')).not.toBeNull();
			expect(newHost.querySelector('[data-overlay-thumb="y"]')).toBeNull();
		} finally {
			area.destroy();
		}
	});

	it.each(['pointercancel', 'lostpointercapture', 'destroy'] as const)(
		'pairs drag events and ends once on %s',
		(ending) => {
			const area = scrollArea();
			const events: string[] = [];
			const record = (event: Event) => events.push(event.type);
			area.node.addEventListener('overlayscrollstart', record);
			area.node.addEventListener('overlayscrollend', record);
			let captured = false;
			vi.spyOn(area.thumb, 'setPointerCapture').mockImplementation(() => {
				captured = true;
			});
			vi.spyOn(area.thumb, 'hasPointerCapture').mockImplementation(() => captured);
			vi.spyOn(area.thumb, 'releasePointerCapture').mockImplementation((pointerId) => {
				captured = false;
				area.thumb.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId }));
			});
			try {
				moveMouse(area.node);
				area.thumb.dispatchEvent(
					new PointerEvent('pointerdown', { pointerId: 7, button: 0, clientY: 10 })
				);
				expect(events).toEqual(['overlayscrollstart']);
				expect(area.thumb.dataset.active).toBe('true');
				if (ending === 'destroy') area.action.destroy();
				else area.thumb.dispatchEvent(new PointerEvent(ending, { pointerId: 7 }));
				expect(events).toEqual(['overlayscrollstart', 'overlayscrollend']);
				expect(area.thumb.dataset.active).toBe('false');
				for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
					area.thumb.dispatchEvent(new PointerEvent(type, { pointerId: 7 }));
				expect(events).toEqual(['overlayscrollstart', 'overlayscrollend']);
			} finally {
				if (ending === 'destroy') area.host.remove();
				else area.destroy();
				vi.restoreAllMocks();
			}
		}
	);

	it('keeps a self-hosted thumb inside the visible box after scrolling', () => {
		const area = scrollArea(true);
		try {
			area.node.scrollTop = 500;
			area.node.dispatchEvent(new Event('scroll'));
			const box = area.node.getBoundingClientRect();
			const thumb = area.thumb.getBoundingClientRect();
			expect(area.node.scrollTop).toBe(500);
			expect(thumb.top).toBeGreaterThanOrEqual(box.top);
			expect(thumb.bottom).toBeLessThanOrEqual(box.bottom);
			expect(thumb.left).toBeGreaterThanOrEqual(box.left);
			expect(thumb.right).toBeLessThanOrEqual(box.right);
		} finally {
			area.destroy();
		}
	});

	it('updates thumb geometry when replacement content resizes', async () => {
		const area = scrollArea();
		try {
			const replacement = document.createElement('div');
			replacement.style.height = '1000px';
			area.content.replaceWith(replacement);
			// Wait for child observation before changing the replacement size.
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			);
			const originalHeight = area.thumb.getBoundingClientRect().height;
			replacement.style.height = '2000px';
			await vi.waitFor(() => {
				expect(area.thumb.getBoundingClientRect().height).toBeLessThan(originalHeight);
			});
		} finally {
			area.destroy();
		}
	});
});
