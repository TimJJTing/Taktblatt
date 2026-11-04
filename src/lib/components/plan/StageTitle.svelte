<script lang="ts">
	import InlineText from '#lib/components/edit/InlineText.svelte';
	import { LIMITS, type Stage } from '#lib/domain/schema.js';
	import { m } from '#lib/paraglide/messages.js';
	import { updateStage } from '#lib/state/commands.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	let {
		stage,
		number,
		testId = 'stage-title'
	}: { stage: Stage; number: number; testId?: string } = $props();
	const ws = getWorkspace();
</script>

<InlineText
	value={stage.title}
	label={m.stage_title_placeholder({ n: number })}
	placeholder={m.stage_title_placeholder({ n: number })}
	maxLength={LIMITS.stageTitle}
	onCommit={(title) => updateStage(ws, stage.id, { title })}
	{testId}
/>
