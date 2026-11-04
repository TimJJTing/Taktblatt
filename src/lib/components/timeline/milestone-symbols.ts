/** The icon of each milestone symbol. The Gantt and the printed Gantt share this map. */
import CircleIcon from '@lucide/svelte/icons/circle';
import DiamondIcon from '@lucide/svelte/icons/diamond';
import FlagIcon from '@lucide/svelte/icons/flag';
import StarIcon from '@lucide/svelte/icons/star';
import type { Component } from 'svelte';
import type { MilestoneSymbol } from '#lib/domain/schema.js';

export const MILESTONE_SYMBOLS: Record<MilestoneSymbol, Component<{ class?: string }>> = {
	diamond: DiamondIcon,
	flag: FlagIcon,
	star: StarIcon,
	circle: CircleIcon
};
