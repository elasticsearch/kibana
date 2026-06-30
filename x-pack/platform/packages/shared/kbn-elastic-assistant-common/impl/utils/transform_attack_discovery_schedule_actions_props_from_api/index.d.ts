import type { AttackDiscoveryScheduleAction } from '../../schemas/attack_discovery/routes/public/schedules/schedules.gen';
import type { AttackDiscoveryApiScheduleAction } from '../../schemas/attack_discovery/routes/public/schedules/schedules_api.gen';
export declare const transformAttackDiscoveryScheduleActionsPropsFromApi: (actions: AttackDiscoveryApiScheduleAction[] | undefined) => AttackDiscoveryScheduleAction[] | undefined;
