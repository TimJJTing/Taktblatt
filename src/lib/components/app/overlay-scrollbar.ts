import { motionDuration } from '#lib/motion.ts';
import { positionFromThumb, thumbMetrics } from './overlay-scrollbar-geometry.ts';

interface Options {
	axis?: 'x' | 'y' | 'both';
	host?: HTMLElement | null;
	enabled?: boolean;
}

const callbacks = new Map<Element, Set<() => void>>();
let observer: ResizeObserver | undefined;
function observe(element: Element, callback: () => void) {
	observer ??= new ResizeObserver((entries) => {
		for (const entry of entries) for (const update of callbacks.get(entry.target) ?? []) update();
	});
	let listeners = callbacks.get(element);
	if (!listeners) {
		listeners = new Set();
		callbacks.set(element, listeners);
		observer.observe(element);
	}
	listeners.add(callback);
	return () => {
		listeners.delete(callback);
		if (!listeners.size) {
			observer?.unobserve(element);
			callbacks.delete(element);
		}
		if (!callbacks.size) {
			observer?.disconnect();
			observer = undefined;
		}
	};
}

/** Draw scroll controls without changing the native scroll behavior. */
export function overlayScrollbar(node: HTMLElement, options: Options = {}) {
	let cleanup = () => {};
	function setup({ axis = 'y', host = node.parentElement, enabled = true }: Options) {
		cleanup();
		cleanup = () => {};
		if (!enabled || !host) return;
		const container = host;
		const oldPosition = container.style.position;
		const positionHost = getComputedStyle(container).position === 'static';
		if (positionHost) container.style.position = 'relative';
		node.classList.add('overlay-scroll');
		const layer = document.createElement('div');
		layer.dataset.overlayScrollbar = '';
		layer.dataset.visible = 'false';
		layer.setAttribute('aria-hidden', 'true');
		layer.style.cssText = 'position:absolute;pointer-events:none;z-index:35;opacity:0;';
		container.append(layer);
		let timer: ReturnType<typeof setTimeout>;
		let frame = 0;
		let hovering = false;
		let dragging = false;
		let destroyed = false;
		const removers: (() => void)[] = [];
		const controls = new Map<'x' | 'y', HTMLDivElement>();
		const emit = (start: boolean) =>
			node.dispatchEvent(
				new CustomEvent(start ? 'overlayscrollstart' : 'overlayscrollend', { bubbles: true })
			);
		function visibility(visible: boolean) {
			layer.style.transition = `opacity ${motionDuration(150)}ms ease-out`;
			layer.dataset.visible = String(visible);
			layer.style.opacity = visible ? '1' : '0';
			for (const thumb of controls.values()) thumb.style.pointerEvents = visible ? 'auto' : 'none';
		}
		function reveal() {
			visibility(true);
			clearTimeout(timer);
			timer = setTimeout(() => {
				if (!dragging && !hovering) visibility(false);
			}, 800);
		}
		function extent(direction: 'x' | 'y') {
			return direction === 'y'
				? { client: node.clientHeight, scroll: node.scrollHeight, position: node.scrollTop }
				: { client: node.clientWidth, scroll: node.scrollWidth, position: node.scrollLeft };
		}
		function setPosition(direction: 'x' | 'y', value: number) {
			if (direction === 'y') node.scrollTop = value;
			else node.scrollLeft = value;
		}
		function track(direction: 'x' | 'y') {
			const other = direction === 'y' ? 'x' : 'y';
			const corner = controls.get(other)?.parentNode ? 12 : 0;
			return Math.max(0, extent(direction).client - 4 - corner);
		}
		function metrics(direction: 'x' | 'y') {
			return thumbMetrics({ ...extent(direction), track: track(direction), min: 24 });
		}
		for (const direction of ['y', 'x'] as const) {
			if (axis !== 'both' && axis !== direction) continue;
			const thumb = document.createElement('div');
			thumb.dataset.overlayThumb = direction;
			thumb.dataset.active = 'false';
			thumb.style.cssText = `position:absolute;border-radius:999px;touch-action:none;${direction === 'y' ? 'right:2px;width:6px;' : 'bottom:2px;height:6px;'}`;
			controls.set(direction, thumb);
			const activeStyle = (active: boolean) => {
				thumb.style.transition = `${direction === 'y' ? 'width' : 'height'} ${motionDuration(150)}ms ease-out, background-color ${motionDuration(150)}ms ease-out`;
				thumb.style[direction === 'y' ? 'width' : 'height'] = active ? '10px' : '6px';
				thumb.style.backgroundColor = `color-mix(in srgb, var(--foreground) ${active ? 40 : 25}%, transparent)`;
			};
			activeStyle(false);
			thumb.onpointerenter = () => {
				hovering = true;
				activeStyle(true);
				reveal();
			};
			thumb.onpointerleave = () => {
				hovering = false;
				if (!dragging) activeStyle(false);
				reveal();
			};
			let drag: { id: number; start: number; offset: number } | undefined;
			const coordinate = (event: PointerEvent) =>
				direction === 'y' ? event.clientY : event.clientX;
			const finish = (event?: PointerEvent) => {
				if (!drag || (event && event.pointerId !== drag.id)) return;
				const id = drag.id;
				drag = undefined;
				dragging = false;
				thumb.dataset.active = 'false';
				if (thumb.hasPointerCapture(id)) thumb.releasePointerCapture(id);
				activeStyle(hovering);
				emit(false);
				reveal();
			};
			thumb.onpointerdown = (event) => {
				if (event.button !== 0 || dragging || layer.dataset.visible !== 'true') return;
				const value = metrics(direction);
				if (!value) return;
				event.preventDefault();
				event.stopPropagation();
				drag = { id: event.pointerId, start: coordinate(event), offset: value.offset };
				dragging = true;
				thumb.dataset.active = 'true';
				thumb.setPointerCapture(event.pointerId);
				activeStyle(true);
				emit(true);
				reveal();
			};
			thumb.onpointermove = (event) => {
				if (!drag || event.pointerId !== drag.id) return;
				const value = metrics(direction);
				if (!value) return;
				setPosition(
					direction,
					positionFromThumb({
						...extent(direction),
						track: track(direction),
						size: value.size,
						offset: drag.offset + coordinate(event) - drag.start
					})
				);
				update();
			};
			thumb.onpointerup = finish;
			thumb.onpointercancel = finish;
			thumb.onlostpointercapture = finish;
			removers.push(() => finish());
		}
		function update() {
			if (destroyed) return;
			// A layer inside its scroller must not preserve an old scroll range after content shrinks.
			if (container === node) layer.style.display = 'none';
			const rect = node.getBoundingClientRect();
			const bounds = container.getBoundingClientRect();
			Object.assign(layer.style, {
				left: `${rect.left - bounds.left - container.clientLeft + container.scrollLeft + node.clientLeft}px`,
				top: `${rect.top - bounds.top - container.clientTop + container.scrollTop + node.clientTop}px`,
				width: `${node.clientWidth}px`,
				height: `${node.clientHeight}px`
			});
			for (const [direction, thumb] of controls) {
				const overflow =
					extent(direction).scroll > extent(direction).client && extent(direction).client > 0;
				if (overflow && !thumb.parentNode) layer.append(thumb);
				else if (!overflow) thumb.remove();
			}
			for (const [direction, thumb] of controls) {
				const value = metrics(direction);
				if (!value) continue;
				thumb.style[direction === 'y' ? 'height' : 'width'] = `${value.size}px`;
				thumb.style[direction === 'y' ? 'top' : 'left'] = `${value.offset + 2}px`;
				thumb.style.pointerEvents = layer.dataset.visible === 'true' ? 'auto' : 'none';
			}
			if (container === node) layer.style.removeProperty('display');
		}
		function schedule() {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(update);
		}
		const scroll = () => {
			update();
			reveal();
		};
		const pointer = (event: PointerEvent) => {
			if (event.target instanceof Node && layer.contains(event.target)) event.stopPropagation();
			if (
				event.pointerType === 'mouse' &&
				event.target instanceof Element &&
				(layer.contains(event.target) || event.target.closest('.overlay-scroll') === node)
			) {
				update();
				reveal();
			}
		};
		const wheel = (event: WheelEvent) => {
			// Forward wheel input over a sibling thumb to its scroller because the layer is outside it.
			if (node.contains(layer) || event.ctrlKey || event.defaultPrevented) return;
			const line = parseFloat(getComputedStyle(node).lineHeight) || 16;
			const scaleX = event.deltaMode === 1 ? line : event.deltaMode === 2 ? node.clientWidth : 1;
			const scaleY = event.deltaMode === 1 ? line : event.deltaMode === 2 ? node.clientHeight : 1;
			const horizontal = event.shiftKey && event.deltaX === 0;
			const x = (horizontal ? event.deltaY : event.deltaX) * scaleX;
			const y = horizontal ? 0 : event.deltaY * scaleY;
			const movesX =
				(x < 0 && node.scrollLeft > 0) ||
				(x > 0 && node.scrollLeft < node.scrollWidth - node.clientWidth);
			const movesY =
				(y < 0 && node.scrollTop > 0) ||
				(y > 0 && node.scrollTop < node.scrollHeight - node.clientHeight);
			if (!movesX && !movesY) return;
			event.preventDefault();
			emit(true);
			node.scrollBy({ left: x, top: y, behavior: 'instant' });
			emit(false);
		};
		layer.addEventListener('wheel', wheel, { passive: false });
		node.addEventListener('scroll', scroll, { passive: true });
		node.addEventListener('pointermove', pointer);
		layer.addEventListener('pointermove', pointer);
		container.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', schedule);
		// Ancestor scrolling moves layers whose hosts are outside the scroll area.
		document.addEventListener('scroll', schedule, true);
		const unobserve = [observe(node, schedule), observe(container, schedule)];
		const children = new Map<Element, () => void>();
		function reconcileChildren() {
			for (const [child, stop] of children) {
				if (child.parentElement !== node) {
					stop();
					children.delete(child);
				}
			}
			for (const child of node.children) {
				if (child !== layer && !children.has(child)) children.set(child, observe(child, schedule));
			}
			schedule();
		}
		const contentObserver = new MutationObserver(reconcileChildren);
		contentObserver.observe(node, { childList: true });
		reconcileChildren();
		update();
		cleanup = () => {
			for (const remove of removers) remove();
			destroyed = true;
			clearTimeout(timer);
			cancelAnimationFrame(frame);
			contentObserver.disconnect();
			for (const stop of children.values()) stop();
			children.clear();
			for (const stop of unobserve) stop();
			node.removeEventListener('scroll', scroll);
			node.removeEventListener('pointermove', pointer);
			layer.removeEventListener('pointermove', pointer);
			layer.removeEventListener('wheel', wheel);
			container.removeEventListener('scroll', schedule);
			window.removeEventListener('resize', schedule);
			document.removeEventListener('scroll', schedule, true);
			layer.remove();
			node.classList.remove('overlay-scroll');
			if (positionHost) container.style.position = oldPosition;
		};
	}
	setup(options);
	return { update: setup, destroy: () => cleanup() };
}

/** Keep controls inside a popover or dialog to preserve its outside-press boundary. */
export function overlayScrollbarInside(node: HTMLElement) {
	return overlayScrollbar(node, { host: node }).destroy;
}
