<!--
	The move-conflict dialog. It lists the changes that a move needs.
	"Remove and move" applies all of them as one undo step. Refer to ADR 6.
-->
<script lang="ts">
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.ts';
	import type { MoveConflicts, MoveFix } from '#lib/domain/dependencies.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';

	interface Props {
		open: boolean;
		taskTitle: string;
		conflicts: MoveConflicts;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let { open, taskTitle, conflicts, onConfirm, onCancel }: Props = $props();
	const ws = getWorkspace();
	const title = (id: string) => ws.index.byId.get(id)?.title || m.task_untitled();

	function describe(fix: MoveFix): string {
		switch (fix.kind) {
			case 'remove-scope-dependency':
				return m.move_fix_scope();
			case 'remove-parent-dependency':
				return m.move_fix_parent({ parent: title(fix.parentId) });
			case 'clear-date': {
				const names = { dependency: title(fix.dependencyId), dependent: title(fix.dependentId) };
				return fix.field === 'start' ? m.move_fix_start(names) : m.move_fix_end(names);
			}
		}
	}
</script>

<AlertDialog.Root {open} onOpenChange={(o) => !o && onCancel()}>
	<AlertDialog.Content data-testid="move-dialog">
		<AlertDialog.Header>
			<AlertDialog.Title>{m.move_title()}</AlertDialog.Title>
			{#if conflicts.fixes.length}
				<AlertDialog.Description>{m.move_body({ task: taskTitle })}</AlertDialog.Description>
			{/if}
		</AlertDialog.Header>
		{#if conflicts.fixes.length}
			<ul class="list-disc space-y-1 pl-5 text-sm">
				{#each conflicts.fixes as fix, i (i)}
					<li>{describe(fix)}</li>
				{/each}
			</ul>
		{/if}
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={onCancel}>{m.action_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={onConfirm}>
				{m.move_apply()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
