import type { LucideIcon } from '@lucide/svelte';

export interface MenuAction {
	testId: string;
	label: () => string;
	shortLabel?: () => string;
	icon: LucideIcon;
	handler: () => void;
	hint?: () => string;
	tile?: boolean;
	destructive?: boolean;
	sync?: boolean;
}

export interface MenuActions {
	act: (handler: () => void) => void;
	run: (action: MenuAction) => void;
}
