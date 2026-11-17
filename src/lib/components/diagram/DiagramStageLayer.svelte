<!--
	One rendered view inside the diagram stage. It gives the view its layer context:
	an outgoing layer is not active, so the view gives no intended route ids.
-->
<script lang="ts">
	import { setDiagramLayer } from './diagram-layer.ts';
	import type { DiagramViewDefinition, DiagramViewProps } from './view-contract.ts';

	interface Props extends DiagramViewProps {
		view: DiagramViewDefinition;
		leaving: boolean;
	}

	let { view, leaving, ...props }: Props = $props();

	setDiagramLayer({
		get active() {
			return !leaving;
		}
	});

	const View = $derived(view.component);
</script>

<View {...props} />
