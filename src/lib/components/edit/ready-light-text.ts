import type { Readiness } from '#lib/domain/derive.ts';
import { m } from '#lib/paraglide/messages.js';

export function readyLightText(readiness: Readiness): string {
	if (readiness.kind !== 'ready') return '';
	if (readiness.via === 'subtasks') return m.ready_label_subtasks({ count: readiness.count });
	return readiness.count ? m.ready_label({ count: readiness.count }) : m.ready_label_plain();
}
