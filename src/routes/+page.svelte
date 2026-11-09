<script lang="ts">
	import { loadExample } from '#lib/state/commands.ts';
	import { toast } from 'svelte-sonner';
	import WorkspaceShell from '#lib/components/app/WorkspaceShell.svelte';
	import DamagedNotice from '#lib/components/app/DamagedNotice.svelte';
	import LanguageReloadDialog from '#lib/components/app/LanguageReloadDialog.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { isModKey, isTextEditing } from '#lib/browser/keyboard.ts';
	import { localStorageKey } from '#lib/paraglide/runtime.js';
	import { m } from '#lib/paraglide/messages.js';
	import PlanHeader from '#lib/components/plan/PlanHeader.svelte';
	import StageOverview from '#lib/components/plan/StageOverview.svelte';
	import Timeline from '#lib/components/timeline/Timeline.svelte';
	import PrintHost from '#lib/components/print/PrintHost.svelte';
	import PlanFooter from '#lib/components/plan/PlanFooter.svelte';
	import Remarks from '#lib/components/remarks/Remarks.svelte';
	import WorkPlan from '#lib/components/plan/WorkPlan.svelte';
	import TaskDialog from '#lib/components/task/TaskDialog.svelte';
	import { EditingState, setEditing } from '#lib/state/editing.svelte.ts';
	import { PreviewState, setPreview } from '#lib/state/preview.svelte.ts';
	import { LanguageReload, setLanguageReload } from '#lib/state/language-reload.svelte.ts';
	import { setViewer, ViewerState } from '#lib/state/viewer.svelte.ts';
	import { setWorkspace, Workspace } from '#lib/state/workspace.svelte.ts';

	const ws = setWorkspace(
		new Workspace(localStorage, () => toast.warning(m.toast_cycle_created()))
	);
	setViewer(new ViewerState(localStorage));
	setEditing(new EditingState());
	const preview = setPreview(new PreviewState());
	const languageReload = setLanguageReload(new LanguageReload(ws, preview));

	const title = $derived(ws.plan.heading.trim() || m.untitled_plan());

	function onKeydown(event: KeyboardEvent) {
		if (!isModKey(event) || event.altKey) return;
		const key = event.key.toLowerCase();
		if (key === 's') {
			// The app saves automatically. The toast confirms it.
			event.preventDefault();
			toast.success(m.saved_toast(), { description: m.saved_toast_detail(), id: 'saved' });
			return;
		}
		if (key === 'p' && !event.shiftKey) {
			// The sheets render first. This follows the same path as the Print button.
			event.preventDefault();
			if (!event.repeat) preview.print();
			return;
		}
		if (isTextEditing(event.target)) return;
		const redo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey);
		if (redo) {
			event.preventDefault();
			ws.redo();
		} else if (key === 'z') {
			event.preventDefault();
			ws.undo();
		}
	}

	function onStorage(event: StorageEvent) {
		if (event.storageArea !== localStorage) return;
		// Another tab changed the UI language. This tab must reload, so it does not mix two languages.
		if (event.key === localStorageKey) {
			languageReload.changedInOtherTab(event.newValue);
			return;
		}
		ws.handleStorageEvent(event);
	}
</script>

<svelte:head>
	<title>{title} · {m.app_name()}</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} onstorage={onStorage} />

<!-- The workspace never prints. Print uses the sheets (PrintHost). The preview makes the workspace inert. -->
<div data-workspace inert={preview.open}>
	<WorkspaceShell>
		{#snippet plan()}
			<DamagedNotice />
			{#if ws.isPristine}
				<div class="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm">
					<span class="text-muted-foreground">{m.example_prompt()}</span>
					<Button size="sm" variant="outline" onclick={() => loadExample(ws)}
						>{m.example_load()}</Button
					>
				</div>
			{/if}
			<section id="header" aria-label={m.section_header()} class="space-y-3">
				<PlanHeader />
				<PlanFooter />
			</section>
			<section id="timeline" class="mt-10" aria-labelledby="timeline-title">
				<Timeline />
			</section>
			<section id="stage-overview" class="mt-10" aria-labelledby="overview-title">
				<h2 id="overview-title" class="mb-2 text-sm font-semibold tracking-wide uppercase">
					{m.section_stage_overview()}
				</h2>
				<StageOverview />
			</section>

			<section id="remarks" class="mt-10" aria-labelledby="remarks-title">
				<h2 id="remarks-title" class="mb-2 text-sm font-semibold tracking-wide uppercase">
					{m.section_remarks()}
				</h2>
				<Remarks />
			</section>
		{/snippet}
		{#snippet work()}
			<section id="work-plan" aria-labelledby="work-plan-title">
				<h2 id="work-plan-title" class="mb-2 text-sm font-semibold tracking-wide uppercase">
					{m.section_work_plan()}
				</h2>
				<WorkPlan />
			</section>
		{/snippet}
	</WorkspaceShell>
	<LanguageReloadDialog />

	<TaskDialog />
</div>

<PrintHost />

<style>
	@media screen {
		[data-workspace] {
			height: 100dvh;
			display: grid;
			grid-template-rows: auto minmax(0, 1fr);
			position: relative;
			/* The column must not grow to the width of the Gantt or the table. */
			grid-template-columns: minmax(0, 1fr);
			overflow: hidden;
		}
	}
</style>
