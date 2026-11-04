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
	import WorkPlan from '#lib/components/plan/WorkPlan.svelte';
	import TaskDialog from '#lib/components/task/TaskDialog.svelte';
	import { EditingState, setEditing } from '#lib/state/editing.svelte.js';
	import { setViewer, ViewerState } from '#lib/state/viewer.svelte.js';
	import { setWorkspace, Workspace } from '#lib/state/workspace.svelte.js';

	const uiLocale = (): Locale => {
		const locale = getLocale();
		return (LOCALES as readonly string[]).includes(locale) ? (locale as Locale) : 'en';
	};

	const ws = setWorkspace(new Workspace(localStorage, uiLocale));
	setViewer(new ViewerState(localStorage));
	setEditing(new EditingState());

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

<AppHeader />
<DamagedNotice />

<main class="mx-auto max-w-6xl px-4 py-8 pl-8">
	{#if ws.isPristine}
		<div class="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm">
			<span class="text-muted-foreground">{m.example_prompt()}</span>
			<Button size="sm" variant="outline" onclick={() => loadExample(ws)}>{m.example_load()}</Button
			>
		</div>
	{/if}
	<h1 class="mt-6 text-2xl font-semibold" data-testid="plan-heading">{title}</h1>

	<section id="work-plan" class="mt-10 scroll-mt-16" aria-labelledby="work-plan-title">
		<h2 id="work-plan-title" class="mb-2 text-sm font-semibold tracking-wide uppercase">
			{m.section_work_plan()}
		</h2>
		<WorkPlan />
	</section>
</main>

<TaskDialog />
