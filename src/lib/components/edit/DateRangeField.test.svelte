<script lang="ts">
	import type { ISODate } from '#lib/domain/date.ts';
	import DateRangeField from './DateRangeField.svelte';

	interface Props {
		start: ISODate | null;
		end: ISODate | null;
		floor: {
			start: ISODate | null;
			end: ISODate | null;
			first: ISODate | null;
			last: ISODate | null;
		};
		onCommit: (range: { start: ISODate | null; end: ISODate | null }) => void;
	}

	let { start, end, floor, onCommit }: Props = $props();
</script>

<DateRangeField {start} {end} {floor} {onCommit} label="Planned window">
	{#snippet trigger({ props })}
		<button {...props}>Edit dates</button>
	{/snippet}
</DateRangeField>
