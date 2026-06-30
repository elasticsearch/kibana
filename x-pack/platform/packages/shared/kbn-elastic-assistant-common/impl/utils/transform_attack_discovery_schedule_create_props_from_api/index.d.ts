import type { AttackDiscoveryScheduleCreateProps } from '../../schemas/attack_discovery/routes/public/schedules/schedules.gen';
import type { AttackDiscoveryApiScheduleCreateProps } from '../../schemas/attack_discovery/routes/public/schedules/schedules_api.gen';
export declare const transformAttackDiscoveryScheduleCreatePropsFromApi: (apiCreateProps: AttackDiscoveryApiScheduleCreateProps) => AttackDiscoveryScheduleCreateProps;
