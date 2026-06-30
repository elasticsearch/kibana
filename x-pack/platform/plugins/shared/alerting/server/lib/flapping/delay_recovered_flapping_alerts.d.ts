import type { RulesSettingsFlappingProperties } from '../../../common/rules_settings';
import { Alert } from '../../alert';
import type { AlertInstanceState, AlertInstanceContext } from '../../types';
export declare function delayRecoveredFlappingAlerts<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>(flappingSettings: RulesSettingsFlappingProperties, actionGroupId: string, newAlerts?: Record<string, Alert<State, Context, ActionGroupIds>>, activeAlerts?: Record<string, Alert<State, Context, ActionGroupIds>>, trackedActiveAlerts?: Record<string, Alert<State, Context, ActionGroupIds>>, recoveredAlerts?: Record<string, Alert<State, Context, RecoveryActionGroupId>>, trackedRecoveredAlerts?: Record<string, Alert<State, Context, RecoveryActionGroupId>>): {
    newAlerts: Record<string, Alert<State, Context, ActionGroupIds, import("@kbn/alerts-as-data-utils").AADAlert>>;
    activeAlerts: Record<string, Alert<State, Context, ActionGroupIds, import("@kbn/alerts-as-data-utils").AADAlert>>;
    trackedActiveAlerts: Record<string, Alert<State, Context, ActionGroupIds, import("@kbn/alerts-as-data-utils").AADAlert>>;
    recoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupId, import("@kbn/alerts-as-data-utils").AADAlert>>;
    trackedRecoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupId, import("@kbn/alerts-as-data-utils").AADAlert>>;
};
