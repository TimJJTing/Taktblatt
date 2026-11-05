/** The icon of each milestone symbol. The Gantt and the printed Gantt share this map. */
import CircleIcon from '@lucide/svelte/icons/circle';
import DiamondIcon from '@lucide/svelte/icons/diamond';
import FlagIcon from '@lucide/svelte/icons/flag';
import StarIcon from '@lucide/svelte/icons/star';
import TriangleIcon from '@lucide/svelte/icons/triangle';
import SquareIcon from '@lucide/svelte/icons/square';
import HexagonIcon from '@lucide/svelte/icons/hexagon';
import PentagonIcon from '@lucide/svelte/icons/pentagon';
import BookmarkIcon from '@lucide/svelte/icons/bookmark';
import HeartIcon from '@lucide/svelte/icons/heart';
import type { Component } from 'svelte';
import type { SVGAttributes } from 'svelte/elements';
import type { MilestoneSymbol } from '#lib/domain/schema.js';
import FilledMapPin from './FilledMapPin.svelte';

type MilestoneIconProps = Pick<SVGAttributes<SVGSVGElement>, 'class' | 'aria-hidden'>;

export const MILESTONE_SYMBOLS: Record<MilestoneSymbol, Component<MilestoneIconProps>> = {
	diamond: DiamondIcon,
	flag: FlagIcon,
	star: StarIcon,
	circle: CircleIcon,
	triangle: TriangleIcon,
	square: SquareIcon,
	hexagon: HexagonIcon,
	pentagon: PentagonIcon,
	pin: FilledMapPin,
	bookmark: BookmarkIcon,
	heart: HeartIcon
};
