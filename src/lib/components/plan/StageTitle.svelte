<!--
	The editable title of a stage. The work plan and the stage overview use it.
	An empty title shows "Stage N".
-->
<script lang="ts">
	import InlineText from '#lib/components/edit/InlineText.svelte';
	import { LIMITS, type Stage } from '#lib/domain/schema.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { updateStage } from '#lib/state/commands.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
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
