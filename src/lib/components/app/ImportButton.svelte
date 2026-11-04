<script lang="ts">
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { dateWarnings } from '#lib/domain/dependencies.js';
	import { indexTasks } from '#lib/domain/derive.js';
	import { limitErrors, parseFile } from '#lib/domain/io.js';
	import type { Plan } from '#lib/domain/schema.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getWorkspace, type ImportConflict } from '#lib/state/workspace.svelte.js';

	type Choice = 'replace' | 'keep-both';

	const ws = getWorkspace();
	let input = $state<HTMLInputElement | null>(null);
	let errors = $state<string[] | null>(null);
	/** Plans that wait for a decision about the conflicts. */
	// Raw state: the plans must stay plain objects, because `withNewIds` clones them.
	let pending = $state.raw<{ plans: Plan[]; conflicts: ImportConflict[] } | null>(null);
	let choices = $state<Record<string, Choice>>({});

	const errorList = $derived(errors ? limitErrors(errors) : null);

	async function onFile(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		// Reset the field. Then the same file can be chosen again.
		target.value = '';
		if (!file) return;
		const result = parseFile(await file.text());
		if (!result.ok) {
			errors = result.errors;
			return;
		}
		const conflicts = ws.importConflicts(result.plans);
		if (conflicts.length === 0) {
			finish(result.plans, () => 'keep-both');
			return;
		}
		// Keep both is the safe default. It does not delete data.
		choices = Object.fromEntries(conflicts.map((c) => [c.incoming.id, 'keep-both' as Choice]));
		pending = { plans: result.plans, conflicts };
	}

	function confirmConflicts() {
		if (!pending) return;
		const { plans } = pending;
		const decided = { ...choices };
		pending = null;
		finish(plans, (plan) => decided[plan.id] ?? 'keep-both');
	}

	function finish(plans: Plan[], decide: (plan: Plan) => Choice) {
		ws.importPlans(plans, decide, m.plan_copy_suffix());
		toast.success(
			plans.length === 1 ? m.import_done_one() : m.import_done_many({ count: plans.length }),
			{ description: ws.plan.heading.trim() || m.untitled_plan() }
		);
		const warnings = plans.reduce(
			(sum, plan) => sum + dateWarnings(indexTasks(plan.tasks)).length,
			0
		);
		if (warnings > 0)
			toast.warning(m.import_date_warnings({ count: warnings }), { duration: 10_000 });
	}
</script>

<input
	bind:this={input}
	type="file"
	accept=".json,application/json"
	class="hidden"
	tabindex="-1"
	aria-hidden="true"
	data-testid="import-input"
	onchange={onFile}
/>
<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-sm"
				aria-label={m.action_import()}
				data-testid="import-open"
				onclick={() => input?.click()}
			>
				<UploadIcon aria-hidden="true" />
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>{m.action_import()}</Tooltip.Content>
</Tooltip.Root>

<Dialog.Root open={errors !== null} onOpenChange={(open) => !open && (errors = null)}>
	<Dialog.Content data-testid="import-errors">
		<Dialog.Header>
			<Dialog.Title>{m.import_error_title()}</Dialog.Title>
			<Dialog.Description>{m.import_error_body()}</Dialog.Description>
		</Dialog.Header>
		{#if errorList}
			<ul class="max-h-60 list-disc space-y-1 overflow-y-auto pl-5 text-sm">
				{#each errorList.shown as error (error)}
					<li class="break-words">{error}</li>
				{/each}
				{#if errorList.more > 0}
					<li class="list-none text-muted-foreground">
						{m.import_error_more({ count: errorList.more })}
					</li>
				{/if}
			</ul>
		{/if}
		<Dialog.Footer>
			<Dialog.Close class="inline-flex">
				{#snippet child({ props })}
					<Button {...props}>{m.action_ok()}</Button>
				{/snippet}
			</Dialog.Close>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={pending !== null} onOpenChange={(open) => !open && (pending = null)}>
	<Dialog.Content data-testid="import-conflicts">
		<Dialog.Header>
			<Dialog.Title>{m.import_conflict_title()}</Dialog.Title>
			<Dialog.Description>{m.import_conflict_body()}</Dialog.Description>
		</Dialog.Header>
		{#if pending}
			<div class="max-h-72 space-y-3 overflow-y-auto">
				{#each pending.conflicts as conflict (conflict.incoming.id)}
					{@const name = conflict.incoming.heading.trim() || m.untitled_plan()}
					<fieldset class="space-y-1 rounded-md border p-3">
						<legend class="px-1 text-sm font-medium">{name}</legend>
						<p class="text-xs text-muted-foreground">
							{m.import_conflict_existing({
								name: conflict.existing.heading.trim() || m.untitled_plan()
							})}
						</p>
						<div class="flex gap-4 pt-1 text-sm">
							{#each [['replace', m.import_replace()], ['keep-both', m.import_keep_both()]] as const as [value, label] (value)}
								<label class="flex items-center gap-1.5">
									<input
										type="radio"
										name="import-{conflict.incoming.id}"
										{value}
										checked={choices[conflict.incoming.id] === value}
										onchange={() => (choices[conflict.incoming.id] = value)}
									/>
									{label}
								</label>
							{/each}
						</div>
					</fieldset>
				{/each}
			</div>
		{/if}
		<Dialog.Footer>
			<Dialog.Close class="inline-flex">
				{#snippet child({ props })}
					<Button {...props} variant="outline">{m.action_cancel()}</Button>
				{/snippet}
			</Dialog.Close>
			<Button onclick={confirmConflicts} data-testid="import-confirm">{m.action_import()}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
