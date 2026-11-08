<script lang="ts">
	import CircleIcon from '@lucide/svelte/icons/circle';
	import ContrastIcon from '@lucide/svelte/icons/contrast';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleSlashIcon from '@lucide/svelte/icons/circle-slash';
	import type { TaskStatus } from '#lib/domain/schema.ts';

	let { status, class: className = 'size-4' }: { status: TaskStatus; class?: string } = $props();
	const Icon = $derived(
		{
			todo: CircleIcon,
			in_progress: ContrastIcon,
			done: CircleCheckIcon,
			canceled: CircleSlashIcon
		}[status]
	);
</script>

<Icon
	class={status === 'in_progress' ? `${className} [&>path]:fill-current` : className}
	aria-hidden="true"
/>
