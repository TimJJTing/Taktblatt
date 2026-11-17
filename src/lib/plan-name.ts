import { m } from '#lib/paraglide/messages.js';

export const nameOf = (heading: string): string => heading.trim() || m.untitled_plan();
