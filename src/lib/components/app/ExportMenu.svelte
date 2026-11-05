<!--
	The export menu: it writes the active plan or all plans to a JSON file.
	The file contains plan data only. It never contains viewer state.
-->
<script lang="ts">
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { mergeProps } from 'bits-ui';
	import { downloadText } from '#lib/browser/download.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { todayISO } from '#lib/domain/date.js';
	import {
		backupFileName,
		exportFileName,
		serializeFile,
		toBackupFile,
		toPlanFile
	} from '#lib/domain/io.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';

	const ws = getWorkspace();

	function exportPlan() {
		const plan = ws.activePlan();
		downloadText(exportFileName(plan.heading, todayISO()), serializeFile(toPlanFile(plan)));
	}

	function exportAll() {
		downloadText(backupFileName(todayISO()), serializeFile(toBackupFile(ws.allPlans())));
	}
</script>

<DropdownMenu.Root>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props: tooltipProps })}
				<DropdownMenu.Trigger>
					{#snippet child({ props: menuProps })}
						<Button
							{...mergeProps(tooltipProps, menuProps)}
							variant="ghost"
							size="icon-sm"
							aria-label={m.action_export()}
							data-testid="export-menu"
						>
							<UploadIcon aria-hidden="true" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{m.action_export()}</Tooltip.Content>
	</Tooltip.Root>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Item onSelect={exportPlan}>{m.export_plan()}</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={exportAll}>{m.export_all()}</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
