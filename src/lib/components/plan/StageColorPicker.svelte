<!-- The stage color swatch. It opens the curated palette. A color that another stage uses has a warning. -->
<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { STAGE_COLOR_KEYS, type StageColor } from '#lib/domain/palette.js';
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
	const duplicate = $derived(used.includes(value));
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class={cn(
			'size-3.5 shrink-0 rounded-[4px] transition-transform outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
			duplicate && 'ring-2 ring-amber-500/70 ring-offset-1'
		)}
		style="background: {stageColorVar(value)}"
		aria-label={m.stage_color({ color: colorName(value) })}
		data-testid="stage-color"
	/>
	<Popover.Content class="w-auto p-2" align="start">
		<div
			class="grid grid-cols-4 gap-1.5"
			role="radiogroup"
			aria-label={m.stage_color({ color: '' })}
		>
			{#each STAGE_COLOR_KEYS as key (key)}
				<button
					type="button"
					role="radio"
					aria-checked={key === value}
					aria-label={colorName(key)}
					title={used.includes(key)
						? `${colorName(key)} · ${m.stage_color_in_use()}`
						: colorName(key)}
					class="relative flex size-7 items-center justify-center rounded-md transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					style="background: {stageColorVar(key)}"
					onclick={() => {
						onChange(key);
						open = false;
					}}
				>
					{#if key === value}<CheckIcon class="size-4 text-white" aria-hidden="true" />{/if}
					{#if used.includes(key) && key !== value}
						<span
							class="absolute -top-0.5 -right-0.5 size-2 rounded-full border border-background bg-amber-500"
							aria-hidden="true"
						></span>
					{/if}
				</button>
			{/each}
		</div>
		{#if duplicate}
			<p class="mt-2 max-w-44 text-xs text-muted-foreground">{m.stage_color_in_use()}</p>
		{/if}
	</Popover.Content>
</Popover.Root>
