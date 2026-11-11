<script lang="ts">
	import { stageColorVar, stagePaperColor } from '#lib/components/plan/colors.ts';
	import { STAGE_BADGE_TEXT, type StageColor } from '#lib/domain/palette.ts';
	import { motionDuration } from '#lib/motion.ts';

	interface Props {
		color: StageColor;
		/** The caller supplies the localized stage label. */
		label: string;
		/** Static paper output. Colors stay light. */
		still?: boolean;
	}

	let { color, label, still = false }: Props = $props();
</script>

<span
	class="stage-badge inline-flex shrink-0 items-center justify-center rounded-sm px-1.5 py-0.5 text-xs font-semibold tabular-nums"
	class:still
	style:background-color={still ? stagePaperColor(color) : stageColorVar(color)}
	style:color={still
		? STAGE_BADGE_TEXT.light
		: `light-dark(${STAGE_BADGE_TEXT.light}, ${STAGE_BADGE_TEXT.dark})`}
	style:transition-duration={`${still ? 0 : motionDuration(150)}ms`}
>
	{label}
</span>

<style>
	.stage-badge {
		transition-property: color, background-color;
	}
	.still {
		transition: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.stage-badge {
			transition: none;
		}
	}
</style>
