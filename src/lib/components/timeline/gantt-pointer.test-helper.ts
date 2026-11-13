import { flushSync } from 'svelte';

/** Send row coordinates to the chart or the element, then apply the hover frame. */
export async function ganttPointer(
	target: Element,
	type: 'pointermove' | 'pointerleave',
	{ dispatchTarget = 'element' }: { dispatchTarget?: 'chart' | 'element' } = {}
) {
	const chart = target.closest('[data-testid="gantt-scroller"]')!.firstElementChild!;
	const destination = type === 'pointerleave' || dispatchTarget === 'chart' ? chart : target;
	const bounds = (type === 'pointermove' ? target : chart).getBoundingClientRect();
	// Dispatch to the chart to keep mark Hints closed.
	destination.dispatchEvent(
		new PointerEvent(type, {
			bubbles: type === 'pointermove',
			clientX: bounds.left + bounds.width / 2,
			clientY: bounds.top + bounds.height / 2,
			pointerType: 'mouse'
		})
	);
	await new Promise(requestAnimationFrame);
	flushSync();
}
