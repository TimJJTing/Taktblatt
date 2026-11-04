<!--
	The plan header fields: subheading, heading, plan range and objective.
	The parent section of the page has the id "header". Each field saves on blur.
	Dates use the document language.
-->
<script lang="ts">
	import InlineText from '#lib/components/edit/InlineText.svelte';
	import DateRangeField from '#lib/components/edit/DateRangeField.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { tasksSpan } from '#lib/domain/derive.js';
	import { formatRangeDisplay, intlLocale } from '#lib/domain/format.js';
	import { LIMITS } from '#lib/domain/schema.js';
	import { m } from '#lib/paraglide/messages.js';
	import { updatePlan } from '#lib/state/commands.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	const ws = getWorkspace();
	const span = $derived(tasksSpan(ws.index));
	const rangeText = $derived(
		formatRangeDisplay(ws.plan.range.start, ws.plan.range.end, intlLocale(ws.plan.locale))
	);
</script>

<div>
	<InlineText
		value={ws.plan.subheading}
		label={m.field_subheading()}
		placeholder={m.field_subheading()}
		preserveWhitespace
		class="text-sm tracking-wide uppercase"
		onCommit={(subheading) => updatePlan(ws, { subheading })}
		testId="plan-subheading"
	/>
</div>
<h1 class="text-3xl font-semibold">
	<InlineText
		value={ws.plan.heading}
		label={m.field_heading()}
		placeholder={m.untitled_plan()}
		maxLength={LIMITS.heading}
		class="line-clamp-2 text-wrap whitespace-normal"
		onCommit={(heading) => {
			if (heading.trim()) updatePlan(ws, { heading });
		}}
		testId="plan-heading"
	/>
</h1>
<div class="flex flex-wrap items-center gap-2 text-sm">
	<DateRangeField
		start={ws.plan.range.start}
		end={ws.plan.range.end}
		locale={ws.plan.locale}
		label={m.field_project_range()}
		allowEmpty={false}
		onCommit={({ start, end }) => {
			if (start && end) updatePlan(ws, { range: { start, end } });
		}}
	>
		{#snippet trigger({ props })}<Button
				{...props}
				variant="ghost"
				size="sm"
				data-testid="project-range">{rangeText}</Button
			>{/snippet}
	</DateRangeField>
	<Button
		variant="outline"
		size="sm"
		disabled={!span}
		onclick={() => {
			if (span) updatePlan(ws, { range: span });
		}}>{m.range_fit_tasks()}</Button
	>
</div>
<div class="flex items-baseline gap-1 text-sm">
	<span class="shrink-0 font-medium">{m.field_objective()}</span>
	<InlineText
		value={ws.plan.objective}
		label={m.field_objective()}
		placeholder={m.objective_placeholder()}
		multiline
		maxLength={LIMITS.objective}
		onCommit={(objective) => updatePlan(ws, { objective })}
		testId="plan-objective"
	/>
</div>
