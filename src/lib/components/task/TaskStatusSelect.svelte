<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import Hint from '#lib/components/app/Hint.svelte';
	import * as Select from '#lib/components/ui/select/index.ts';
	import { TASK_STATUSES, type TaskStatus } from '#lib/domain/schema.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import TaskStatusIcon from './TaskStatusIcon.svelte';
	import { taskStatusLabel } from './task-status.ts';

	interface Props {
		status: TaskStatus;
		task: string;
		compact?: boolean;
		disabled?: boolean;
		onChange: (status: TaskStatus) => void;
	}

	let { status, task, compact = false, disabled = false, onChange }: Props = $props();
	const label = $derived(taskStatusLabel(status));
	const name = $derived(m.task_status_label({ task, status: label }));
	const triggerClass = $derived(
		compact
			? 'size-7 justify-center border-transparent p-0 shadow-none data-[size=sm]:h-7 [&>svg:last-child]:hidden'
			: 'max-w-full'
	);

	function change(value: string) {
		const next = TASK_STATUSES.find((item) => item === value);
		if (next && next !== status) onChange(next);
	}
</script>

<Select.Root type="single" value={status} {disabled} onValueChange={change}>
	{#if disabled}
		<Hint text={m.task_status_derived()} focusable={compact}>
			{#snippet child({ props })}
				<span {...props} role="group" aria-label={m.task_status_derived()} class="inline-flex">
					<Select.Trigger
						size="sm"
						class={triggerClass}
						aria-label={name}
						data-testid="task-status"
						style={`transition-duration: ${motionDuration(150)}ms`}
					>
						<span class="flex items-center gap-1.5"
							><TaskStatusIcon {status} />{#if !compact}{label}{/if}</span
						>
					</Select.Trigger>
				</span>
			{/snippet}
		</Hint>
	{:else if compact}
		<!-- Only the compact trigger hides the label, so only it needs the hint. -->
		<Hint text={name}>
			{#snippet child({ props })}
				<Select.Trigger
					{...mergeProps(props, { 'aria-label': name })}
					size="sm"
					class={triggerClass}
					data-testid="task-status"
					style={`transition-duration: ${motionDuration(150)}ms`}
				>
					<span class="flex items-center gap-1.5"
						><TaskStatusIcon {status} />{#if !compact}{label}{/if}</span
					>
				</Select.Trigger>
			{/snippet}
		</Hint>
	{:else}
		<Select.Trigger
			size="sm"
			class={triggerClass}
			aria-label={name}
			data-testid="task-status"
			style={`transition-duration: ${motionDuration(150)}ms`}
		>
			<span class="flex items-center gap-1.5"><TaskStatusIcon {status} />{label}</span>
		</Select.Trigger>
	{/if}
	<Select.Content style={`animation-duration: ${motionDuration(100)}ms`}>
		{#each TASK_STATUSES as value (value)}
			<Select.Item {value} label={taskStatusLabel(value)}>
				<TaskStatusIcon status={value} />{taskStatusLabel(value)}
			</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
