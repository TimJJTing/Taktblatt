<script lang="ts">
	import { loadExample } from '#lib/state/commands.js';
	import { toast } from 'svelte-sonner';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
	import DamagedNotice from '#lib/components/app/DamagedNotice.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { isModKey, isTextEditing } from '#lib/browser/keyboard.js';
	import { LOCALES, type Locale } from '#lib/domain/schema.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import PlanHeader from '#lib/components/plan/PlanHeader.svelte';
	import StageOverview from '#lib/components/plan/StageOverview.svelte';
	import Timeline from '#lib/components/timeline/Timeline.svelte';
	import PrintHost from '#lib/components/print/PrintHost.svelte';
	import PlanFooter from '#lib/components/plan/PlanFooter.svelte';
	import Remarks from '#lib/components/remarks/Remarks.svelte';
	import WorkPlan from '#lib/components/plan/WorkPlan.svelte';
	import TaskDialog from '#lib/components/task/TaskDialog.svelte';
	import { EditingState, setEditing } from '#lib/state/editing.svelte.js';
	import { PreviewState, setPreview } from '#lib/state/preview.svelte.js';
	import { setViewer, ViewerState } from '#lib/state/viewer.svelte.js';
	import { setWorkspace, Workspace } from '#lib/state/workspace.svelte.js';

	const uiLocale = (): Locale => {
		const locale = getLocale();
		return (LOCALES as readonly string[]).includes(locale) ? (locale as Locale) : 'en';
	};

	const ws = setWorkspace(new Workspace(localStorage, uiLocale));
	setViewer(new ViewerState(localStorage));
	setEditing(new EditingState());
	const preview = setPreview(new PreviewState());

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
			preview.print();
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
		ws.handleStorageEvent(event);
	}
</script>

<svelte:head>
	<title>{title} · {m.app_name()}</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} onstorage={onStorage} />

<!-- The workspace never prints. Print uses the sheets (PrintHost). The preview makes the workspace inert. -->
<div data-workspace class="contents" inert={preview.open}>
	<AppHeader />
	<DamagedNotice />

	<main class="mx-auto max-w-6xl px-4 py-8 pl-8">
		{#if ws.isPristine}
			<div class="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm">
				<span class="text-muted-foreground">{m.example_prompt()}</span>
				<Button size="sm" variant="outline" onclick={() => loadExample(ws)}
					>{m.example_load()}</Button
				>
			</div>
		{/if}
		<section id="header" aria-label={m.section_header()} class="mt-6 scroll-mt-header space-y-3">
			<PlanHeader />
		</section>
		<section id="timeline" class="mt-10 scroll-mt-header" aria-labelledby="timeline-title">
			<h2 id="timeline-title" class="mb-2 text-sm font-semibold tracking-wide uppercase">
				{m.section_timeline()}
			</h2>
			<Timeline />
		</section>
		<section id="stage-overview" class="mt-10 scroll-mt-anchor" aria-labelledby="overview-title">
			<h2 id="overview-title" class="mb-2 text-sm font-semibold tracking-wide uppercase">
				{m.section_stage_overview()}
			</h2>
			<StageOverview />
		</section>

		<section id="work-plan" class="mt-10 scroll-mt-anchor" aria-labelledby="work-plan-title">
			<h2 id="work-plan-title" class="mb-2 text-sm font-semibold tracking-wide uppercase">
				{m.section_work_plan()}
			</h2>
			<WorkPlan />
		</section>
		<section id="remarks" class="mt-10 scroll-mt-anchor" aria-labelledby="remarks-title">
			<h2 id="remarks-title" class="mb-2 text-sm font-semibold tracking-wide uppercase">
				{m.section_remarks()}
			</h2>
			<Remarks />
		</section>
	</main>

	<PlanFooter />

	<TaskDialog />
</div>

<PrintHost />
