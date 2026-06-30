import type { Alert } from '../../alert';
import type { AlertInstanceState, AlertInstanceContext } from '../../types';
import type { RulesSettingsFlappingProperties } from '../../../common/rules_settings';
interface DetermineFlappingAlertsOpts<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string> {
    newAlerts: Record<string, Alert<State, Context, ActionGroupIds>>;
    activeAlerts: Record<string, Alert<State, Context, ActionGroupIds>>;
    recoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupId>>;
    flappingSettings: RulesSettingsFlappingProperties;
    previouslyRecoveredAlerts: Record<string, Alert<State, Context>>;
    actionGroupId: string;
}
export declare function determineFlappingAlerts<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>({ newAlerts, activeAlerts, recoveredAlerts, flappingSettings, previouslyRecoveredAlerts, actionGroupId, }: DetermineFlappingAlertsOpts<State, Context, ActionGroupIds, RecoveryActionGroupId>): {
    newAlerts: Record<string, Alert<State, Context, ActionGroupIds, import("@kbn/alerts-as-data-utils").AADAlert>>;
    activeAlerts: Record<string, Alert<State, Context, ActionGroupIds, import("@kbn/alerts-as-data-utils").AADAlert>>;
    trackedActiveAlerts: Record<string, Alert<State, Context, ActionGroupIds, import("@kbn/alerts-as-data-utils").AADAlert>>;
    recoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupId, import("@kbn/alerts-as-data-utils").AADAlert>>;
    trackedRecoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupId, import("@kbn/alerts-as-data-utils").AADAlert>>;
};
export {};
