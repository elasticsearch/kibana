import type { Alert } from '../alert';
import type { AlertInstanceState, AlertInstanceContext } from '../types';
import type { RuleRunMetricsStore } from './rule_run_metrics_store';
interface DetermineDelayedAlertsOpts<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string> {
    newAlerts: Record<string, Alert<State, Context, ActionGroupIds>>;
    activeAlerts: Record<string, Alert<State, Context, ActionGroupIds>>;
    trackedActiveAlerts: Record<string, Alert<State, Context, ActionGroupIds>>;
    recoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupId>>;
    trackedRecoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupId>>;
    delayedAlerts: Record<string, Alert<State, Context, ActionGroupIds | RecoveryActionGroupId>>;
    alertDelay: number;
    startedAt?: string | null;
    ruleRunMetricsStore: RuleRunMetricsStore;
}
export declare function determineDelayedAlerts<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>({ newAlerts, activeAlerts, trackedActiveAlerts, recoveredAlerts, trackedRecoveredAlerts, delayedAlerts, alertDelay, startedAt, ruleRunMetricsStore, }: DetermineDelayedAlertsOpts<State, Context, ActionGroupIds, RecoveryActionGroupId>): {
    newAlerts: Record<string, Alert<State, Context, ActionGroupIds, import("@kbn/alerts-as-data-utils").AADAlert>>;
    activeAlerts: Record<string, Alert<State, Context, ActionGroupIds, import("@kbn/alerts-as-data-utils").AADAlert>>;
    trackedActiveAlerts: Record<string, Alert<State, Context, ActionGroupIds, import("@kbn/alerts-as-data-utils").AADAlert>>;
    recoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupId, import("@kbn/alerts-as-data-utils").AADAlert>>;
    trackedRecoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupId, import("@kbn/alerts-as-data-utils").AADAlert>>;
    delayedAlerts: Record<string, Alert<State, Context, ActionGroupIds | RecoveryActionGroupId, import("@kbn/alerts-as-data-utils").AADAlert>>;
};
export {};
