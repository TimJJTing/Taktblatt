/** The sections of the plan, in page order. The app header shows them as navigation links. */
import { m } from '#lib/paraglide/messages.js';

export interface Section {
	/** The id of the section element. */
	id: string;
	label: () => string;
}

export const SECTIONS: readonly Section[] = [
	{ id: 'header', label: m.section_header },
	{ id: 'timeline', label: m.section_timeline },
	{ id: 'stage-overview', label: m.section_stage_overview },
	{ id: 'work-plan', label: m.section_work_plan },
	{ id: 'remarks', label: m.section_remarks }
];
