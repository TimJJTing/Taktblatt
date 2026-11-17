<!-- A modal scope menu. The heading stays visible above the scrollable actions. -->
<script lang="ts">
	import { overlayScrollbar } from '#lib/components/app/overlay-scrollbar.ts';
	import { onDestroy, untrack, type Snippet } from 'svelte';
	import { DRAG_START_PX, suppressNextClick } from '#lib/browser/drag-click.ts';
	import * as Sheet from '#lib/components/ui/sheet/index.ts';
	import { motionDuration } from '#lib/motion.ts';
	import {
		SHEET_MAX_LIFT,
		SHEET_VELOCITY_WINDOW_MS,
		sheetDragOffset,
		sheetDragVelocity,
		shouldCloseSheet
	} from './sheet-drag.ts';

	let {
		open = $bindable(false),
		title,
		subtitle,
		testId,
		trigger,
		handoff = false,
		onOpenChangeComplete,
		ref = $bindable(null),
		children
	}: {
		open?: boolean;
		title: string;
		subtitle?: string;
		testId: string;
		trigger: HTMLButtonElement | null;
		handoff?: boolean;
		onOpenChangeComplete: (open: boolean) => void;
		ref?: HTMLDivElement | null;
		children: Snippet;
	} = $props();

	let session = $state(0);
	let wasOpen = false;
	let scrollArea = $state<HTMLDivElement | null>(null);
	let offset = $state(0);
	let dragging = $state(false);
	let holding = $state(false);
	let sheetHeight = $state(1);
	let candidate: {
		id: number;
		touch: boolean;
		x: number;
		y: number;
		inContent: boolean;
		offset: number;
		samples: { y: number; time: number }[];
	} | null = null;
	const scrimOpacity = $derived(Math.max(0, 1 - Math.max(0, offset) / sheetHeight));
	const duration = $derived(motionDuration(180));
	// The global reduced-motion rule keeps a 0.01 ms transition. Use none, so the move is immediate.
	const settle = (property: string) =>
		holding || !open || duration === 0 ? 'none' : `${property} ${duration}ms ease-out`;

	/** The current position, also during a return transition. */
	const renderedOffset = () => (ref ? new DOMMatrix(getComputedStyle(ref).transform).m42 : 0);

	$effect.pre(() => {
		// An interrupted exit needs fresh modal layers, even while the old sheet is mounted.
		if (open && !wasOpen)
			untrack(() => {
				session += 1;
				offset = 0;
				dragging = false;
				holding = false;
				candidate = null;
			});
		if (!open)
			untrack(() => {
				// A close during a return starts the exit from the current position.
				if (wasOpen) offset = renderedOffset();
				candidate = null;
				dragging = false;
				holding = false;
			});
		wasOpen = open;
	});

	let clearSuppression = () => {};
	onDestroy(() => clearSuppression());
	function pointerDown(event: PointerEvent) {
		if (!open || candidate || !event.isPrimary || event.button !== 0) return;
		const target = event.target;
		if (
			!(target instanceof Element) ||
			target.closest(
				'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="combobox"], [role="listbox"], [data-overlay-scrollbar]'
			)
		)
			return;
		clearSuppression();
		sheetHeight = ref?.getBoundingClientRect().height ?? 1;
		// Stop a return at its current position before the next gesture.
		offset = renderedOffset();
		holding = true;
		candidate = {
			id: event.pointerId,
			touch: event.pointerType === 'touch',
			x: event.clientX,
			y: event.clientY,
			inContent: scrollArea?.contains(target) ?? false,
			offset,
			samples: [{ y: event.clientY, time: event.timeStamp }]
		};
	}

	function move(x: number, y: number, time: number) {
		if (!candidate || !open) return;
		const dx = x - candidate.x;
		const dy = y - candidate.y;
		if (!dragging) {
			if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_START_PX) return;
			if (
				Math.abs(dy) <= Math.abs(dx) ||
				(candidate.inContent && (dy <= 0 || (scrollArea?.scrollTop ?? 0) > 0))
			) {
				candidate = null;
				holding = false;
				offset = 0;
				return;
			}
			dragging = true;
			ref?.setPointerCapture(candidate.id);
		}
		offset = Math.max(-SHEET_MAX_LIFT, candidate.offset + sheetDragOffset(dy));
		candidate.samples.push({ y, time });
		// Keep one sample before the velocity window.
		while (
			candidate.samples.length > 2 &&
			candidate.samples[1].time < time - SHEET_VELOCITY_WINDOW_MS
		) {
			candidate.samples.shift();
		}
	}

	function pointerMove(event: PointerEvent) {
		if (event.pointerId !== candidate?.id) return;
		move(event.clientX, event.clientY, event.timeStamp);
		if (dragging) event.preventDefault();
	}

	function finish(event: PointerEvent) {
		if (event.pointerId !== candidate?.id) return;
		const drag = candidate;
		candidate = null;
		holding = false;
		if (!dragging) {
			offset = 0;
			return;
		}
		clearSuppression();
		clearSuppression = suppressNextClick();
		const close =
			event.type === 'pointerup' &&
			shouldCloseSheet(offset, sheetHeight, sheetDragVelocity(drag.samples, event.timeStamp));
		dragging = false;
		if (close) open = false;
		else offset = 0;
	}

	$effect(() => {
		if (!ref) return;
		const element = ref;
		const touchMove = (event: TouchEvent) => {
			const touch = event.touches[0];
			// Only a touch gesture uses touch events. A finger must not move a mouse or pen drag.
			if (touch && candidate?.touch) move(touch.clientX, touch.clientY, event.timeStamp);
			// Keep native content scrolling until the sheet takes the gesture.
			if (dragging && event.cancelable) event.preventDefault();
		};
		const lostCapture = (event: PointerEvent) => {
			if (event.target === element) finish(event);
		};
		element.addEventListener('pointerdown', pointerDown);
		window.addEventListener('pointermove', pointerMove);
		window.addEventListener('pointerup', finish);
		window.addEventListener('pointercancel', finish);
		element.addEventListener('lostpointercapture', lostCapture);
		element.addEventListener('touchmove', touchMove, { passive: false });
		return () => {
			element.removeEventListener('pointerdown', pointerDown);
			window.removeEventListener('pointermove', pointerMove);
			window.removeEventListener('pointerup', finish);
			window.removeEventListener('pointercancel', finish);
			element.removeEventListener('lostpointercapture', lostCapture);
			element.removeEventListener('touchmove', touchMove);
		};
	});
