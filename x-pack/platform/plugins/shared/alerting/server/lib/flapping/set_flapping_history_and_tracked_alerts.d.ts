import type { Alert } from '../../alert';
import type { AlertInstanceState, AlertInstanceContext } from '../../types';
import type { RulesSettingsFlappingProperties } from '../../../common/rules_settings';
export declare function setFlappingHistoryAndTrackedAlerts<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupIds extends string>(flappingSettings: RulesSettingsFlappingProperties, newAlerts?: Record<string, Alert<State, Context, ActionGroupIds>>, activeAlerts?: Record<string, Alert<State, Context, ActionGroupIds>>, recoveredAlerts?: Record<string, Alert<State, Context, RecoveryActionGroupIds>>, previouslyRecoveredAlerts?: Record<string, Alert<State, Context>>): {
    newAlerts: Record<string, Alert<State, Context, ActionGroupIds>>;
    activeAlerts: Record<string, Alert<State, Context, ActionGroupIds>>;
    trackedActiveAlerts: Record<string, Alert<State, Context, ActionGroupIds>>;
    recoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupIds>>;
    trackedRecoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupIds>>;
};
export declare function updateAlertFlappingHistory<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>(flappingSettings: RulesSettingsFlappingProperties, alert: Alert<State, Context, ActionGroupIds | RecoveryActionGroupId>, state: boolean): void;
