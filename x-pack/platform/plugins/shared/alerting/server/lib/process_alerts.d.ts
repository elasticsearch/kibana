import type { Alert } from '../alert';
import type { AlertInstanceState, AlertInstanceContext } from '../types';
interface ProcessAlertsOpts<State extends AlertInstanceState, Context extends AlertInstanceContext> {
    alerts: Record<string, Alert<State, Context>>;
    existingAlerts: Record<string, Alert<State, Context>>;
    hasReachedAlertLimit: boolean;
    alertLimit: number;
    autoRecoverAlerts: boolean;
    startedAt?: string | null;
}
interface ProcessAlertsResult<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string> {
    newAlerts: Record<string, Alert<State, Context, ActionGroupIds>>;
    activeAlerts: Record<string, Alert<State, Context, ActionGroupIds>>;
    recoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupId>>;
}
export declare function processAlerts<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>({ alerts, existingAlerts, hasReachedAlertLimit, alertLimit, autoRecoverAlerts, startedAt, }: ProcessAlertsOpts<State, Context>): ProcessAlertsResult<State, Context, ActionGroupIds, RecoveryActionGroupId>;
export {};