</script>

{#key session}
	<Sheet.Root bind:open {onOpenChangeComplete}>
		<Sheet.Content
			bind:ref
			side="bottom"
			showCloseButton={false}
			data-testid={testId}
			class="bottom-sheet max-h-[85vh] gap-0 rounded-t-2xl border-0 text-base shadow-xl outline-none"
			style="--sheet-offset: {offset}px; transform: translateY({offset}px); animation-duration: {duration}ms; transition: {settle(
				'transform'
			)}; padding-bottom: env(safe-area-inset-bottom); padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right)"
			overlayProps={{
				class: 'bottom-sheet-scrim bg-black/30 supports-backdrop-filter:backdrop-blur-none',
				style: `--scrim-opacity: ${scrimOpacity}; opacity: ${scrimOpacity}; animation-duration: ${duration}ms; transition: ${settle('opacity')}`
			}}
			onOpenAutoFocus={(event) => {
				event.preventDefault();
				// Focus now so the first Tab starts inside the sheet, before the next frame.
				ref?.focus({ preventScroll: true });
			}}
			onCloseAutoFocus={(event) => {
				event.preventDefault();
				if (!open && !handoff) trigger?.focus();
			}}
		>
			<header class="shrink-0 touch-none px-5 pt-3 pb-4">
				<div aria-hidden="true" class="mx-auto mb-4 h-1 w-9 rounded-full bg-border"></div>
				<Sheet.Title class="text-lg font-semibold">{title}</Sheet.Title>
				<Sheet.Description class={subtitle ? 'truncate text-sm text-muted-foreground' : 'sr-only'}>
					{subtitle ?? title}
				</Sheet.Description>
			</header>
			<div
				bind:this={scrollArea}
				use:overlayScrollbar
				class="min-h-0 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-5"
			>
				{@render children()}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{/key}

<style>
	:global(.bottom-sheet) {
		animation-fill-mode: backwards;
	}
	:global(.bottom-sheet[data-open]) {
		animation-name: sheet-enter;
	}
	:global(.bottom-sheet[data-closed]) {
		animation-name: sheet-exit;
	}
	:global(.bottom-sheet-scrim) {
		animation-fill-mode: backwards;
	}
	:global(.bottom-sheet-scrim[data-open]) {
		animation-name: scrim-enter;
	}
	:global(.bottom-sheet-scrim[data-closed]) {
		animation-name: scrim-exit;
	}
	@keyframes -global-sheet-enter {
		from {
			translate: 0 100%;
		}
		to {
			translate: 0 0;
		}
	}
	@keyframes -global-sheet-exit {
		from {
			translate: 0 0;
		}
		to {
			translate: 0 calc(100% - var(--sheet-offset));
		}
	}
	@keyframes -global-scrim-enter {
		from {
			opacity: 0;
		}
		to {
			opacity: var(--scrim-opacity);
		}
	}
	@keyframes -global-scrim-exit {
		from {
			opacity: var(--scrim-opacity);
		}
		to {
			opacity: 0;
		}
	}
</style>
