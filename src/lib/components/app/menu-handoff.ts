import { flushSync, tick } from 'svelte';

/** Close before an action. A reopen settles the pending action exactly once. */
export function createMenuHandoff(options: {
	close: () => void;
	focus: () => void;
	setActive: (active: boolean) => void;
}) {
	let pending: { action?: () => void } | undefined;
	const settle = () => {
		const action = pending?.action;
		pending = undefined;
		options.setActive(false);
		if (!action) return;
		options.focus();
		action();
	};
	return {
		act(action: () => void) {
			settle();
			pending = { action };
			options.setActive(true);
			options.close();
		},
		/** The file chooser needs the activation from the current user action. */
		actSync(action: () => void) {
			settle();
			pending = {};
			options.setActive(true);
			flushSync(options.close);
			options.focus();
			try {
				action();
			} catch (error) {
				settle();
				throw error;
			}
		},
		complete(open: boolean) {
			if (open) return;
			const closing = pending;
			// Keep focus suppression until the closed surface releases its modal layers.
			void tick().then(() => {
				if (pending === closing) settle();
			});
		},
		reopen: settle,
		destroy() {
			pending = undefined;
			options.setActive(false);
		}
	};
}
