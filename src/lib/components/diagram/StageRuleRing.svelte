<script lang="ts">
	let { color, still = false }: { color: string; still?: boolean } = $props();
</script>

<span
	class="stage-rule-ring pointer-events-none absolute left-0 rounded-full border"
	class:paper={still}
	style:width={still ? '4px' : '6px'}
	style:height={still ? '4px' : '6px'}
	style:border-color={color}
	style:background-color={still ? 'var(--color-paper)' : 'var(--background)'}
	aria-hidden="true"
	data-testid="stage-rule-ring"
></span>

<style>
	.stage-rule-ring {
		top: 0;
	}
	.paper {
		top: -4px;
	}
	@media (forced-colors: active) {
		.stage-rule-ring {
			border-color: CanvasText;
			background: Canvas;
		}
	}
</style>
