<!-- The stage color swatch. It opens the curated palette. A color that another stage uses has a warning. -->
<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import { mergeProps } from 'bits-ui';
	import Hint from '#lib/components/app/Hint.svelte';
	import { isComposing } from '#lib/browser/keyboard.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { STAGE_COLOR_KEYS, type StageColor } from '#lib/domain/palette.js';
	import { motionDuration } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { colorName, stageColorVar } from './colors.js';

	interface Props {
		value: StageColor;
		/** Colors of the other stages. */
		used: readonly StageColor[];
		onChange: (color: StageColor) => void;
	}

	let { value, used, onChange }: Props = $props();
	let open = $state(false);
	let group = $state<HTMLDivElement | null>(null);
	let focusedColor = $state<StageColor | null>(null);

	function onOpenChange(next: boolean) {
		focusedColor = value;
		open = next;
	}

	function onKeydown(event: KeyboardEvent, key: StageColor) {
		if (isComposing(event)) return;
		const index = STAGE_COLOR_KEYS.indexOf(key);
		let next: number;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				next = (index + 1) % STAGE_COLOR_KEYS.length;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				next = (index - 1 + STAGE_COLOR_KEYS.length) % STAGE_COLOR_KEYS.length;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = STAGE_COLOR_KEYS.length - 1;
				break;
			default:
				return;
		}
		event.preventDefault();
		focusedColor = STAGE_COLOR_KEYS[next];
		onChange(focusedColor);
		group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
	}
	const duplicate = $derived(used.includes(value));
</script>

<Popover.Root {open} {onOpenChange}>
	<Popover.Trigger
		class={cn(
			'size-3.5 shrink-0 rounded-[4px] transition-transform outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
			duplicate && 'ring-2 ring-amber-500/70 ring-offset-1'
		)}
		style="background: {stageColorVar(value)}; transition-duration: {motionDuration(150)}ms"
		aria-label={m.stage_color({ color: colorName(value) })}
		data-testid="stage-color"
	/>
	<Popover.Content
		class="w-auto p-2"
		align="start"
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			group?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus({ preventScroll: true });
		}}
	>
		<div
			bind:this={group}
			class="grid grid-cols-4 gap-1.5"
			role="radiogroup"
			aria-label={m.stage_color({ color: '' })}
		>
			{#each STAGE_COLOR_KEYS as key (key)}
				{@const name = used.includes(key)
					? `${colorName(key)} · ${m.stage_color_in_use()}`
					: colorName(key)}
				<Hint text={name}>
					{#snippet child({ props })}
						<button
							{...mergeProps(props, {
								onclick: () => {
									onChange(key);
									open = false;
								},
								onkeydown: (event: KeyboardEvent) => onKeydown(event, key)
							})}
							type="button"
							role="radio"
							tabindex={key === (focusedColor ?? value) ? 0 : -1}
							aria-checked={key === value}
							aria-label={name}
							class="relative flex size-7 items-center justify-center rounded-md transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
							style:transition-duration={`${motionDuration(150)}ms`}
							style="background: {stageColorVar(key)}"
						>
							{#if key === value}<CheckIcon class="size-4 text-white" aria-hidden="true" />{/if}
							{#if used.includes(key) && key !== value}
								<span
									class="absolute -top-0.5 -right-0.5 size-2 rounded-full border border-background bg-amber-500"
									aria-hidden="true"
								></span>
							{/if}
						</button>
					{/snippet}
				</Hint>
			{/each}
		</div>
		{#if duplicate}
			<p class="mt-2 max-w-44 text-xs text-muted-foreground">{m.stage_color_in_use()}</p>
		{/if}
	</Popover.Content>
</Popover.Root>
