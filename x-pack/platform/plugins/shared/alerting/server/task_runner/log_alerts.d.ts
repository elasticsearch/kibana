import type { Logger } from '@kbn/core/server';
import type { Alert } from '../alert';
import type { AlertInstanceContext, AlertInstanceState } from '../types';
import type { AlertingEventLogger } from '../lib/alerting_event_logger/alerting_event_logger';
import type { RuleRunMetricsStore } from '../lib/rule_run_metrics_store';
export interface LogAlertsParams<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string> {
    logger: Logger;
    alertingEventLogger: AlertingEventLogger;
    newAlerts: Record<string, Alert<State, Context, ActionGroupIds>>;
    activeAlerts: Record<string, Alert<State, Context, ActionGroupIds>>;
    recoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupId>>;
    ruleLogPrefix: string;
    ruleRunMetricsStore: RuleRunMetricsStore;
    canSetRecoveryContext: boolean;
    shouldLogAlerts: boolean;
    shouldPersistAlerts: boolean;
}
export declare function logAlerts<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>({ logger, alertingEventLogger, newAlerts, activeAlerts, recoveredAlerts, ruleLogPrefix, ruleRunMetricsStore, canSetRecoveryContext, shouldLogAlerts, shouldPersistAlerts, }: LogAlertsParams<State, Context, ActionGroupIds, RecoveryActionGroupId>): void;
