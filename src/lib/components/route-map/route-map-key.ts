import { m } from '#lib/paraglide/messages.js';

export function routeMapKeyEntries() {
	return [
		{ kind: 'workflow', label: m.route_map_key_workflow() },
		{ kind: 'family', label: m.route_map_key_subtask_route() },
		{ kind: 'station', label: m.route_map_key_station() },
		{ kind: 'interchange', label: m.route_map_key_transfer() },
		{ kind: 'walkway', label: m.route_map_key_cross_stage() },
		{ kind: 'cycle', label: m.route_map_key_cycle() }
	] as const;
}
