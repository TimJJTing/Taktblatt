<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { motionDuration } from '#lib/motion.ts';
	import { workspaceTabs } from './app-layout.svelte.ts';
	import Hint from './Hint.svelte';

	const viewer = getViewer();
	const tabs = ['plan', 'work-plan'] as const;
	const duration = $derived(motionDuration(220));

	function onKey(event: KeyboardEvent, index: number) {
		const next = {
			ArrowLeft: 1 - index,
			ArrowRight: 1 - index,
			Home: 0,
			End: 1
		}[event.key];
		if (next === undefined) return;
		event.preventDefault();
		viewer.setNarrowTab(tabs[next]);
		document.getElementById(`workspace-tab-${tabs[next]}`)?.focus();
	}
</script>

<div
	class="workspace-tabs lg:hidden"
	data-testid="workspace-tabs"
	style:--tabs-compact={duration === 0 ? 0 : workspaceTabs.compact}
	style:--tab-duration="{duration}ms"
	data-motion={duration > 0}
>
	<div role="tablist" aria-label={m.workspace_view()} class="tablist">
		<span
			class="indicator"
			data-testid="workspace-tab-indicator"
			aria-hidden="true"
			style:transform="translateX({viewer.narrowTab === 'plan' ? '0' : '100%'})"
		></span>
		{#each tabs as tab, index (tab)}
			{@const name = tab === 'plan' ? m.workspace_overview() : m.section_work_plan()}
			<Hint text={name} side="top">
				{#snippet child({ props })}
					<button
						{...mergeProps(props, {
							onclick: () => viewer.setNarrowTab(tab),
							onfocus: (event: FocusEvent) => {
								if ((event.currentTarget as HTMLElement).matches(':focus-visible'))
									workspaceTabs.compact = 0;
								if (viewer.narrowTab !== tab) viewer.setNarrowTab(tab);
							},
							onkeydown: (event: KeyboardEvent) => onKey(event, index)
						})}
						type="button"
						role="tab"
						id="workspace-tab-{tab}"
						aria-label={name}
						aria-controls={tab === 'plan' ? 'plan-pane' : 'work-pane'}
						aria-selected={viewer.narrowTab === tab}
						tabindex={viewer.narrowTab === tab ? 0 : -1}
						class="workspace-tab focus-visible:outline-2 focus-visible:outline-ring"
					>
						{#if tab === 'plan'}
							<LayoutDashboard aria-hidden="true" />
						{:else}
							<ListChecks aria-hidden="true" />
						{/if}
					</button>
				{/snippet}
			</Hint>
		{/each}
	</div>
</div>

<style>
	.workspace-tabs {
		--tab-width: calc(52px - 12px * var(--tabs-compact));
		--tab-height: calc(40px - 12px * var(--tabs-compact));
		position: absolute;
		z-index: 40;
		left: 50%;
		bottom: calc(12px + env(safe-area-inset-bottom));
		translate: -50% 0;
		border-radius: 9999px;
		padding: 4px;
		background: color-mix(in oklab, var(--background) 55%, transparent);
		-webkit-backdrop-filter: blur(20px) saturate(1.8);
		backdrop-filter: blur(20px) saturate(1.8);
		box-shadow:
			inset 0 1px 0 color-mix(in oklab, white 55%, transparent),
			inset 0 0 0 1px color-mix(in oklab, var(--foreground) 10%, transparent),
			0 8px 24px -6px rgb(0 0 0 / 0.25),
			0 2px 6px rgb(0 0 0 / 0.08);
	}
	:global(.dark) .workspace-tabs {
		background: color-mix(in oklab, var(--background) 45%, transparent);
		box-shadow:
			inset 0 1px 0 color-mix(in oklab, white 18%, transparent),
			inset 0 0 0 1px color-mix(in oklab, var(--foreground) 10%, transparent),
			0 8px 24px -6px rgb(0 0 0 / 0.5),
			0 2px 6px rgb(0 0 0 / 0.2);
	}
	.tablist {
		position: relative;
		display: flex;
	}
	.workspace-tab,
	.indicator {
		width: var(--tab-width);
		height: var(--tab-height);
		border-radius: 9999px;
	}
	.workspace-tab {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--muted-foreground);
	}
	.workspace-tab[aria-selected='true'] {
		color: var(--foreground);
	}
	.workspace-tab :global(svg) {
		width: calc(20px - 4px * var(--tabs-compact));
		height: calc(20px - 4px * var(--tabs-compact));
	}
	.indicator {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
		background: color-mix(in oklab, var(--background) 85%, transparent);
		box-shadow:
			inset 0 1px 0 color-mix(in oklab, white 35%, transparent),
			0 1px 4px rgb(0 0 0 / 0.12);
		transition: transform var(--tab-duration) cubic-bezier(0.22, 1, 0.36, 1);
	}
	.workspace-tabs[data-motion='false'] .indicator {
		transition: none;
	}
	@media (prefers-reduced-transparency: reduce), (forced-colors: active) {
		.workspace-tabs,
		:global(.dark) .workspace-tabs {
			background: var(--background);
			-webkit-backdrop-filter: none;
			backdrop-filter: none;
			border: 1px solid var(--foreground);
			box-shadow: none;
		}
		.indicator {
			background: var(--background);
			border: 1px solid var(--foreground);
			box-shadow: none;
		}
	}
	@media (forced-colors: active) {
		.workspace-tabs,
		:global(.dark) .workspace-tabs,
		.indicator {
			border-color: CanvasText;
		}
	}
</style>
