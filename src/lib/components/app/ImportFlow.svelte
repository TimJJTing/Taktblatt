<!--
	The import flow: `choose()` opens a file chooser for a plan file or a backup file.
	The app menu calls it. This component has no visible trigger.
	The app checks the file first. An invalid file shows a list of errors and changes nothing.
	When a plan has the same id as a stored plan, a dialog asks Replace or Keep both.
	If the browser cannot save, the import undoes its own writes and shows an error.
-->
<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { formatImportDiagnostic } from '#lib/import-diagnostics.ts';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import { dependencyWarnings } from '#lib/domain/dependencies.ts';
	import { indexTasks } from '#lib/domain/derive.ts';
	import { limitErrors, parseFile } from '#lib/domain/io.ts';
	import type { Plan } from '#lib/domain/schema.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { StorageWriteError } from '#lib/state/storage.ts';
	import { getWorkspace, type ImportConflict } from '#lib/state/workspace.svelte.ts';

	type Choice = 'replace' | 'keep-both';

	const ws = getWorkspace();
	let input = $state<HTMLInputElement | null>(null);
	let errors = $state<string[] | null>(null);
	/**
	 * Plans that wait for a decision about the conflicts.
	 * Raw state: the plans must stay plain objects, because `withNewIds` clones them.
	 */
	let pending = $state.raw<{ plans: Plan[]; conflicts: ImportConflict[] } | null>(null);
	let choices = $state<Record<string, Choice>>({});

	const errorList = $derived(errors ? limitErrors(errors) : null);

	const nameOf = (heading: string) => heading.trim() || m.untitled_plan();

	/** Opens the file chooser. Call it from a user action, or the browser blocks it. */
	export function choose() {
		input?.click();
	}

	/** Runs one step of the import. Any failure shows the error dialog. */
	function guarded(step: () => void) {
		try {
			step();
		} catch (error) {
			errors = [
				error instanceof StorageWriteError ? m.import_error_storage() : m.import_error_read()
			];
		}
	}

	async function onFile(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		// Reset the field. Then the same file can be chosen again.
		target.value = '';
		if (!file) return;
		let text: string;
		try {
			text = await file.text();
		} catch {
			errors = [m.import_error_read()];
			return;
		}
		guarded(() => {
			const result = parseFile(text, formatImportDiagnostic);
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
		});
	}

	function confirmConflicts() {
		if (!pending) return;
		const { plans } = pending;
		const decided = { ...choices };
		pending = null;
		guarded(() => finish(plans, (plan) => decided[plan.id] ?? 'keep-both'));
	}

	function finish(plans: Plan[], decide: (plan: Plan) => Choice) {
		ws.importPlans(plans, decide, m.plan_copy_suffix());
		toast.success(
			plans.length === 1 ? m.import_done_one() : m.import_done_many({ count: plans.length }),
			{ description: nameOf(ws.plan.heading) }
		);
		const warnings = plans.reduce(
			(sum, plan) =>
				sum +
				new Set(
					dependencyWarnings(indexTasks(plan.tasks)).map((warning) =>
						JSON.stringify([warning.taskId, warning.dependencyId])
					)
				).size,
			0
		);
		if (warnings > 0)
			toast.warning(m.import_dependency_warnings({ count: warnings }), { duration: 10_000 });
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
<Dialog.Root open={errors !== null} onOpenChange={(open) => !open && (errors = null)}>
	<Dialog.Content data-testid="import-errors">
		<Dialog.Header>
			<Dialog.Title>{m.import_error_title()}</Dialog.Title>
			<Dialog.Description>{m.import_error_body()}</Dialog.Description>
		</Dialog.Header>
		{#if errorList}
			<ul class="max-h-60 list-disc space-y-1 overflow-y-auto pl-5 text-sm">
				{#each errorList.shown as error, i (i)}
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
			<Button type="button" onclick={() => (errors = null)}>{m.action_ok()}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root open={pending !== null} onOpenChange={(open) => !open && (pending = null)}>
	<AlertDialog.Content data-testid="import-conflicts">
		<AlertDialog.Header>
			<AlertDialog.Title>{m.import_conflict_title()}</AlertDialog.Title>
			<AlertDialog.Description>{m.import_conflict_body()}</AlertDialog.Description>
		</AlertDialog.Header>
		{#if pending}
			<div class="max-h-72 space-y-3 overflow-y-auto">
				{#each pending.conflicts as conflict (conflict.incoming.id)}
					{@const name = nameOf(conflict.incoming.heading)}
					<fieldset class="space-y-1 rounded-md border p-3">
						<legend class="px-1 text-sm font-medium">{name}</legend>
						<p class="text-xs text-muted-foreground">
							{m.import_conflict_existing({ name: nameOf(conflict.existing.heading) })}
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
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.action_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={confirmConflicts} data-testid="import-ok">
				{m.action_import()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
