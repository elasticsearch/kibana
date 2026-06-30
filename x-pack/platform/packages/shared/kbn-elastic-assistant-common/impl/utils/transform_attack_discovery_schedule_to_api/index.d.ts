import type { AttackDiscoverySchedule } from '../../schemas/attack_discovery/routes/public/schedules/schedules.gen';
import type { AttackDiscoveryApiSchedule } from '../../schemas/attack_discovery/routes/public/schedules/schedules_api.gen';
export declare const transformAttackDiscoveryScheduleToApi: (attackDiscoverySchedule: AttackDiscoverySchedule) => AttackDiscoveryApiSchedule;
