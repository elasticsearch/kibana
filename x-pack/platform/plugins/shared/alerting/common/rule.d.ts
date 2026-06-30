import type { SavedObjectAttributes } from '@kbn/core/server';
import type { SanitizedRule, RuleLastRunOutcomes, AlertsFilterTimeframe, RuleAction, RuleSystemAction, RuleActionParam, AlertsFilter } from '@kbn/alerting-types';
export type { ActionVariable, Rule, SanitizedRule, RuleTypeParams, RuleActionParams, RuleActionParam, IntervalSchedule, RuleActionFrequency, AlertsFilterTimeframe, AlertsFilter, RuleAction, RuleSystemAction, MappedParamsProperties, MappedParams, RuleExecutionStatuses, RuleLastRunOutcomes, RuleExecutionStatus, RuleMonitoringHistory, RuleMonitoringCalculatedMetrics, RuleMonitoringLastRun, RuleMonitoring, RuleLastRun, AlertDelay, SanitizedAlertsFilter, SanitizedRuleAction, AlertsHealth, AlertingFrameworkHealth, ResolvedSanitizedRule, Artifacts, } from '@kbn/alerting-types';
export { RuleExecutionStatusValues, RuleLastRunOutcomeValues, RuleExecutionStatusErrorReasons, RuleExecutionStatusWarningReasons, HealthStatus, } from '@kbn/alerting-types';
export type RuleTypeState = Record<string, unknown>;
export type RuleTypeMetaData = Record<string, unknown>;
export type RuleAlertData = Record<string, unknown>;
export declare const RuleLastRunOutcomeOrderMap: Record<RuleLastRunOutcomes, number>;
export type RuleAlertingOutcome = 'failure' | 'success' | 'unknown' | 'warning';
export type RuleActionAlertsFilterProperty = AlertsFilterTimeframe | RuleActionParam | AlertsFilter['query'];
export type RuleActionKey = keyof RuleAction;
export type RuleSystemActionKey = keyof RuleSystemAction;
export type SanitizedRuleConfig = Pick<SanitizedRule, 'id' | 'name' | 'tags' | 'consumer' | 'enabled' | 'schedule' | 'actions' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt' | 'throttle' | 'notifyWhen' | 'muteAll' | 'revision' | 'snoozeSchedule' | 'alertDelay' | 'lastEnabledAt'> & {
    producer: string;
    ruleTypeId: string;
    ruleTypeName: string;
};
export interface RuleMonitoringLastRunMetrics extends SavedObjectAttributes {
    duration?: number;
    total_search_duration_ms?: number | null;
    total_indexing_duration_ms?: number | null;
    total_alerts_detected?: number | null;
    total_alerts_created?: number | null;
    gap_duration_s?: number | null;
    gap_range?: {
        lte: string;
        gte: string;
    } | null;
    gap_reason?: {
        type: string;
    } | null;
}
